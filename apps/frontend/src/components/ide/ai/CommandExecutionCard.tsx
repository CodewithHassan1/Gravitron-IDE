'use client';

import React, { useEffect, useState } from 'react';
import { AgentProtocol } from '@ag/protocol';
import { cn } from '@/lib/utils';
import {
  Terminal,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Ban,
  ShieldAlert,
  ChevronRight,
  Loader2,
  Plus,
} from 'lucide-react';

export function formatDurationReadable(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function isExecutionActive(
  status: AgentProtocol.ActiveCommandExecutionSnapshot['status']
): boolean {
  return (
    status === 'running' ||
    status === 'warning' ||
    status === 'critical' ||
    status === 'terminating'
  );
}

interface CommandExecutionCardProps {
  execution: AgentProtocol.ActiveCommandExecutionSnapshot;
  onExtend?: (commandId: string, additionalMs: number) => Promise<void> | void;
  onCancel?: (commandId: string) => Promise<void> | void;
}

/**
 * Isolated memoized execution card. Maintains its own 1s clock interval while
 * running so parent chat stream components do not re-render every second.
 */
export const CommandExecutionCard = React.memo(function CommandExecutionCard({
  execution,
  onExtend,
  onCancel,
}: CommandExecutionCardProps) {
  const active = isExecutionActive(execution.status);
  const [now, setNow] = useState<number>(() => Date.now());
  const [outputOpen, setOutputOpen] = useState<boolean>(active);
  const [isExtending, setIsExtending] = useState<boolean>(false);

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [active]);

  const elapsedMs = active
    ? Math.max(0, now - execution.startedAt)
    : execution.elapsedMs ?? Math.max(0, execution.deadlineAt - execution.startedAt);
  const remainingMs = active ? Math.max(0, execution.deadlineAt - now) : 0;
  const totalMs = Math.max(1000, execution.configuredTimeoutMs);
  const progressRatio = active ? Math.min(1, elapsedMs / totalMs) : 1;

  // Reflect live warning threshold even between backend event ticks
  const liveWarningLevel: 'none' | 'subtle' | 'critical' = !active
    ? execution.warningLevel || 'none'
    : progressRatio >= 0.9 || execution.warningLevel === 'critical'
      ? 'critical'
      : progressRatio >= 0.75 || execution.warningLevel === 'subtle'
        ? 'subtle'
        : 'none';

  const extendableMs = Math.max(0, execution.maxTimeoutMs - execution.configuredTimeoutMs);
  const showExtendControls =
    active &&
    execution.status !== 'terminating' &&
    execution.canExtend &&
    extendableMs >= 1000 &&
    Boolean(onExtend);

  const handleExtendClick = async (requestedAddMs: number) => {
    if (!onExtend || isExtending) return;
    setIsExtending(true);
    try {
      await onExtend(execution.commandId, Math.min(requestedAddMs, extendableMs));
    } finally {
      setIsExtending(false);
    }
  };

  let statusLabel = 'Running';
  let statusBadgeClass = 'text-sky-300 bg-sky-950/60 border-sky-800/70';
  let progressBarClass = 'bg-primary';
  let StatusIcon = Loader2;
  let spinIcon = true;

  if (execution.status === 'terminating') {
    statusLabel = 'Terminating';
    statusBadgeClass = 'text-amber-300 bg-amber-950/60 border-amber-800/70';
    progressBarClass = 'bg-amber-500';
  } else if (active && liveWarningLevel === 'critical') {
    statusLabel = 'Timeout Imminent';
    statusBadgeClass = 'text-red-300 bg-red-950/70 border-red-800/80';
    progressBarClass = 'bg-red-500';
  } else if (active && liveWarningLevel === 'subtle') {
    statusLabel = 'Approaching Timeout';
    statusBadgeClass = 'text-amber-300 bg-amber-950/60 border-amber-800/70';
    progressBarClass = 'bg-amber-400';
  } else if (execution.status === 'completed') {
    statusLabel = 'Completed';
    statusBadgeClass = 'text-emerald-300 bg-emerald-950/60 border-emerald-800/70';
    progressBarClass = 'bg-emerald-500';
    StatusIcon = CheckCircle2;
    spinIcon = false;
  } else if (execution.status === 'timed_out') {
    statusLabel = 'Timed Out';
    statusBadgeClass = 'text-red-300 bg-red-950/70 border-red-800/80';
    progressBarClass = 'bg-red-500';
    StatusIcon = Clock;
    spinIcon = false;
  } else if (execution.status === 'cancelled_by_user') {
    statusLabel = 'Cancelled';
    statusBadgeClass = 'text-zinc-300 bg-zinc-800/80 border-zinc-700';
    progressBarClass = 'bg-zinc-500';
    StatusIcon = Ban;
    spinIcon = false;
  } else if (execution.status === 'terminated_by_policy') {
    statusLabel = 'Policy Terminated';
    statusBadgeClass = 'text-orange-300 bg-orange-950/70 border-orange-800/80';
    progressBarClass = 'bg-orange-500';
    StatusIcon = ShieldAlert;
    spinIcon = false;
  } else if (execution.status === 'failed') {
    statusLabel = `Failed (Exit ${execution.exitCode ?? 1})`;
    statusBadgeClass = 'text-red-300 bg-red-950/60 border-red-800/70';
    progressBarClass = 'bg-red-500';
    StatusIcon = XCircle;
    spinIcon = false;
  }

  return (
    <div className="rounded-xl border border-zinc-800/90 bg-zinc-900/60 text-xs overflow-hidden shadow-sm">
      {/* Header Row */}
      <div className="px-3 py-2 flex items-start justify-between gap-2">
        <div className="flex items-start space-x-2 min-w-0">
          <Terminal className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
          <div className="min-w-0 space-y-0.5">
            <div className="font-medium text-zinc-200 truncate">
              {execution.description || execution.command}
            </div>
            {execution.description && execution.description !== execution.command && (
              <div className="text-[10px] font-mono text-zinc-500 truncate">
                {execution.command}
              </div>
            )}
          </div>
        </div>

        <span
          className={cn(
            'inline-flex items-center space-x-1 px-2 py-0.5 rounded-full border text-[10px] font-medium shrink-0',
            statusBadgeClass
          )}
        >
          <StatusIcon className={cn('w-3 h-3', spinIcon && 'animate-spin')} />
          <span>{statusLabel}</span>
        </span>
      </div>

      {/* Slim Timeout Progress Bar */}
      <div className="h-1 bg-zinc-800/90 w-full">
        <div
          className={cn('h-full transition-all duration-500', progressBarClass)}
          style={{ width: `${Math.round(progressRatio * 100)}%` }}
        />
      </div>

      {/* Timing Telemetry Row */}
      <div className="px-3 py-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-zinc-400 bg-zinc-950/40 border-t border-zinc-800/50">
        <div className="flex items-center space-x-3 font-mono">
          <span>
            Elapsed: <strong className="text-zinc-200">{formatDurationReadable(elapsedMs)}</strong>
          </span>
          <span>
            Timeout:{' '}
            <strong className="text-zinc-300">
              {formatDurationReadable(execution.configuredTimeoutMs)}
            </strong>
          </span>
          {active && (
            <span>
              Remaining:{' '}
              <strong
                className={cn(
                  liveWarningLevel === 'critical'
                    ? 'text-red-300'
                    : liveWarningLevel === 'subtle'
                      ? 'text-amber-300'
                      : 'text-zinc-200'
                )}
              >
                {formatDurationReadable(remainingMs)}
              </strong>
            </span>
          )}
        </div>

        {/* Action Controls: Bounded Extension + Per-Command Cancel */}
        {active && (
          <div className="flex items-center space-x-1.5">
            {showExtendControls && (
              <>
                <button
                  type="button"
                  disabled={isExtending}
                  onClick={() => void handleExtendClick(60_000)}
                  className="inline-flex items-center space-x-0.5 px-2 py-0.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-medium border border-zinc-700/70 disabled:opacity-50 transition-colors"
                  title="Extend timeout by up to 1 minute (bounded by maximum)"
                >
                  <Plus className="w-2.5 h-2.5" />
                  <span>{extendableMs < 60_000 ? formatDurationReadable(extendableMs) : '1m'}</span>
                </button>
                {extendableMs >= 120_000 && (
                  <button
                    type="button"
                    disabled={isExtending}
                    onClick={() => void handleExtendClick(120_000)}
                    className="inline-flex items-center space-x-0.5 px-2 py-0.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-medium border border-zinc-700/70 disabled:opacity-50 transition-colors"
                    title="Extend timeout by 2 minutes (bounded by maximum)"
                  >
                    <Plus className="w-2.5 h-2.5" />
                    <span>2m</span>
                  </button>
                )}
              </>
            )}
            {onCancel && execution.status !== 'terminating' && (
              <button
                type="button"
                onClick={() => void onCancel(execution.commandId)}
                className="px-2 py-0.5 rounded-md text-red-400 hover:text-red-300 hover:bg-red-950/40 text-[10px] font-medium transition-colors"
              >
                Stop
              </button>
            )}
          </div>
        )}
      </div>

      {/* Warning Banners at 75% and 90% */}
      {active && liveWarningLevel === 'critical' && (
        <div className="px-3 py-1.5 bg-red-950/50 border-t border-red-800/70 text-[11px] text-red-200 flex items-center space-x-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span>
            Command has used over 90% of its timeout ({formatDurationReadable(remainingMs)} left)
            and will terminate safely if it exceeds the limit.
          </span>
        </div>
      )}
      {active && liveWarningLevel === 'subtle' && (
        <div className="px-3 py-1.5 bg-amber-950/35 border-t border-amber-800/50 text-[11px] text-amber-200/90 flex items-center space-x-1.5">
          <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>
            Approaching configured timeout ({formatDurationReadable(remainingMs)} remaining).
          </span>
        </div>
      )}

      {/* Extension History Pills */}
      {execution.extensions && execution.extensions.length > 0 && (
        <div className="px-3 py-1.5 bg-zinc-950/50 border-t border-zinc-800/50 flex flex-wrap gap-1.5 text-[10px]">
          {execution.extensions.map((ext, i) => (
            <span
              key={i}
              className="px-1.5 py-0.5 rounded bg-zinc-800/90 border border-zinc-700/60 text-zinc-300 font-mono"
            >
              +{formatDurationReadable(ext.addedMs)} ({ext.requestedBy})
              {ext.reason ? ` — ${ext.reason}` : ''}
            </span>
          ))}
        </div>
      )}

      {/* Termination Detail */}
      {execution.terminationResult && !active && (
        <div className="px-3 py-1.5 bg-zinc-950/60 border-t border-zinc-800/60 text-[11px] text-zinc-300">
          {execution.terminationResult}
        </div>
      )}

      {/* Collapsible Live Output Preview */}
      {execution.outputPreview && (
        <div className="border-t border-zinc-800/60">
          <button
            type="button"
            onClick={() => setOutputOpen(!outputOpen)}
            className="w-full px-3 py-1 flex items-center justify-between text-[10px] text-zinc-400 hover:bg-zinc-800/30 transition-colors"
          >
            <span>Output</span>
            <ChevronRight
              className={cn('w-3 h-3 transition-transform', outputOpen && 'rotate-90')}
            />
          </button>
          {outputOpen && (
            <pre className="px-3 pb-2 pt-1 text-[10px] font-mono text-zinc-300 bg-zinc-950/70 max-h-40 overflow-auto whitespace-pre-wrap break-words">
              {execution.outputPreview}
            </pre>
          )}
        </div>
      )}
    </div>
  );
});
