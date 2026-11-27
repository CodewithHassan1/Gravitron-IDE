import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { AgentProtocol, Channels, ExecutionContext, ExecutionRequest } from '@ag/protocol';
import {
  AgentTimeoutSettingsStore,
  AGENT_TIMEOUT_SECURITY_CEILING_MS,
  DEFAULT_AGENT_TIMEOUT_POLICY,
} from '../../src/services/security/AgentTimeoutSettingsStore';
import { WorkspaceExecutionService } from '../../src/services/execution/WorkspaceExecutionService';
import { ExecutionPolicyPipeline } from '../../src/services/execution/policies/IExecutionPolicyPipeline';
import { ExecutionBackendRegistry } from '../../src/services/terminal/pty/types';
import { LocalBackend } from '../../src/services/terminal/pty/LocalBackend';
import { AgentCapabilityBridgeImpl } from '../../src/services/AgentCapabilityBridgeImpl';

const execFileAsync = promisify(execFile);

function createTempContextResolver(workspaceRoot: string) {
  return {
    resolve: async (request: ExecutionRequest): Promise<ExecutionContext> => ({
      workspaceId: request.workspaceId,
      target: request.target,
      cwd: request.cwdOverride
        ? path.resolve(workspaceRoot, request.cwdOverride)
        : workspaceRoot,
      environment: { ...process.env } as Record<string, string>,
      shell: request.shellOverride || {
        executable: process.platform === 'win32' ? 'powershell.exe' : '/bin/sh',
        args: [],
      },
      cols: 120,
      rows: 30,
    }),
  };
}

function createWorkspaceServiceMock(workspaceRoot: string) {
  return {
    id: 'workspace' as any,
    dependencies: [],
    registerHandlers: () => [
      {
        channel: Channels.Workspace.ReadFile,
        handler: async (p: { path: string }) =>
          fs.readFileSync(path.resolve(workspaceRoot, p.path), 'utf8'),
      },
      {
        channel: Channels.Workspace.WriteFile,
        handler: async (p: { path: string; content: string }) => {
          fs.writeFileSync(path.resolve(workspaceRoot, p.path), p.content, 'utf8');
        },
      },
    ],
  } as any;
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('Command Timeout & Execution Management Acceptance Suite', () => {
  let tmpWorkspaceDir: string;
  let policyPath: string;
  let settingsStore: AgentTimeoutSettingsStore;
  let executionService: WorkspaceExecutionService;
  let policyPipeline: ExecutionPolicyPipeline;
  let bridge: AgentCapabilityBridgeImpl;

  beforeEach(async () => {
    tmpWorkspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-cmd-timeout-ws-'));
    policyPath = path.join(tmpWorkspaceDir, 'agent-timeout-policy.json');
    settingsStore = new AgentTimeoutSettingsStore(policyPath);

    const backendRegistry = new ExecutionBackendRegistry();
    backendRegistry.register(new LocalBackend());

    policyPipeline = new ExecutionPolicyPipeline();
    executionService = new WorkspaceExecutionService(
      createTempContextResolver(tmpWorkspaceDir) as any,
      policyPipeline,
      backendRegistry
    );
    await executionService.initialize();
    await executionService.start();

    bridge = new AgentCapabilityBridgeImpl(
      createWorkspaceServiceMock(tmpWorkspaceDir),
      executionService,
      {} as any,
      settingsStore
    );
  });

  afterEach(async () => {
    await bridge.dispose().catch(() => {});
    await executionService.stop().catch(() => {});
    fs.rmSync(tmpWorkspaceDir, { recursive: true, force: true });
  });

  it('persists timeout policy and enforces hard security ceiling limits', () => {
    const defaults = settingsStore.getPolicy();
    expect(defaults).toEqual(DEFAULT_AGENT_TIMEOUT_POLICY);

    // Attempt to bypass security ceiling from renderer payload
    const updated = settingsStore.setPolicy({
      defaultTimeoutMs: 999_999_999,
      maxPermittedTimeoutMs: 999_999_999,
      terminationGracePeriodMs: 999_999,
      allowAgentExtension: false,
      requireConfirmationForLongCommands: true,
    });

    expect(updated.maxPermittedTimeoutMs).toBe(AGENT_TIMEOUT_SECURITY_CEILING_MS);
    expect(updated.defaultTimeoutMs).toBe(AGENT_TIMEOUT_SECURITY_CEILING_MS);
    expect(updated.terminationGracePeriodMs).toBe(30_000);
    expect(updated.allowAgentExtension).toBe(false);

    // Reload from disk to confirm persistence
    const reloaded = new AgentTimeoutSettingsStore(policyPath);
    expect(reloaded.getPolicy().maxPermittedTimeoutMs).toBe(AGENT_TIMEOUT_SECURITY_CEILING_MS);
    expect(reloaded.getPolicy().allowAgentExtension).toBe(false);

    // Preset resolution respects maxPermittedTimeoutMs
    settingsStore.setPolicy({ maxPermittedTimeoutMs: 45_000, defaultTimeoutMs: 30_000 });
    const resolvedLong = settingsStore.resolveEffectiveTimeout(undefined, 'extended');
    expect(resolvedLong.effectiveTimeoutMs).toBe(45_000);
    expect(resolvedLong.wasClamped).toBe(true);
  });

  it('1. executes a short command to normal completion', async () => {
    const updates: AgentProtocol.ActiveCommandExecutionSnapshot[] = [];
    const controller = new AbortController();

    const result = await bridge.executeCommand(
      {
        agentId: 'agent-1',
        workspaceId: 'ws-timeout-1',
        signal: controller.signal,
        onCommandExecutionUpdate: (u) => updates.push(u),
      },
      `node -e "console.log('SHORT_COMMAND_OK')"`,
      undefined,
      { description: 'Echo quick test', timeoutMs: 10_000 }
    );

    expect(result.outcome).toBe('completed');
    expect(result.timedOut).toBe(false);
    expect(result.cancelled).toBe(false);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('SHORT_COMMAND_OK');
    expect(result.configuredTimeoutMs).toBe(10_000);
    expect(updates.some((u) => u.status === 'running')).toBe(true);
    expect(updates[updates.length - 1]?.status).toBe('completed');
  });

  it('2, 3, 4 & 10. emits 75%/90% warnings, safely terminates on timeout, and lets subsequent commands run', async () => {
    settingsStore.setPolicy({
      defaultTimeoutMs: 2_500,
      maxPermittedTimeoutMs: 20_000,
      terminationGracePeriodMs: 600,
      warningThresholdRatio: 0.5,
      criticalThresholdRatio: 0.75,
    });

    const updates: AgentProtocol.ActiveCommandExecutionSnapshot[] = [];
    const controller = new AbortController();

    const cmd =
      process.platform === 'win32'
        ? `Write-Output 'PARTIAL_START'; node -e "setInterval(() => {}, 1000)"`
        : `echo PARTIAL_START && node -e "setInterval(() => {}, 1000)"`;

    const timedOutResult = await bridge.executeCommand(
      {
        agentId: 'agent-2',
        workspaceId: 'ws-timeout-2',
        signal: controller.signal,
        onCommandExecutionUpdate: (u) => updates.push(u),
      },
      cmd,
      undefined,
      { description: 'Long sleeping script', timeoutMs: 2_500 }
    );

    expect(timedOutResult.outcome).toBe('timed_out');
    expect(timedOutResult.timedOut).toBe(true);
    expect(timedOutResult.cancelled).toBe(false);
    expect(timedOutResult.exitCode).toBe(-1);
    expect(timedOutResult.stdout).toContain('PARTIAL_START');
    expect(timedOutResult.configuredTimeoutMs).toBe(2_500);
    expect(timedOutResult.elapsedMs ?? 0).toBeGreaterThanOrEqual(2_300);
    expect(timedOutResult.terminationResult).toBeTruthy();

    // Verify 75%/warning and 90%/critical lifecycle updates & live timing fields
    expect(updates.some((u) => u.warningLevel === 'subtle')).toBe(true);
    expect(updates.some((u) => u.warningLevel === 'critical')).toBe(true);
    expect(updates.some((u) => u.status === 'terminating')).toBe(true);
    expect(updates[updates.length - 1]?.status).toBe('timed_out');
    expect(updates[0].deadlineAt - updates[0].startedAt).toBe(2_500);

    // 10. Subsequent command executes normally after timeout without stale timer interference
    const followUp = await bridge.executeCommand(
      {
        agentId: 'agent-2',
        workspaceId: 'ws-timeout-2',
        signal: new AbortController().signal,
      },
      `node -e "console.log('SUBSEQUENT_OK')"`,
      undefined,
      { description: 'Follow-up command', timeoutMs: 5_000 }
    );

    expect(followUp.outcome).toBe('completed');
    expect(followUp.exitCode).toBe(0);
    expect(followUp.stdout).toContain('SUBSEQUENT_OK');
  }, 15_000);

  it('5. supports bounded backend timeout extension and respects max/policy limits', async () => {
    settingsStore.setPolicy({
      defaultTimeoutMs: 1_200,
      maxPermittedTimeoutMs: 10_000,
      allowAgentExtension: false,
      terminationGracePeriodMs: 500,
    });

    const updates: AgentProtocol.ActiveCommandExecutionSnapshot[] = [];
    let capturedCommandId = '';
    const controller = new AbortController();

    const execPromise = bridge.executeCommand(
      {
        agentId: 'agent-ext',
        workspaceId: 'ws-ext',
        signal: controller.signal,
        onCommandExecutionUpdate: (u) => {
          capturedCommandId = u.commandId;
          updates.push(u);
        },
      },
      `node -e "setTimeout(() => { console.log('EXTENDED_FINISHED'); process.exit(0); }, 1800)"`,
      undefined,
      { description: 'Extendable job', timeoutMs: 1_200 }
    );

    // Wait briefly until command is active
    await new Promise((r) => setTimeout(r, 350));
    expect(capturedCommandId).toBeTruthy();

    // Agent extension must be rejected when allowAgentExtension is false
    const deniedAgentExt = await bridge.extendCommandTimeout(
      { agentId: 'agent-ext', workspaceId: 'ws-ext', signal: controller.signal },
      capturedCommandId,
      2_000,
      'agent',
      'Need more time'
    );
    expect(deniedAgentExt.granted).toBe(false);

    // Cross-agent extension must be rejected (isolation)
    const deniedCrossAgent = await bridge.extendCommandTimeout(
      { agentId: 'attacker-agent', workspaceId: 'ws-ext', signal: controller.signal },
      capturedCommandId,
      2_000,
      'user'
    );
    expect(deniedCrossAgent.granted).toBe(false);

    // User extension succeeds and is bounded by maxPermittedTimeoutMs (10_000ms)
    const grantedUserExt = await bridge.extendCommandTimeout(
      { agentId: 'agent-ext', workspaceId: 'ws-ext', signal: controller.signal },
      capturedCommandId,
      50_000,
      'user',
      'Allow finish'
    );
    expect(grantedUserExt.granted).toBe(true);
    expect(grantedUserExt.newTimeoutMs).toBe(10_000);

    const result = await execPromise;
    expect(result.outcome).toBe('completed');
    expect(result.timedOut).toBe(false);
    expect(result.stdout).toContain('EXTENDED_FINISHED');
    expect(result.extensions?.length).toBe(1);
    expect(result.extensions?.[0].requestedBy).toBe('user');
    expect(result.extensions?.[0].newTimeoutMs).toBe(10_000);
  }, 15_000);

  it('8. preserves distinct cancelled_by_user, failed, and terminated_by_policy outcomes', async () => {
    // User cancel of active command (distinct from timeout)
    let cmdId = '';
    const cancelPromise = bridge.executeCommand(
      {
        agentId: 'agent-cancel',
        workspaceId: 'ws-cancel',
        signal: new AbortController().signal,
        onCommandExecutionUpdate: (u) => {
          cmdId = u.commandId;
        },
      },
      `node -e "setInterval(() => {}, 1000)"`,
      undefined,
      { description: 'Cancellable command', timeoutMs: 10_000 }
    );

    await new Promise((r) => setTimeout(r, 350));
    const cancelled = await bridge.cancelCommand(
      { agentId: 'agent-cancel', workspaceId: 'ws-cancel', signal: new AbortController().signal },
      cmdId
    );
    expect(cancelled).toBe(true);

    const cancelResult = await cancelPromise;
    expect(cancelResult.outcome).toBe('cancelled_by_user');
    expect(cancelResult.cancelled).toBe(true);
    expect(cancelResult.timedOut).toBe(false);

    // Normal non-zero command failure (distinct from timeout & cancel)
    const failCmd =
      process.platform === 'win32'
        ? `Write-Output 'FAIL_EXIT'; exit 2`
        : `echo FAIL_EXIT && exit 2`;
    const failResult = await bridge.executeCommand(
      {
        agentId: 'agent-cancel',
        workspaceId: 'ws-cancel',
        signal: new AbortController().signal,
      },
      failCmd,
      undefined,
      { timeoutMs: 10_000 }
    );
    expect(failResult.outcome).toBe('failed');
    expect(failResult.exitCode).toBe(2);
    expect(failResult.timedOut).toBe(false);
    expect(failResult.cancelled).toBe(false);

    // Policy termination
    policyPipeline.addPolicy({
      validate: () => {
        throw new Error('POLICY_BLOCKED: Disallowed workspace execution');
      },
    });
    const policyResult = await bridge.executeCommand(
      {
        agentId: 'agent-cancel',
        workspaceId: 'ws-cancel',
        signal: new AbortController().signal,
      },
      `node -e "console.log('SHOULD_NOT_RUN')"`,
      undefined,
      { timeoutMs: 10_000 }
    );
    expect(policyResult.outcome).toBe('terminated_by_policy');
    expect(policyResult.timedOut).toBe(false);
    expect(policyResult.policyViolation).toContain('POLICY_BLOCKED');
  }, 15_000);

  it('9. terminates spawned child processes cleanly without leaving orphaned children', async () => {
    settingsStore.setPolicy({
      defaultTimeoutMs: 3_500,
      maxPermittedTimeoutMs: 10_000,
      terminationGracePeriodMs: 500,
    });

    const childPidFile = path.join(tmpWorkspaceDir, 'child-pid.txt');
    const spawnScript = `
      const { spawn } = require('child_process');
      const fs = require('fs');
      const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      fs.writeFileSync(${JSON.stringify(childPidFile)}, String(child.pid), 'utf8');
      console.log('SPAWNED_CHILD:' + child.pid);
      setInterval(() => {}, 1000);
    `.replace(/\r?\n/g, ' ');

    const scriptPath = path.join(tmpWorkspaceDir, 'spawn-tree.js');
    fs.writeFileSync(scriptPath, spawnScript, 'utf8');

    const result = await bridge.executeCommand(
      {
        agentId: 'agent-tree',
        workspaceId: 'ws-tree',
        signal: new AbortController().signal,
      },
      `node "${scriptPath}"`,
      undefined,
      { description: 'Process tree timeout test', timeoutMs: 3_500 }
    );

    expect(result.outcome).toBe('timed_out');
    expect(fs.existsSync(childPidFile)).toBe(true);
    const childPid = Number(fs.readFileSync(childPidFile, 'utf8').trim());
    expect(childPid).toBeGreaterThan(0);

    // Give OS a brief moment to finalize handle cleanup, then verify child process is gone
    await new Promise((r) => setTimeout(r, 300));
    const stillAlive = isPidAlive(childPid);
    if (stillAlive && process.platform === 'win32') {
      // Fallback cleanup so test runner never leaks if platform check saw transient state
      await execFileAsync('taskkill', ['/PID', String(childPid), '/T', '/F']).catch(() => {});
    }
    expect(stillAlive).toBe(false);
  }, 15_000);
});
