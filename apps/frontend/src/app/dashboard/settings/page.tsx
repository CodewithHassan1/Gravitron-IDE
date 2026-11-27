'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AgentProtocol } from '@ag/protocol';
import { AgentManager } from '../../../services/ai/AgentManager';
import { formatDurationReadable } from '../../../components/ide/ai/CommandExecutionCard';
import { cn } from '@/lib/utils';
import { CheckCircle2, AlertTriangle, Clock, Shield, RotateCcw } from 'lucide-react';

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

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'profile' | 'agent' | 'billing'>('profile');
  const [ipcAvailable, setIpcAvailable] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const [defaultTimeoutSec, setDefaultTimeoutSec] = useState<number>(120);
  const [maxTimeoutSec, setMaxTimeoutSec] = useState<number>(600);
  const [gracePeriodSec, setGracePeriodSec] = useState<number>(5);
  const [allowAgentExtension, setAllowAgentExtension] = useState<boolean>(true);
  const [requireConfirmationForLongCommands, setRequireConfirmationForLongCommands] =
    useState<boolean>(true);

  const agentManager = useMemo(() => new AgentManager(), []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab === 'agent' || tab === 'billing' || tab === 'profile') {
        setActiveTab(tab);
      }
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadPolicy = async () => {
      const available = agentManager.isAvailable();
      if (!mounted) return;
      setIpcAvailable(available);

      if (!available) {
        setLoading(false);
        return;
      }

      try {
        const policy = await agentManager.getTimeoutPolicy();
        if (!mounted || !policy) return;
        setDefaultTimeoutSec(Math.round(policy.defaultTimeoutMs / 1000));
        setMaxTimeoutSec(Math.round(policy.maxPermittedTimeoutMs / 1000));
        setGracePeriodSec(Math.max(1, Math.round(policy.terminationGracePeriodMs / 1000)));
        setAllowAgentExtension(policy.allowAgentExtension);
        setRequireConfirmationForLongCommands(policy.requireConfirmationForLongCommands);
      } catch (err: any) {
        if (mounted) {
          setFeedback({
            type: 'error',
            text: err?.message || 'Failed to load Agent Timeout settings.',
          });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void loadPolicy();
    return () => {
      mounted = false;
    };
  }, [agentManager]);

  const applyPolicyToForm = (policy: AgentProtocol.AgentTimeoutPolicy) => {
    setDefaultTimeoutSec(Math.round(policy.defaultTimeoutMs / 1000));
    setMaxTimeoutSec(Math.round(policy.maxPermittedTimeoutMs / 1000));
    setGracePeriodSec(Math.max(1, Math.round(policy.terminationGracePeriodMs / 1000)));
    setAllowAgentExtension(policy.allowAgentExtension);
    setRequireConfirmationForLongCommands(policy.requireConfirmationForLongCommands);
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
        text: 'Desktop IPC bridge unavailable. Open settings inside the Gravitron IDE desktop app to persist changes.',
      });
      return;
    }

    setSaving(true);
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
      setSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    setFeedback(null);
    applyPolicyToForm(DEFAULT_POLICY);

    if (!agentManager.isAvailable()) {
      return;
    }

    setSaving(true);
    try {
      const saved = await agentManager.setTimeoutPolicy(DEFAULT_POLICY);
      applyPolicyToForm(saved);
      setFeedback({ type: 'success', text: 'Restored default agent timeout policy.' });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Failed to reset policy.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-1 overflow-y-auto p-8 max-w-4xl mx-auto w-full">
      <div className="w-52 border-r border-border pr-6 shrink-0">
        <h2 className="font-semibold text-lg mb-4">Settings</h2>
        <div className="space-y-1.5 text-sm">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={cn(
              'w-full text-left p-2 rounded-md transition-colors',
              activeTab === 'profile'
                ? 'bg-muted text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Profile
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('agent')}
            className={cn(
              'w-full text-left p-2 rounded-md transition-colors',
              activeTab === 'agent'
                ? 'bg-muted text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Agent Timeouts
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('billing')}
            className={cn(
              'w-full text-left p-2 rounded-md transition-colors',
              activeTab === 'billing'
                ? 'bg-muted text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Billing
          </button>
        </div>
      </div>

      <div className="flex-1 pl-8">
        {activeTab === 'profile' && (
          <div>
            <h3 className="text-xl font-medium mb-6">Profile Settings</h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Email Address</label>
                <input
                  type="email"
                  disabled
                  value="admin@ag-ide.local"
                  className="w-full max-w-md h-9 bg-card border border-border rounded-md px-3 text-sm text-muted-foreground opacity-70"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Display Name</label>
                <input
                  type="text"
                  defaultValue="Admin User"
                  className="w-full max-w-md h-9 bg-card border border-border rounded-md px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <button
                type="button"
                className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md"
              >
                Save Changes
              </button>
            </div>
          </div>
        )}

        {activeTab === 'agent' && (
          <div className="space-y-6 max-w-2xl">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <Clock className="w-5 h-5 text-primary" />
                <h3 className="text-xl font-medium">Agent Command Timeout & Execution</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Configure backend-enforced command timeouts, warning thresholds, grace periods, and
                extension permissions for AI agent terminal commands.
              </p>
            </div>

            {!ipcAvailable && !loading && (
              <div className="p-3 rounded-lg border border-amber-800/60 bg-amber-950/30 text-xs text-amber-200 flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Running outside Electron desktop runtime. Launch Gravitron IDE desktop to load and
                  persist timeout settings.
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
                <span>{feedback.text}</span>
              </div>
            )}

            <div className="space-y-5 bg-card/50 border border-border rounded-xl p-5">
              {/* Default Command Timeout */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground">
                    Default Command Timeout
                  </label>
                  <span className="text-xs font-mono text-primary font-semibold">
                    {formatDurationReadable(defaultTimeoutSec * 1000)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
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
                    className="w-32 h-9 bg-background border border-border rounded-md px-3 text-sm font-mono text-foreground"
                  />
                  <span className="text-xs text-muted-foreground">seconds (default: 2m 0s)</span>
                </div>
              </div>

              {/* Maximum Permitted Timeout */}
              <div className="space-y-2 pt-3 border-t border-border">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground flex items-center space-x-1.5">
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
                    className="w-32 h-9 bg-background border border-border rounded-md px-3 text-sm font-mono text-foreground"
                  />
                  <span className="text-xs text-muted-foreground">
                    seconds (security ceiling:{' '}
                    {formatDurationReadable(HARD_CEILING_SECONDS * 1000)})
                  </span>
                </div>
              </div>

              {/* Termination Grace Period */}
              <div className="space-y-2 pt-3 border-t border-border">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground">
                    Grace Period Before Force Termination
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
                    className="w-32 h-9 bg-background border border-border rounded-md px-3 text-sm font-mono text-foreground"
                  />
                  <span className="text-xs text-muted-foreground">
                    seconds (1s – 30s graceful exit window before tree kill)
                  </span>
                </div>
              </div>

              {/* Policy Toggles */}
              <div className="space-y-3 pt-3 border-t border-border">
                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowAgentExtension}
                    onChange={(e) => setAllowAgentExtension(e.target.checked)}
                    className="mt-1 rounded border-border"
                  />
                  <div className="text-sm">
                    <div className="font-medium text-foreground">
                      Allow agent to request additional execution time
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Permits the agent to request bounded extensions up to your configured maximum.
                    </div>
                  </div>
                </label>

                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireConfirmationForLongCommands}
                    onChange={(e) => setRequireConfirmationForLongCommands(e.target.checked)}
                    className="mt-1 rounded border-border"
                  />
                  <div className="text-sm">
                    <div className="font-medium text-foreground">
                      Require confirmation for long-running commands
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Commands exceeding your default timeout prompt for explicit approval even when
                      auto-approve is enabled.
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                type="button"
                disabled={saving || loading}
                onClick={() => void handleSaveTimeoutPolicy()}
                className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save Timeout Settings'}
              </button>
              <button
                type="button"
                disabled={saving || loading}
                onClick={() => void handleResetDefaults()}
                className="px-3 py-2 bg-muted hover:bg-muted/80 text-foreground text-sm font-medium rounded-md inline-flex items-center space-x-1.5 disabled:opacity-50 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Defaults</span>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'billing' && (
          <div>
            <h3 className="text-xl font-medium mb-2">Billing</h3>
            <p className="text-sm text-muted-foreground">
              Manage your workspace subscription and usage limits from the web dashboard.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
