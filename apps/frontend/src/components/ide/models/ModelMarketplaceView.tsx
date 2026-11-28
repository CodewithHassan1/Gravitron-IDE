'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Cpu,
  HardDrive,
  Download,
  Pause,
  Play,
  X,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  ExternalLink,
  FolderOpen,
  RefreshCw,
  Loader2,
  Search,
  Star,
} from 'lucide-react';
import type { LocalModelWithStatus, ModelRecommendationTier } from '@ag/protocol';
import { useModelStore } from '@/stores/useModelStore';
import { modelManager } from '@/services/models/ModelManager';
import { cn } from '@/lib/utils';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const gib = bytes / 1024 ** 3;
  if (gib >= 1) return `${gib.toFixed(2)} GB`;
  const mib = bytes / 1024 ** 2;
  if (mib >= 1) return `${mib.toFixed(0)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function tierBadge(tier: ModelRecommendationTier) {
  switch (tier) {
    case 'recommended':
      return {
        label: 'Recommended',
        cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
      };
    case 'possible':
      return {
        label: 'Possible',
        cls: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
      };
    case 'not_recommended':
      return {
        label: 'Not recommended',
        cls: 'bg-red-500/15 text-red-300 border-red-500/40',
      };
    case 'unavailable':
    default:
      return {
        label: 'Unavailable',
        cls: 'bg-zinc-500/15 text-zinc-400 border-zinc-600/40',
      };
  }
}

export interface ModelMarketplaceViewProps {
  compact?: boolean;
  onSelectLocalModel?: (modelId: string) => void;
}

export function ModelMarketplaceView({
  compact = false,
  onSelectLocalModel,
}: ModelMarketplaceViewProps) {
  const {
    localSnapshot,
    localLoading,
    localError,
    refreshLocalModels,
    applyDownloadProgress,
    applyRuntimeStatus,
    setSetupWizardOpen,
  } = useModelStore();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'recommended' | 'installed'>('all');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<LocalModelWithStatus | null>(null);
  const [busyModelId, setBusyModelId] = useState<string | null>(null);

  useEffect(() => {
    void refreshLocalModels();
    const unsubProg = modelManager.subscribeDownloadProgress(applyDownloadProgress);
    const unsubRt = modelManager.subscribeRuntimeStatus(applyRuntimeStatus);
    return () => {
      unsubProg();
      unsubRt();
    };
  }, [refreshLocalModels, applyDownloadProgress, applyRuntimeStatus]);

  const filteredModels = useMemo(() => {
    const models = localSnapshot?.models || [];
    const q = search.trim().toLowerCase();
    return models.filter((m) => {
      if (filter === 'recommended' && m.recommendation.tier !== 'recommended') return false;
      if (filter === 'installed' && m.installState !== 'installed') return false;
      if (!q) return true;
      return (
        m.entry.name.toLowerCase().includes(q) ||
        m.entry.organization.toLowerCase().includes(q) ||
        m.entry.family.toLowerCase().includes(q) ||
        m.entry.license.toLowerCase().includes(q)
      );
    });
  }, [localSnapshot, search, filter]);

  const totalInstalledBytes = useMemo(() => {
    return (localSnapshot?.models || []).reduce(
      (sum, m) => sum + (m.installedRecord?.fileSizeBytes || 0),
      0
    );
  }, [localSnapshot]);

  const handleInstall = async (modelId: string) => {
    setStatusMessage(null);
    const res = await modelManager.installModel(modelId);
    if (!res.started && !res.alreadyInstalled && res.error) {
      setStatusMessage({ type: 'error', text: res.error });
    }
    void refreshLocalModels();
  };

  const handleLoad = async (modelId: string) => {
    setStatusMessage(null);
    setBusyModelId(modelId);
    try {
      const rt = await modelManager.loadModel(modelId);
      if (rt.status === 'running') {
        await modelManager.selectDefaultModel(modelId);
        setStatusMessage({
          type: 'success',
          text: `Loaded ${modelId} on local runtime (127.0.0.1:${rt.port}).`,
        });
        onSelectLocalModel?.(modelId);
      }
      await refreshLocalModels();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to load local model.' });
    } finally {
      setBusyModelId(null);
    }
  };

  const handleUnload = async () => {
    setStatusMessage(null);
    await modelManager.unloadModel();
    await refreshLocalModels();
  };

  const handleVerify = async (modelId: string) => {
    setStatusMessage(null);
    setBusyModelId(modelId);
    try {
      const res = await modelManager.verifyModel(modelId);
      setStatusMessage({ type: res.valid ? 'success' : 'error', text: res.message });
    } finally {
      setBusyModelId(null);
    }
  };

  const handleChangeStorage = async () => {
    setStatusMessage(null);
    const res = await modelManager.selectStorageFolder();
    if (res?.storageDir) {
      setStatusMessage({ type: 'success', text: `Model storage set to ${res.storageDir}` });
      await refreshLocalModels();
    }
  };

  const handleConfirmRemove = async () => {
    if (!confirmRemove) return;
    const target = confirmRemove;
    setConfirmRemove(null);
    const res = await modelManager.removeModel(target.entry.id);
    if (!res.removed) {
      setStatusMessage({ type: 'error', text: res.error || 'Unable to remove model.' });
    } else {
      setStatusMessage({
        type: 'success',
        text: `Removed ${target.entry.name} and freed ${formatBytes(res.freedBytes)}.`,
      });
      await refreshLocalModels();
    }
  };

  if (!modelManager.isAvailable()) {
    return (
      <div className="p-4 rounded-xl border border-amber-800/50 bg-amber-950/30 text-xs text-amber-200">
        Local Model Marketplace requires the Gravitron IDE Windows desktop application.
      </div>
    );
  }

  const hw = localSnapshot?.hardware;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <h3 className="text-base font-semibold text-foreground flex items-center space-x-2">
            <Cpu className="w-4 h-4 text-primary" />
            <span>Local Offline Model Marketplace</span>
          </h3>
          <p className="text-xs text-muted-foreground">
            Run open-weight coding models offline on this PC via bundled llama.cpp (127.0.0.1).
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setSetupWizardOpen(true)}
            className="px-2.5 py-1.5 rounded-md border border-border bg-card hover:bg-muted text-[11px] font-medium text-foreground"
          >
            Setup Wizard
          </button>
          <button
            type="button"
            onClick={() => void refreshLocalModels()}
            disabled={localLoading}
            className="p-1.5 rounded-md border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground"
            title="Refresh hardware & catalogue"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', localLoading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {hw && (
        <div className="p-3 rounded-xl border border-border bg-card/50 space-y-2 text-xs">
          <div className={cn('grid gap-2', compact ? 'grid-cols-1' : 'grid-cols-2 lg:grid-cols-4')}>
            <div className="space-y-0.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Processor</div>
              <div className="font-medium text-foreground truncate" title={hw.cpu.model}>
                {hw.cpu.model}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {hw.cpu.logicalCores} threads · {hw.cpu.architecture}
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Memory</div>
              <div className="font-medium text-foreground">
                {formatBytes(hw.memory.installedRamBytes)} Installed
              </div>
              <div className="text-[11px] text-muted-foreground">
                {formatBytes(hw.memory.usableForInferenceBytes)} usable est.
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Graphics & Backend</div>
              <div className="font-medium text-foreground truncate" title={hw.gpus[0]?.model || 'CPU'}>
                {hw.gpus[0]?.model || 'CPU Inference'}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Backend: {hw.accelerationBackend.toUpperCase()}
                {hw.gpus[0]?.dedicatedVramBytes
                  ? ` · ${formatBytes(hw.gpus[0].dedicatedVramBytes)} VRAM`
                  : ''}
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Model Storage</div>
              <div className="font-medium text-foreground">
                {formatBytes(hw.storage.availableBytes)} Free
              </div>
              <div className="text-[11px] text-muted-foreground truncate" title={localSnapshot?.storageDir}>
                Used: {formatBytes(totalInstalledBytes)} · {localSnapshot?.storageDir}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60">
            <div className="flex items-center space-x-2 text-[11px] text-muted-foreground">
              <span
                className={cn(
                  'inline-flex items-center space-x-1 px-2 py-0.5 rounded-full border',
                  localSnapshot?.runtime.status === 'running'
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                    : 'bg-zinc-500/10 border-border text-muted-foreground'
                )}
              >
                <span>
                  Runtime:{' '}
                  {localSnapshot?.runtime.status === 'running'
                    ? `Running (${localSnapshot.runtime.loadedModelId})`
                    : localSnapshot?.runtime.status || 'stopped'}
                </span>
              </span>
              {localSnapshot?.runtime.status === 'running' && (
                <button
                  type="button"
                  onClick={() => void handleUnload()}
                  className="text-[11px] text-amber-300 hover:underline"
                >
                  Unload Model
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => void handleChangeStorage()}
              className="inline-flex items-center space-x-1 text-[11px] text-primary hover:underline"
            >
              <FolderOpen className="w-3 h-3" />
              <span>Change Storage Folder</span>
            </button>
          </div>
        </div>
      )}

      {(statusMessage || localError) && (
        <div
          className={cn(
            'p-2.5 rounded-lg border text-xs flex items-center space-x-2',
            statusMessage?.type === 'success'
              ? 'border-emerald-800/70 bg-emerald-950/40 text-emerald-200'
              : 'border-red-800/70 bg-red-950/40 text-red-200'
          )}
        >
          {statusMessage?.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span>{statusMessage?.text || localError}</span>
        </div>
      )}

      {confirmRemove && (
        <div className="p-3 rounded-xl border border-red-800/60 bg-red-950/30 space-y-2 text-xs">
          <div className="font-semibold text-red-200">
            Remove {confirmRemove.entry.name}?
          </div>
          <p className="text-red-200/80">
            Deleting local weights will free{' '}
            <strong>{formatBytes(confirmRemove.installedRecord?.fileSizeBytes || 0)}</strong> on disk.
          </p>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => void handleConfirmRemove()}
              className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white font-medium"
            >
              Delete Weights
            </button>
            <button
              type="button"
              onClick={() => setConfirmRemove(null)}
              className="px-3 py-1.5 rounded bg-muted text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models, licenses, or families..."
            className="w-full h-8 pl-8 pr-3 rounded-md border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex items-center space-x-1">
          {(['all', 'recommended', 'installed'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={cn(
                'px-2.5 py-1 rounded-md text-[11px] font-medium border capitalize',
                filter === tab
                  ? 'bg-primary/15 border-primary/50 text-primary'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground'
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2.5">
        {filteredModels.map((item) => {
          const { entry, recommendation, installState, downloadProgress, isLoaded } = item;
          const badge = tierBadge(recommendation.tier);
          const isBusy = busyModelId === entry.id;
          const isDefault = localSnapshot?.defaultModelId === entry.id;

          return (
            <div
              key={entry.id}
              className={cn(
                'p-3.5 rounded-xl border bg-card/50 space-y-2.5 transition-colors',
                isLoaded ? 'border-emerald-500/60 bg-emerald-950/15' : 'border-border'
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold text-foreground">{entry.name}</span>
                    <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-medium', badge.cls)}>
                      {badge.label}
                    </span>
                    {installState === 'installed' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full border bg-emerald-500/15 text-emerald-300 border-emerald-500/40 font-medium">
                        Installed
                      </span>
                    )}
                    {isLoaded && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-semibold">
                        Loaded
                      </span>
                    )}
                    {isDefault && (
                      <span className="inline-flex items-center space-x-0.5 text-[10px] text-amber-300">
                        <Star className="w-3 h-3 fill-amber-300" />
                        <span>Default</span>
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {entry.organization} · {entry.family} · {entry.parameterCount}
                    {entry.activeParameterCount ? ` (${entry.activeParameterCount} active)` : ''} ·{' '}
                    {entry.architecture.toUpperCase()} · {entry.quantization} ·{' '}
                    {formatBytes(entry.downloadSizeBytes)} · License: {entry.license}
                  </div>
                </div>

                <a
                  href={entry.modelCardUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-primary hover:underline inline-flex items-center space-x-1 shrink-0"
                >
                  <span>Model Card</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">{entry.description}</p>

              <div className="flex flex-wrap gap-1.5 text-[10px]">
                <span className="px-2 py-0.5 rounded bg-muted text-foreground">
                  Context: {Math.round(entry.contextWindow / 1024)}k
                </span>
                <span className="px-2 py-0.5 rounded bg-muted text-foreground">
                  Min RAM: {formatBytes(recommendation.memoryEstimate.minimumViableRamBytes)}
                </span>
                <span className="px-2 py-0.5 rounded bg-muted text-foreground">
                  Rec RAM: {formatBytes(recommendation.memoryEstimate.recommendedRamBytes)}
                </span>
                <span className="px-2 py-0.5 rounded bg-muted text-foreground">
                  Tools: {entry.toolCallingTier === 'reliable' ? 'Verified' : entry.toolCallingTier}
                </span>
                {entry.supportsVision && (
                  <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-300">Vision</span>
                )}
              </div>

              <div className="text-[11px] text-muted-foreground bg-background/50 rounded-lg px-2.5 py-1.5 border border-border/50">
                <strong className="text-foreground">Hardware Assessment:</strong> {recommendation.reason}{' '}
                {recommendation.suggestedAlternativeId && (
                  <span className="text-primary">
                    Suggested alternative: {recommendation.suggestedAlternativeId}
                  </span>
                )}
              </div>

              {(installState === 'downloading' || installState === 'paused' || installState === 'verifying') &&
                downloadProgress && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span className="capitalize">{installState}...</span>
                      <span>
                        {formatBytes(downloadProgress.bytesDownloaded)} /{' '}
                        {formatBytes(downloadProgress.totalBytes)} ({downloadProgress.percent}%)
                        {downloadProgress.speedBytesPerSec > 0
                          ? ` · ${formatBytes(downloadProgress.speedBytesPerSec)}/s`
                          : ''}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${downloadProgress.percent}%` }}
                      />
                    </div>
                  </div>
                )}

              {installState === 'error' && downloadProgress?.error && (
                <div className="text-[11px] text-red-300">{downloadProgress.error}</div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                {installState === 'not_installed' && !entry.sharded && (
                  <button
                    type="button"
                    onClick={() => void handleInstall(entry.id)}
                    className="px-3 py-1.5 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium inline-flex items-center space-x-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Install ({formatBytes(entry.downloadSizeBytes)})</span>
                  </button>
                )}

                {installState === 'error' && (
                  <button
                    type="button"
                    onClick={() => void modelManager.resumeDownload(entry.id)}
                    className="px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium inline-flex items-center space-x-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry Download</span>
                  </button>
                )}

                {installState === 'downloading' && (
                  <>
                    <button
                      type="button"
                      onClick={() => void modelManager.pauseDownload(entry.id)}
                      className="px-2.5 py-1 rounded-md border border-border bg-card text-xs inline-flex items-center space-x-1"
                    >
                      <Pause className="w-3 h-3" />
                      <span>Pause</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void modelManager.cancelDownload(entry.id)}
                      className="px-2.5 py-1 rounded-md border border-red-800/60 text-red-300 text-xs inline-flex items-center space-x-1"
                    >
                      <X className="w-3 h-3" />
                      <span>Cancel</span>
                    </button>
                  </>
                )}

                {installState === 'paused' && (
                  <>
                    <button
                      type="button"
                      onClick={() => void modelManager.resumeDownload(entry.id)}
                      className="px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs inline-flex items-center space-x-1"
                    >
                      <Play className="w-3 h-3" />
                      <span>Resume</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void modelManager.cancelDownload(entry.id)}
                      className="px-2.5 py-1 rounded-md border border-red-800/60 text-red-300 text-xs inline-flex items-center space-x-1"
                    >
                      <X className="w-3 h-3" />
                      <span>Cancel</span>
                    </button>
                  </>
                )}

                {installState === 'installed' && (
                  <>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleLoad(entry.id)}
                      className="px-3 py-1.5 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium inline-flex items-center space-x-1.5 disabled:opacity-50"
                    >
                      {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                      <span>{isLoaded ? 'Active in Chat' : 'Load & Use'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleVerify(entry.id)}
                      className="px-2.5 py-1.5 rounded-md border border-border bg-card hover:bg-muted text-xs inline-flex items-center space-x-1"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Verify</span>
                    </button>

                    <button
                      type="button"
                      disabled={isLoaded}
                      onClick={() => setConfirmRemove(item)}
                      title={isLoaded ? 'Unload model before removing' : 'Remove local weights'}
                      className="px-2.5 py-1.5 rounded-md border border-border bg-card hover:bg-red-950/40 text-red-300 text-xs inline-flex items-center space-x-1 disabled:opacity-40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {localSnapshot && localSnapshot.unverifiedCandidates.length > 0 && (
        <div className="p-3 rounded-xl border border-border/60 bg-card/30 text-[11px] text-muted-foreground space-y-1">
          <div className="font-semibold text-foreground">Excluded / Unverified Candidates</div>
          {localSnapshot.unverifiedCandidates.map((u) => (
            <div key={u.name}>
              <strong>{u.name}</strong> ({u.organization}): {u.reason}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
