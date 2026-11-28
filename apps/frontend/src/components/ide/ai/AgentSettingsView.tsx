'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AgentProtocol } from '@ag/protocol';
import { AgentManager } from '../../../services/ai/AgentManager';
import { formatDurationReadable } from './CommandExecutionCard';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  Shield,
  RotateCcw,
  KeyRound,
  Cpu,
  Eye,
  EyeOff,
  Loader2,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Trash2,
  HardDrive,
  Crown,
} from 'lucide-react';
import { ModelMarketplaceView } from '../models/ModelMarketplaceView';
import { useModelStore } from '@/stores/useModelStore';
import { useAuthStore } from '@/stores/auth';

const HARD_CEILING_SECONDS = 1800; // 30 minutes max enforced on backend

const DEFAULT_POLICY: AgentProtocol.AgentTimeoutPolicy = {
  defaultTimeoutMs: 120_000,
  maxPermittedTimeoutMs: 600_000,
  allowAgentExtension: true,
  requireConfirmationForLongCommands: true,
  terminationGracePeriodMs: 5_000,
  warningThresholdRatio: 0.75,
  criticalThresholdRatio: 0.9,
};

const TIMEOUT_PRESETS = [
  { label: 'Short (30s)', seconds: 30 },
  { label: 'Normal (2m)', seconds: 120 },
  { label: 'Long (5m)', seconds: 300 },
  { label: 'Extended (10m)', seconds: 600 },
];

export type AgentSettingsSection = 'providers' | 'models' | 'timeouts' | 'specialists';

interface AgentSettingsViewProps {
  initialSection?: AgentSettingsSection;
  compact?: boolean;
  onProviderConfigChanged?: (config: AgentProtocol.GetProviderConfigResponsePayload) => void;
}

export function AgentSettingsView({
  initialSection = 'providers',
  compact = false,
  onProviderConfigChanged,
}: AgentSettingsViewProps) {
  const [section, setSection] = useState<AgentSettingsSection>(initialSection);
  const [ipcAvailable, setIpcAvailable] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Provider configuration state
  const [providerConfig, setProviderConfig] =
    useState<AgentProtocol.GetProviderConfigResponsePayload | null>(null);
  const [selectedProvider, setSelectedProvider] =
    useState<AgentProtocol.SupportedProviderType>('gemini');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.5-flash');
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [baseUrlInput, setBaseUrlInput] = useState<string>('');
  const [savingProvider, setSavingProvider] = useState<boolean>(false);
  const [testingProvider, setTestingProvider] = useState<boolean>(false);
  const [testResult, setTestResult] =
    useState<AgentProtocol.TestProviderConfigResponsePayload | null>(null);

  // Timeout settings state
  const [savingTimeout, setSavingTimeout] = useState<boolean>(false);
  const [defaultTimeoutSec, setDefaultTimeoutSec] = useState<number>(120);
  const [maxTimeoutSec, setMaxTimeoutSec] = useState<number>(600);
  const [gracePeriodSec, setGracePeriodSec] = useState<number>(5);
  const [allowAgentExtension, setAllowAgentExtension] = useState<boolean>(true);
  const [requireConfirmationForLongCommands, setRequireConfirmationForLongCommands] =
    useState<boolean>(true);

  // AgentRouter specialists state
  const [specialistsStatus, setSpecialistsStatus] =
    useState<AgentProtocol.SpecialistsStatusResponsePayload | null>(null);
  const [routerEndpoint, setRouterEndpoint] = useState<string>('https://agent-router.org/mcp');
  const [discoveringSpecialists, setDiscoveringSpecialists] = useState<boolean>(false);
  const [togglingSpecialist, setTogglingSpecialist] = useState<string | null>(null);

  const agentManager = useMemo(() => new AgentManager(), []);
  const entitlements = useModelStore((s) => s.entitlements);
  const fetchEntitlements = useModelStore((s) => s.fetchEntitlements);
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (accessToken && !entitlements) {
      void fetchEntitlements(accessToken);
    }
  }, [accessToken, entitlements, fetchEntitlements]);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  const applyPolicyToForm = useCallback((policy: AgentProtocol.AgentTimeoutPolicy) => {
    setDefaultTimeoutSec(Math.round(policy.defaultTimeoutMs / 1000));
    setMaxTimeoutSec(Math.round(policy.maxPermittedTimeoutMs / 1000));
    setGracePeriodSec(Math.max(1, Math.round(policy.terminationGracePeriodMs / 1000)));
    setAllowAgentExtension(policy.allowAgentExtension);
    setRequireConfirmationForLongCommands(policy.requireConfirmationForLongCommands);
  }, []);

  const loadAllSettings = useCallback(async () => {
    const available = agentManager.isAvailable();
    setIpcAvailable(available);

    if (!available) {
      setLoading(false);
      return;
    }

    try {
      const [provCfg, policy, specStatus] = await Promise.all([
        agentManager.getProviderConfig(),
        agentManager.getTimeoutPolicy(),
        agentManager.getSpecialistsStatus(),
      ]);

      if (provCfg) {
        setProviderConfig(provCfg);
        setSelectedProvider(provCfg.activeProvider);
        setSelectedModel(provCfg.activeModel);
      }
      if (policy) {
        applyPolicyToForm(policy);
      }
      if (specStatus) {
        setSpecialistsStatus(specStatus);
        if (specStatus.endpoint) setRouterEndpoint(specStatus.endpoint);
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Failed to load Agent Settings.',
      });
    } finally {
      setLoading(false);
    }
  }, [agentManager, applyPolicyToForm]);

  useEffect(() => {
    void loadAllSettings();
  }, [loadAllSettings]);

  const activeProviderMeta = useMemo(
    () => providerConfig?.providers.find((p) => p.type === selectedProvider),
    [providerConfig, selectedProvider]
  );

  const handleSelectProvider = (type: AgentProtocol.SupportedProviderType) => {
    setSelectedProvider(type);
    const meta = providerConfig?.providers.find((p) => p.type === type);
    if (meta) {
      setSelectedModel(
        type === providerConfig?.activeProvider && providerConfig.activeModel
          ? providerConfig.activeModel
          : meta.defaultModel
      );
    }
    setApiKeyInput('');
    setTestResult(null);
    setFeedback(null);
  };

  const handleSaveProvider = async () => {
    setFeedback(null);
    setTestResult(null);
    if (!agentManager.isAvailable()) {
      setFeedback({
        type: 'error',
        text: 'Desktop IPC bridge unavailable. Open inside Gravitron IDE desktop app.',
      });
      return;
    }

    setSavingProvider(true);
    try {
      const payload: AgentProtocol.SetProviderConfigRequestPayload = {
        providerType: selectedProvider,
        model: selectedModel,
        ...(apiKeyInput.trim().length > 0 ? { apiKey: apiKeyInput.trim() } : {}),
        ...(baseUrlInput.trim().length > 0 ? { baseURL: baseUrlInput.trim() } : {}),
      };
      const res = await agentManager.setProviderConfig(payload);
      if (!res.success) {
        setFeedback({ type: 'error', text: res.error || 'Failed to save provider config.' });
        return;
      }
      const updated = await agentManager.getProviderConfig();
      setProviderConfig(updated);
      setApiKeyInput('');
      onProviderConfigChanged?.(updated);
      setFeedback({
        type: 'success',
        text: `${activeProviderMeta?.name || selectedProvider} saved & activated (${selectedModel}). ${
          res.isConfigured ? 'API key stored in encrypted credential vault.' : 'No API key stored.'
        }`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Failed to save provider config.' });
    } finally {
      setSavingProvider(false);
    }
  };

  const handleClearProviderKey = async () => {
    setFeedback(null);
    setTestResult(null);
    if (!agentManager.isAvailable()) return;

    setSavingProvider(true);
    try {
      await agentManager.setProviderConfig({
        providerType: selectedProvider,
        apiKey: '',
        model: selectedModel,
      });
      const updated = await agentManager.getProviderConfig();
      setProviderConfig(updated);
      setApiKeyInput('');
      onProviderConfigChanged?.(updated);
      setFeedback({
        type: 'success',
        text: `Cleared stored credential for ${activeProviderMeta?.name || selectedProvider}.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Failed to clear credential.' });
    } finally {
      setSavingProvider(false);
    }
  };

  const handleTestProvider = async () => {
    setFeedback(null);
    setTestResult(null);
    if (!agentManager.isAvailable()) {
      setFeedback({
        type: 'error',
        text: 'Desktop IPC bridge unavailable. Launch Gravitron IDE desktop to test connections.',
      });
      return;
    }

    setTestingProvider(true);
    try {
      const res = await agentManager.testProviderConfig({
        providerType: selectedProvider,
        model: selectedModel,
        ...(apiKeyInput.trim().length > 0 ? { apiKey: apiKeyInput.trim() } : {}),
        ...(baseUrlInput.trim().length > 0 ? { baseURL: baseUrlInput.trim() } : {}),
      });
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        providerType: selectedProvider,
        model: selectedModel,
        latencyMs: 0,
        error: err?.message || 'Provider connection test failed.',
      });
    } finally {
      setTestingProvider(false);
    }
  };

  const handleSaveTimeoutPolicy = async () => {
    setFeedback(null);

    if (maxTimeoutSec < 10 || maxTimeoutSec > HARD_CEILING_SECONDS) {
      setFeedback({
        type: 'error',
        text: `Maximum permitted timeout must be between 10s and ${formatDurationReadable(HARD_CEILING_SECONDS * 1000)}.`,
      });
      return;
    }

    if (defaultTimeoutSec < 1 || defaultTimeoutSec > maxTimeoutSec) {
      setFeedback({
        type: 'error',
        text: 'Default timeout must be between 1s and your configured maximum permitted timeout.',
      });
      return;
    }

    if (gracePeriodSec < 1 || gracePeriodSec > 30) {
      setFeedback({
        type: 'error',
        text: 'Termination grace period must be between 1s and 30s.',
      });
      return;
    }

    if (!agentManager.isAvailable()) {
      setFeedback({
        type: 'error',
        text: 'Desktop IPC bridge unavailable. Open settings inside Gravitron IDE desktop to persist changes.',
      });
      return;
    }

    setSavingTimeout(true);
    try {
      const saved = await agentManager.setTimeoutPolicy({
        defaultTimeoutMs: defaultTimeoutSec * 1000,
        maxPermittedTimeoutMs: maxTimeoutSec * 1000,
        terminationGracePeriodMs: gracePeriodSec * 1000,
        allowAgentExtension,
        requireConfirmationForLongCommands,
      });
      applyPolicyToForm(saved);
      setFeedback({
        type: 'success',
        text: `Saved timeout policy (Default: ${formatDurationReadable(saved.defaultTimeoutMs)}, Max: ${formatDurationReadable(saved.maxPermittedTimeoutMs)}).`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Failed to save timeout settings.',
      });
    } finally {
      setSavingTimeout(false);
    }
  };

  const handleResetDefaults = async () => {
    setFeedback(null);
    applyPolicyToForm(DEFAULT_POLICY);

    if (!agentManager.isAvailable()) return;

    setSavingTimeout(true);
    try {
      const saved = await agentManager.setTimeoutPolicy(DEFAULT_POLICY);
      applyPolicyToForm(saved);
      setFeedback({ type: 'success', text: 'Restored default agent timeout policy.' });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Failed to reset policy.' });
    } finally {
      setSavingTimeout(false);
    }
  };

  const handleDiscoverSpecialists = async () => {
    setFeedback(null);
    if (!agentManager.isAvailable()) {
      setFeedback({
        type: 'error',
        text: 'Desktop IPC bridge unavailable. Launch Gravitron IDE desktop to connect AgentRouter.',
      });
      return;
    }

    setDiscoveringSpecialists(true);
    try {
      const status = await agentManager.discoverSpecialists({
        endpoint: routerEndpoint.trim() || 'https://agent-router.org/mcp',
        timeoutMs: 15000,
      });
      setSpecialistsStatus(status);
      if (status.connected) {
        setFeedback({
          type: 'success',
          text: `Connected to AgentRouter: ${status.discoveredCount} remote tools discovered, ${status.registeredCount} approved specialists registered.`,
        });
      } else {
        setFeedback({
          type: 'error',
          text: status.error || 'Unable to connect to AgentRouter MCP endpoint.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'AgentRouter specialist discovery failed.',
      });
    } finally {
      setDiscoveringSpecialists(false);
    }
  };

  const handleToggleSpecialist = async (name: string, nextEnabled: boolean) => {
    if (!agentManager.isAvailable()) return;
    setTogglingSpecialist(name);
    setFeedback(null);
    try {
      const status = await agentManager.setSpecialistEnabled(name, nextEnabled);
      setSpecialistsStatus(status);
      if (status.error) {
        setFeedback({ type: 'error', text: status.error });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Failed to update specialist state.' });
    } finally {
      setTogglingSpecialist(null);
    }
  };

  return (
    <div className={cn('space-y-4 overflow-x-hidden min-w-0', compact ? 'text-xs' : 'max-w-2xl')}>
      {/* Section Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => {
            setSection('providers');
            setFeedback(null);
          }}
          className={cn(
            'inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border',
            section === 'providers'
              ? 'bg-primary/15 border-primary/50 text-primary'
              : 'bg-card/50 border-border text-muted-foreground hover:text-foreground'
          )}
        >
          <KeyRound className="w-3.5 h-3.5 shrink-0" />
          <span>{compact ? 'Providers' : 'Providers & Credentials'}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSection('models');
            setFeedback(null);
          }}
          className={cn(
            'inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border',
            section === 'models'
              ? 'bg-primary/15 border-primary/50 text-primary'
              : 'bg-card/50 border-border text-muted-foreground hover:text-foreground'
          )}
        >
          <HardDrive className="w-3.5 h-3.5 shrink-0" />
          <span>{compact ? 'Models' : 'Local Models'}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSection('timeouts');
            setFeedback(null);
          }}
          className={cn(
            'inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border',
            section === 'timeouts'
              ? 'bg-primary/15 border-primary/50 text-primary'
              : 'bg-card/50 border-border text-muted-foreground hover:text-foreground'
          )}
        >
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>{compact ? 'Timeouts' : 'Execution Timeouts'}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSection('specialists');
            setFeedback(null);
          }}
          className={cn(
            'inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border',
            section === 'specialists'
              ? 'bg-primary/15 border-primary/50 text-primary'
              : 'bg-card/50 border-border text-muted-foreground hover:text-foreground'
          )}
        >
          <Cpu className="w-3.5 h-3.5 shrink-0" />
          <span>{compact ? 'Specialists' : 'AgentRouter Specialists'}</span>
        </button>
      </div>

      {!ipcAvailable && !loading && (
        <div className="p-3 rounded-lg border border-amber-800/60 bg-amber-950/30 text-xs text-amber-200 flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            Running outside Electron desktop runtime. Launch Gravitron IDE desktop to load,
            test, and persist Agent settings securely.
          </span>
        </div>
      )}

      {feedback && (
        <div
          className={cn(
            'p-3 rounded-lg border text-xs flex items-center space-x-2',
            feedback.type === 'success'
              ? 'border-emerald-800/70 bg-emerald-950/40 text-emerald-200'
              : 'border-red-800/70 bg-red-950/40 text-red-200'
          )}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span className="break-words">{feedback.text}</span>
        </div>
      )}

      {/* 1. PROVIDERS & CREDENTIALS */}
      {section === 'providers' && (
        <div className="space-y-4">
          {entitlements && (
            <div className="p-3 rounded-lg border border-border bg-card/60 flex items-center justify-between gap-2">
              <div className="flex items-center space-x-2 min-w-0">
                <Crown className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-foreground">
                    Gravitron Plan: {entitlements.plan}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    Status: {entitlements.subscriptionStatus} · Monthly tokens:{' '}
                    {entitlements.quotas.maxAgentTokens.toLocaleString()}
                  </div>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded bg-primary/15 text-primary text-[10px] font-semibold shrink-0">
                {entitlements.permittedCloudModels.length} Cloud Models
              </span>
            </div>
          )}

          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground flex items-center space-x-2">
              <KeyRound className="w-4 h-4 text-primary" />
              <span>AI Providers & Encrypted Credentials</span>
            </h3>
            <p className="text-xs text-muted-foreground">
              API keys are stored encrypted in the main process via OS keychain (Electron
              safeStorage) and never exposed back to the UI.
            </p>
          </div>

          <div className={cn('grid gap-2', compact ? 'grid-cols-1' : 'grid-cols-3')}>
            {(['gemini', 'anthropic', 'openai'] as AgentProtocol.SupportedProviderType[]).map(
              (type) => {
                const meta = providerConfig?.providers.find((p) => p.type === type);
                const label =
                  meta?.name ||
                  (type === 'gemini'
                    ? 'Google Gemini'
                    : type === 'anthropic'
                      ? 'Anthropic Claude'
                      : 'OpenAI');
                const isSelected = selectedProvider === type;
                const isActive = providerConfig?.activeProvider === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleSelectProvider(type)}
                    className={cn(
                      'p-2.5 rounded-xl border text-left transition-colors min-w-0',
                      compact ? 'flex items-center justify-between gap-2' : 'space-y-1',
                      isSelected
                        ? 'bg-primary/10 border-primary text-foreground'
                        : 'bg-card/50 border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <div className="flex items-center space-x-1.5 min-w-0">
                      <span className="font-semibold text-xs truncate">{label}</span>
                      {isActive && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-semibold shrink-0">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] shrink-0">
                      {meta?.isConfigured ? (
                        <span className="text-emerald-400">● Configured</span>
                      ) : (
                        <span className="text-zinc-500">○ Key needed</span>
                      )}
                    </div>
                  </button>
                );
              }
            )}
          </div>

          <div className="space-y-4 bg-card/50 border border-border rounded-xl p-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Default Model</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full h-9 bg-background border border-border rounded-md px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {(
                  activeProviderMeta?.supportedModels || [selectedModel]
                ).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">
                  API Key ({activeProviderMeta?.name || selectedProvider})
                </label>
                {activeProviderMeta?.isConfigured && (
                  <span className="text-[10px] text-emerald-400 font-medium">
                    Stored in OS Vault (leave blank to keep existing)
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <div className="relative flex-1">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={
                      activeProviderMeta?.isConfigured
                        ? '•••••••••••••••• (configured — enter new key to replace)'
                        : 'Paste API key...'
                    }
                    className="w-full h-9 bg-background border border-border rounded-md px-3 pr-9 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                    title={showApiKey ? 'Hide key' : 'Show key'}
                  >
                    {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                {activeProviderMeta?.isConfigured && (
                  <button
                    type="button"
                    disabled={savingProvider}
                    onClick={() => void handleClearProviderKey()}
                    title="Remove stored API key"
                    className="h-9 px-2.5 rounded-md border border-border bg-background hover:bg-red-950/40 hover:border-red-800/60 text-muted-foreground hover:text-red-300 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Custom Base URL <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <input
                type="url"
                value={baseUrlInput}
                onChange={(e) => setBaseUrlInput(e.target.value)}
                placeholder="Leave blank for official provider endpoint"
                className="w-full h-9 bg-background border border-border rounded-md px-3 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {testResult && (
              <div
                className={cn(
                  'p-2.5 rounded-lg border text-xs flex items-start space-x-2',
                  testResult.success
                    ? 'border-emerald-800/70 bg-emerald-950/40 text-emerald-200'
                    : 'border-red-800/70 bg-red-950/40 text-red-200'
                )}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5 min-w-0">
                  <div className="font-semibold">
                    {testResult.success
                      ? `Connection Verified (${testResult.latencyMs}ms)`
                      : 'Connection Test Failed'}
                  </div>
                  <div className="text-[11px] opacity-90 break-words">
                    {testResult.message || testResult.error}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                disabled={savingProvider || loading || !ipcAvailable}
                onClick={() => void handleSaveProvider()}
                className="px-4 py-2 bg-primary text-primary-foreground text-xs font-medium rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {savingProvider ? 'Saving...' : 'Save & Activate'}
              </button>

              <button
                type="button"
                disabled={testingProvider || loading || !ipcAvailable}
                onClick={() => void handleTestProvider()}
                className="px-3.5 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-medium rounded-md inline-flex items-center space-x-1.5 disabled:opacity-50 transition-colors"
              >
                {testingProvider ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <PlugZap className="w-3.5 h-3.5 text-primary" />
                )}
                <span>{testingProvider ? 'Testing...' : 'Test Connection'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. EXECUTION TIMEOUTS */}
      {section === 'timeouts' && (
        <div className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground flex items-center space-x-2">
              <Clock className="w-4 h-4 text-primary" />
              <span>Command Timeout & Process Termination</span>
            </h3>
            <p className="text-xs text-muted-foreground">
              Configure backend-enforced command timeouts, warning thresholds (75% / 90%), grace
              periods, and bounded extensions.
            </p>
          </div>

          <div className="space-y-4 bg-card/50 border border-border rounded-xl p-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">
                  Default Command Timeout
                </label>
                <span className="text-xs font-mono text-primary font-semibold">
                  {formatDurationReadable(defaultTimeoutSec * 1000)}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {TIMEOUT_PRESETS.map((preset) => (
                  <button
                    key={preset.seconds}
                    type="button"
                    onClick={() => {
                      setDefaultTimeoutSec(preset.seconds);
                      if (preset.seconds > maxTimeoutSec) {
                        setMaxTimeoutSec(preset.seconds);
                      }
                    }}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-xs border transition-colors',
                      defaultTimeoutSec === preset.seconds
                        ? 'bg-primary/20 border-primary text-primary font-medium'
                        : 'bg-background border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center space-x-3 pt-1">
                <input
                  type="number"
                  min={1}
                  max={maxTimeoutSec}
                  value={defaultTimeoutSec}
                  onChange={(e) => setDefaultTimeoutSec(Math.max(1, Number(e.target.value) || 1))}
                  className="w-28 h-8 bg-background border border-border rounded-md px-2.5 text-xs font-mono text-foreground"
                />
                <span className="text-xs text-muted-foreground">seconds (default: 2m 0s)</span>
              </div>
            </div>

            <div className="space-y-2 pt-3 border-t border-border">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foreground flex items-center space-x-1.5">
                  <Shield className="w-3.5 h-3.5 text-primary" />
                  <span>Maximum Permitted Timeout</span>
                </label>
                <span className="text-xs font-mono text-primary font-semibold">
                  {formatDurationReadable(maxTimeoutSec * 1000)}
                </span>
              </div>
              <div className="flex items-center space-x-3">
                <input
                  type="number"
                  min={10}
                  max={HARD_CEILING_SECONDS}
                  value={maxTimeoutSec}
                  onChange={(e) => setMaxTimeoutSec(Math.max(10, Number(e.target.value) || 10))}
                  className="w-28 h-8 bg-background border border-border rounded-md px-2.5 text-xs font-mono text-foreground"
                />
                <span className="text-xs text-muted-foreground">
                  seconds (ceiling: {formatDurationReadable(HARD_CEILING_SECONDS * 1000)})
                </span>
              </div>
            </div>

            <div className="space-y-2 pt-3 border-t border-border">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">
                  Termination Grace Period
                </label>
                <span className="text-xs font-mono text-primary font-semibold">
                  {formatDurationReadable(gracePeriodSec * 1000)}
                </span>
              </div>
              <div className="flex items-center space-x-3">
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={gracePeriodSec}
                  onChange={(e) =>
                    setGracePeriodSec(Math.min(30, Math.max(1, Number(e.target.value) || 1)))
                  }
                  className="w-28 h-8 bg-background border border-border rounded-md px-2.5 text-xs font-mono text-foreground"
                />
                <span className="text-xs text-muted-foreground">
                  seconds (1s – 30s before forced process-tree termination)
                </span>
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t border-border">
              <label className="flex items-start space-x-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowAgentExtension}
                  onChange={(e) => setAllowAgentExtension(e.target.checked)}
                  className="mt-0.5 rounded border-border"
                />
                <div className="text-xs">
                  <div className="font-medium text-foreground">
                    Allow agent to request additional execution time
                  </div>
                  <div className="text-muted-foreground">
                    Permits bounded extensions up to your configured maximum.
                  </div>
                </div>
              </label>

              <label className="flex items-start space-x-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requireConfirmationForLongCommands}
                  onChange={(e) => setRequireConfirmationForLongCommands(e.target.checked)}
                  className="mt-0.5 rounded border-border"
                />
                <div className="text-xs">
                  <div className="font-medium text-foreground">
                    Require confirmation for long-running commands
                  </div>
                  <div className="text-muted-foreground">
                    Commands exceeding default timeout prompt for explicit approval.
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              disabled={savingTimeout || loading || !ipcAvailable}
              onClick={() => void handleSaveTimeoutPolicy()}
              className="px-4 py-2 bg-primary text-primary-foreground text-xs font-medium rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {savingTimeout ? 'Saving...' : 'Save Timeout Settings'}
            </button>
            <button
              type="button"
              disabled={savingTimeout || loading}
              onClick={() => void handleResetDefaults()}
              className="px-3 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-medium rounded-md inline-flex items-center space-x-1.5 disabled:opacity-50 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. AGENTROUTER SPECIALISTS */}
      {section === 'specialists' && (
        <div className="space-y-4 min-w-0">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground flex items-center space-x-2">
              <Cpu className="w-4 h-4 text-primary shrink-0" />
              <span className="truncate">AgentRouter Specialists</span>
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Connect anonymously to AgentRouter MCP to register approved specialist agents.
              Specialists have zero access to local files, secrets, or terminal execution.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-card/50 border border-border space-y-2.5 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
              <div className="flex items-center space-x-1.5 min-w-0">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-medium text-foreground truncate">
                  {specialistsStatus?.connected ? 'Connected to AgentRouter' : 'Ready to Discover'}
                </span>
              </div>
              {specialistsStatus && (
                <span className="text-[11px] text-muted-foreground font-mono shrink-0">
                  {specialistsStatus.registeredCount}/{specialistsStatus.approvedCount} active
                </span>
              )}
            </div>

            <div className={cn('flex gap-2 min-w-0', compact ? 'flex-col' : 'items-center')}>
              <input
                type="url"
                value={routerEndpoint}
                onChange={(e) => setRouterEndpoint(e.target.value)}
                className="w-full min-w-0 flex-1 h-8 bg-background border border-border rounded-md px-2.5 text-xs font-mono text-foreground"
                placeholder="https://agent-router.org/mcp"
              />
              <button
                type="button"
                disabled={discoveringSpecialists || !ipcAvailable}
                onClick={() => void handleDiscoverSpecialists()}
                className={cn(
                  'h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium inline-flex items-center justify-center space-x-1.5 hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0',
                  compact && 'w-full'
                )}
              >
                {discoveringSpecialists ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span>{discoveringSpecialists ? 'Discovering...' : 'Discover Specialists'}</span>
              </button>
            </div>
          </div>

          <div className="space-y-2 max-h-[360px] overflow-y-auto overflow-x-hidden pr-1">
            {(specialistsStatus?.specialists || []).map((spec) => (
              <div
                key={spec.name}
                className={cn(
                  'p-2.5 rounded-xl bg-card/50 border border-border gap-2 min-w-0',
                  compact ? 'flex flex-col' : 'flex items-start justify-between'
                )}
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                    <span className="font-mono font-semibold text-xs text-foreground truncate max-w-full">
                      {spec.name}
                    </span>
                    <span
                      className={cn(
                        'px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0',
                        spec.riskLevel === 'execute'
                          ? 'bg-red-950/50 text-red-300 border-red-800/70'
                          : spec.riskLevel === 'write'
                            ? 'bg-amber-950/50 text-amber-300 border-amber-800/70'
                            : 'bg-sky-950/50 text-sky-300 border-sky-800/70'
                      )}
                    >
                      {spec.riskLevel}
                    </span>
                    {spec.discovered && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950/50 text-emerald-300 border border-emerald-800/60 shrink-0">
                        discovered
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug break-words">
                    {spec.description}
                  </p>
                </div>

                <label className="inline-flex items-center space-x-1.5 shrink-0 cursor-pointer pt-0.5">
                  <input
                    type="checkbox"
                    checked={spec.enabled}
                    disabled={togglingSpecialist === spec.name || !ipcAvailable}
                    onChange={(e) => void handleToggleSpecialist(spec.name, e.target.checked)}
                    className="rounded border-border"
                  />
                  <span className="text-[11px] text-muted-foreground">
                    {spec.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 1B. LOCAL OFFLINE MODELS MARKETPLACE */}
      {section === 'models' && <ModelMarketplaceView compact={compact} />}
    </div>
  );
}
