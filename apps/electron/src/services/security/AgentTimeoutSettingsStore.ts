import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { AgentProtocol } from '@ag/protocol';

export const AGENT_TIMEOUT_SECURITY_CEILING_MS = 30 * 60 * 1000; // 30 minutes hard cap
export const AGENT_TIMEOUT_MIN_MS = 1_000; // 1 second minimum
export const AGENT_MAX_TIMEOUT_MIN_MS = 10_000; // 10 seconds minimum max ceiling
export const AGENT_GRACE_PERIOD_MIN_MS = 500;
export const AGENT_GRACE_PERIOD_MAX_MS = 30_000;

export const COMMAND_TIMEOUT_PRESETS_MS: Record<AgentProtocol.CommandTimeoutPreset, number> = {
  short: 30_000, // 30s
  normal: 120_000, // 2m
  long: 300_000, // 5m
  extended: 600_000, // 10m
};

export const DEFAULT_AGENT_TIMEOUT_POLICY: AgentProtocol.AgentTimeoutPolicy = {
  defaultTimeoutMs: 120_000, // 2 minutes
  maxPermittedTimeoutMs: 600_000, // 10 minutes
  allowAgentExtension: true,
  requireConfirmationForLongCommands: true,
  terminationGracePeriodMs: 5_000, // 5 seconds
  warningThresholdRatio: 0.75,
  criticalThresholdRatio: 0.9,
};

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

export class AgentTimeoutSettingsStore {
  private readonly configFilePath: string;
  private policy: AgentProtocol.AgentTimeoutPolicy;

  constructor(customPath?: string) {
    if (customPath) {
      this.configFilePath = customPath;
    } else {
      try {
        const userData = app?.getPath ? app.getPath('userData') : '';
        this.configFilePath = userData ? path.join(userData, 'agent-timeout-policy.json') : '';
      } catch {
        this.configFilePath = '';
      }
    }

    this.policy = { ...DEFAULT_AGENT_TIMEOUT_POLICY };
    this.loadFromDisk();
  }

  public sanitizePolicy(
    input: Partial<AgentProtocol.AgentTimeoutPolicy> | null | undefined,
    base: AgentProtocol.AgentTimeoutPolicy = this.policy
  ): AgentProtocol.AgentTimeoutPolicy {
    const source = input || {};
    const maxPermittedTimeoutMs = clampNumber(
      source.maxPermittedTimeoutMs,
      AGENT_MAX_TIMEOUT_MIN_MS,
      AGENT_TIMEOUT_SECURITY_CEILING_MS,
      base.maxPermittedTimeoutMs
    );

    const defaultTimeoutMs = clampNumber(
      source.defaultTimeoutMs,
      AGENT_TIMEOUT_MIN_MS,
      maxPermittedTimeoutMs,
      Math.min(base.defaultTimeoutMs, maxPermittedTimeoutMs)
    );

    const terminationGracePeriodMs = clampNumber(
      source.terminationGracePeriodMs,
      AGENT_GRACE_PERIOD_MIN_MS,
      AGENT_GRACE_PERIOD_MAX_MS,
      base.terminationGracePeriodMs
    );

    const warningThresholdRatio =
      typeof source.warningThresholdRatio === 'number' &&
      Number.isFinite(source.warningThresholdRatio) &&
      source.warningThresholdRatio >= 0.5 &&
      source.warningThresholdRatio < 0.9
        ? Number(source.warningThresholdRatio.toFixed(2))
        : base.warningThresholdRatio;

    const criticalThresholdRatio =
      typeof source.criticalThresholdRatio === 'number' &&
      Number.isFinite(source.criticalThresholdRatio) &&
      source.criticalThresholdRatio > warningThresholdRatio &&
      source.criticalThresholdRatio <= 0.98
        ? Number(source.criticalThresholdRatio.toFixed(2))
        : Math.max(warningThresholdRatio + 0.05, base.criticalThresholdRatio);

    return {
      defaultTimeoutMs,
      maxPermittedTimeoutMs,
      allowAgentExtension:
        typeof source.allowAgentExtension === 'boolean'
          ? source.allowAgentExtension
          : base.allowAgentExtension,
      requireConfirmationForLongCommands:
        typeof source.requireConfirmationForLongCommands === 'boolean'
          ? source.requireConfirmationForLongCommands
          : base.requireConfirmationForLongCommands,
      terminationGracePeriodMs,
      warningThresholdRatio,
      criticalThresholdRatio,
    };
  }

  private loadFromDisk(): void {
    if (!this.configFilePath || !fs.existsSync(this.configFilePath)) {
      return;
    }

    try {
      const raw = fs.readFileSync(this.configFilePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<AgentProtocol.AgentTimeoutPolicy>;
      this.policy = this.sanitizePolicy(parsed, DEFAULT_AGENT_TIMEOUT_POLICY);
    } catch (err) {
      console.warn('[AgentTimeoutSettingsStore] Failed to load policy from disk:', err);
    }
  }

  private saveToDisk(): void {
    if (!this.configFilePath) {
      return;
    }

    try {
      const dir = path.dirname(this.configFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configFilePath, JSON.stringify(this.policy, null, 2), 'utf8');
    } catch (err) {
      console.warn('[AgentTimeoutSettingsStore] Failed to persist policy to disk:', err);
    }
  }

  public getPolicy(): AgentProtocol.AgentTimeoutPolicy {
    return { ...this.policy };
  }

  public setPolicy(
    update: Partial<AgentProtocol.AgentTimeoutPolicy>
  ): AgentProtocol.AgentTimeoutPolicy {
    this.policy = this.sanitizePolicy(update, this.policy);
    this.saveToDisk();
    return this.getPolicy();
  }

  public resetPolicy(): AgentProtocol.AgentTimeoutPolicy {
    this.policy = { ...DEFAULT_AGENT_TIMEOUT_POLICY };
    this.saveToDisk();
    return this.getPolicy();
  }

  /**
   * Resolves a requested per-command timeout against the active policy and
   * hard backend security ceiling. Renderer or agent inputs cannot bypass limits.
   */
  public resolveEffectiveTimeout(
    requestedTimeoutMs?: number,
    preset?: AgentProtocol.CommandTimeoutPreset
  ): {
    effectiveTimeoutMs: number;
    maxTimeoutMs: number;
    wasClamped: boolean;
    requestedMs: number;
  } {
    const policy = this.getPolicy();
    const maxTimeoutMs = policy.maxPermittedTimeoutMs;

    let desiredMs = policy.defaultTimeoutMs;
    if (typeof requestedTimeoutMs === 'number' && Number.isFinite(requestedTimeoutMs) && requestedTimeoutMs > 0) {
      desiredMs = Math.round(requestedTimeoutMs);
    } else if (preset && preset in COMMAND_TIMEOUT_PRESETS_MS) {
      desiredMs = COMMAND_TIMEOUT_PRESETS_MS[preset];
    }

    const clamped = Math.min(maxTimeoutMs, Math.max(AGENT_TIMEOUT_MIN_MS, desiredMs));
    return {
      effectiveTimeoutMs: clamped,
      maxTimeoutMs,
      wasClamped: clamped !== desiredMs,
      requestedMs: desiredMs,
    };
  }
}
