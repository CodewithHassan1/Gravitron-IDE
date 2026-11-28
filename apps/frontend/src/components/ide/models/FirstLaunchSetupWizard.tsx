'use client';

import React, { useEffect, useState } from 'react';
import { Cpu, HardDrive, FolderOpen, CheckCircle2, Download, ArrowRight, X } from 'lucide-react';
import { useModelStore } from '@/stores/useModelStore';
import { modelManager } from '@/services/models/ModelManager';
import { cn } from '@/lib/utils';

function formatGb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 GB';
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function FirstLaunchSetupWizard() {
  const {
    localSnapshot,
    isSetupWizardOpen,
    setSetupWizardOpen,
    refreshLocalModels,
    applyDownloadProgress,
  } = useModelStore();

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!modelManager.isAvailable()) return;
    void refreshLocalModels().then((snap) => {
      if (snap && !snap.setupCompleted) {
        setSetupWizardOpen(true);
      }
      if (snap) {
        const rec = snap.models.find((m) => m.recommendation.tier === 'recommended');
        if (rec) setSelectedIds([rec.entry.id]);
      }
    });
    const unsub = modelManager.subscribeDownloadProgress(applyDownloadProgress);
    return () => unsub();
  }, [refreshLocalModels, setSetupWizardOpen, applyDownloadProgress]);

  if (!isSetupWizardOpen || !localSnapshot) return null;

  const { hardware, models, storageDir } = localSnapshot;

  const toggleModel = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSkipAll = async () => {
    await modelManager.completeSetup();
    await refreshLocalModels();
    setSetupWizardOpen(false);
  };

  const handleStartDownloads = async () => {
    setStep(5);
    setInstalling(true);
    try {
      for (const id of selectedIds) {
        await modelManager.installModel(id);
      }
    } finally {
      setInstalling(false);
    }
  };

  const handleFinish = async () => {
    await modelManager.completeSetup();
    await refreshLocalModels();
    setSetupWizardOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/80">
          <div className="flex items-center space-x-3">
            <div className="bg-white/95 px-2.5 py-1 rounded-lg shadow-sm">
              <img
                src="/brand/gravitron-logo.png"
                alt="Gravitron IDE"
                className="h-6 w-auto object-contain"
              />
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
              Step {step} of 5
            </span>
          </div>
          <button
            type="button"
            onClick={() => void handleSkipAll()}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center space-x-1"
          >
            <span>Skip Setup</span>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <img
                  src="/brand/gravitron-mark.png"
                  alt="Gravitron"
                  className="w-12 h-12 object-contain rounded-xl bg-background/60 p-1.5 border border-border"
                />
                <div>
                  <h2 className="text-xl font-bold text-foreground">Welcome to Gravitron IDE</h2>
                  <p className="text-xs text-muted-foreground">
                    Configure optional local offline AI models or continue with cloud models only.
                  </p>
                </div>
              </div>
              <div className="p-4 rounded-xl border border-border bg-background/50 text-xs text-muted-foreground space-y-2 leading-relaxed">
                <p>
                  Gravitron IDE includes a bundled <strong>llama.cpp</strong> local inference engine.
                  Installing a compatible open-weight coding model lets your AI Agent read, edit, and
                  run workspace tasks completely offline with zero cloud API charges.
                </p>
                <p>
                  Model weights are downloaded directly from verified official repositories only if you
                  select them and are stored outside Program Files in your chosen user directory.
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Hardware Detection</h2>
              <p className="text-xs text-muted-foreground">
                Recommendations are tailored to this computer&apos;s actual detected resources:
              </p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl border border-border bg-background/50 space-y-1">
                  <div className="text-muted-foreground flex items-center space-x-1.5">
                    <Cpu className="w-3.5 h-3.5 text-primary" />
                    <span>CPU</span>
                  </div>
                  <div className="font-semibold text-foreground">{hardware.cpu.model}</div>
                  <div className="text-muted-foreground">
                    {hardware.cpu.logicalCores} logical cores · {hardware.cpu.architecture}
                  </div>
                </div>
                <div className="p-3 rounded-xl border border-border bg-background/50 space-y-1">
                  <div className="text-muted-foreground">Memory (RAM)</div>
                  <div className="font-semibold text-foreground">
                    {formatGb(hardware.memory.installedRamBytes)} Installed
                  </div>
                  <div className="text-muted-foreground">
                    {formatGb(hardware.memory.usableForInferenceBytes)} usable after OS reserve
                  </div>
                </div>
                <div className="p-3 rounded-xl border border-border bg-background/50 space-y-1">
                  <div className="text-muted-foreground">GPU & Acceleration</div>
                  <div className="font-semibold text-foreground">
                    {hardware.gpus[0]?.model || 'Integrated / CPU'}
                  </div>
                  <div className="text-muted-foreground">
                    Backend: {hardware.accelerationBackend.toUpperCase()}
                  </div>
                </div>
                <div className="p-3 rounded-xl border border-border bg-background/50 space-y-1">
                  <div className="text-muted-foreground flex items-center space-x-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-primary" />
                    <span>Storage Available</span>
                  </div>
                  <div className="font-semibold text-foreground">
                    {formatGb(hardware.storage.availableBytes)} Free
                  </div>
                  <div className="text-muted-foreground truncate">{storageDir}</div>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">Select Local Models (Optional)</h2>
              <p className="text-xs text-muted-foreground">
                Choose hardware-compatible models to download now, or deselect all to continue with
                cloud models only.
              </p>
              <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                {models
                  .filter((m) => !m.entry.sharded)
                  .map((item) => {
                    const { entry, recommendation } = item;
                    const checked = selectedIds.includes(entry.id);
                    const disabled = recommendation.tier === 'unavailable';
                    return (
                      <label
                        key={entry.id}
                        className={cn(
                          'flex items-start space-x-3 p-3 rounded-xl border cursor-pointer text-xs transition-colors',
                          checked
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-background/50 hover:bg-muted/30',
                          disabled && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        <input
                          type="checkbox"
                          disabled={disabled}
                          checked={checked}
                          onChange={() => toggleModel(entry.id)}
                          className="mt-0.5 rounded border-border"
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold text-foreground">{entry.name}</span>
                            <span
                              className={cn(
                                'text-[10px] px-1.5 py-0.5 rounded border',
                                recommendation.tier === 'recommended'
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                                  : recommendation.tier === 'possible'
                                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                                    : 'bg-red-500/15 text-red-300 border-red-500/40'
                              )}
                            >
                              {recommendation.tier.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            Size: {formatGb(entry.downloadSizeBytes)} · Min RAM:{' '}
                            {formatGb(recommendation.memoryEstimate.minimumViableRamBytes)} ·{' '}
                            License: {entry.license}
                          </div>
                          <div className="text-[11px] text-muted-foreground">{recommendation.reason}</div>
                        </div>
                      </label>
                    );
                  })}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Model Storage Location</h2>
              <p className="text-xs text-muted-foreground">
                Large model weights are stored in a writable per-user directory outside Program Files.
              </p>
              <div className="p-3 rounded-xl border border-border bg-background/50 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <div className="font-mono text-foreground truncate">{storageDir}</div>
                  <div className="text-muted-foreground mt-0.5">
                    Available space: {formatGb(hardware.storage.availableBytes)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void modelManager.selectStorageFolder().then(() => refreshLocalModels())}
                  className="px-3 py-1.5 rounded-md border border-border bg-card hover:bg-muted text-foreground inline-flex items-center space-x-1.5 shrink-0"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Browse</span>
                </button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Download & Installation</h2>
              {selectedIds.length === 0 ? (
                <div className="p-4 rounded-xl border border-border bg-background/50 text-xs text-muted-foreground flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    No local models queued. You can download local models anytime from Agent Settings
                    or the AI Chat model selector.
                  </span>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {selectedIds.map((id) => {
                    const item = models.find((m) => m.entry.id === id);
                    if (!item) return null;
                    const prog = item.downloadProgress;
                    return (
                      <div key={id} className="p-3 rounded-xl border border-border bg-background/50 space-y-1.5 text-xs">
                        <div className="flex justify-between font-medium text-foreground">
                          <span>{item.entry.name}</span>
                          <span className="capitalize">{item.installState}</span>
                        </div>
                        {prog && (
                          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${prog.percent}%` }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-card/80 text-xs">
          <div>
            {step > 1 && step < 5 && (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as any)}
                className="px-3 py-1.5 rounded-md border border-border text-foreground hover:bg-muted"
              >
                Back
              </button>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {step < 4 && (
              <button
                type="button"
                onClick={() => setStep((s) => (s + 1) as any)}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium inline-flex items-center space-x-1.5"
              >
                <span>Continue</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
            {step === 4 && (
              <button
                type="button"
                onClick={() => void handleStartDownloads()}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium inline-flex items-center space-x-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{selectedIds.length > 0 ? 'Install Selected Models' : 'Continue (Cloud Only)'}</span>
              </button>
            )}
            {step === 5 && (
              <button
                type="button"
                disabled={installing}
                onClick={() => void handleFinish()}
                className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
              >
                Finish & Launch IDE
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
