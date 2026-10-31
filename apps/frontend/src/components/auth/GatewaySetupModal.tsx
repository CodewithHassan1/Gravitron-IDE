"use client"
import React, { useState, useEffect } from 'react';
import { getGatewayUrl, setGatewayUrl, clearGatewayUrl, validateGatewayUrl, isProductionRuntime } from '../../utils/gateway';

interface GatewaySetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigured: (newUrl: string) => void;
}

export function GatewaySetupModal({ isOpen, onClose, onConfigured }: GatewaySetupModalProps) {
  const [urlInput, setUrlInput] = useState('');
  const [validationError, setValidationError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const isProd = isProductionRuntime();

  useEffect(() => {
    if (isOpen) {
      const current = getGatewayUrl() || '';
      setUrlInput(current);
      setValidationError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');

    const validation = validateGatewayUrl(urlInput, isProd);
    if (!validation.valid || !validation.normalizedUrl) {
      setValidationError(validation.error || 'Please enter a valid URL.');
      return;
    }

    setIsSaving(true);
    try {
      const savedUrl = await setGatewayUrl(validation.normalizedUrl);
      onConfigured(savedUrl);
      onClose();
    } catch (err: any) {
      setValidationError(err.message || 'Failed to save configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUseLocalhost = async () => {
    setIsSaving(true);
    try {
      const savedUrl = await setGatewayUrl('http://localhost:8080');
      onConfigured(savedUrl);
      onClose();
    } catch (err: any) {
      setValidationError(err.message || 'Failed to set localhost Gateway.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    setIsSaving(true);
    try {
      await clearGatewayUrl();
      setUrlInput('');
      onConfigured('');
      onClose();
    } catch (err: any) {
      setValidationError(err.message || 'Failed to clear configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl text-card-foreground">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">Backend Connection Settings</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-sm font-bold p-1 rounded"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <p className="text-sm text-muted-foreground mt-3">
          Gravitron IDE connects to your organization&apos;s API Gateway over HTTPS to manage authentication and workspaces.
        </p>

        <form onSubmit={handleSave} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Gateway Endpoint URL
            </label>
            <input
              type="text"
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value);
                setValidationError('');
              }}
              placeholder={isProd ? "https://gateway.yourdomain.com" : "http://localhost:8080"}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />
            {isProd && (
              <p className="text-xs text-muted-foreground mt-1">
                Note: In production, non-local endpoints must use HTTPS.
              </p>
            )}
            {validationError && (
              <p className="text-xs text-destructive mt-1 font-medium text-red-500">
                {validationError}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save & Connect'}
            </button>

            {!isProd && (
              <button
                type="button"
                onClick={handleUseLocalhost}
                disabled={isSaving}
                className="w-full rounded-md border border-border bg-secondary py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
              >
                Use Local Development Gateway (http://localhost:8080)
              </button>
            )}

            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={handleClear}
                disabled={isSaving}
                className="text-xs text-destructive hover:underline text-red-400"
              >
                Reset to Default
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
