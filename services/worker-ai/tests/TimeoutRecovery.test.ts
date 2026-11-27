import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentSession } from '../src/AgentSession';
import type { DelegationContext } from '../src/DelegationContext';
import { AgentProtocol } from '@ag/protocol';
import { AIProvider, AIStreamEventType, AIStreamEvent } from '@ag/ai-providers';
import { ToolRegistry } from '../src/tools/ToolRegistry';
import { ExecuteCommandTool } from '../src/tools/builtin/ExecuteCommandTool';
import { ExtendCommandTimeoutTool } from '../src/tools/builtin/ExtendCommandTimeoutTool';

function makeDelegation(): DelegationContext {
  return {
    executionId: 'exec-timeout-001',
    userId: 'user-timeout',
    orgId: 'org-timeout',
    scope: 'agent:execute',
    jti: 'jti-timeout-001',
  };
}

describe('Worker-AI Agent Timeout Recovery & Confirmation Policy', () => {
  let mockProvider: AIProvider;
  let eventEmitter: ReturnType<typeof vi.fn>;
  let toolRegistry: ToolRegistry;
  let capabilityBridge: AgentProtocol.IAgentCapabilityBridge;

  beforeEach(() => {
    mockProvider = {
      completeChat: vi.fn(),
      streamChat: vi.fn(),
    } as any;
    eventEmitter = vi.fn();
    toolRegistry = new ToolRegistry();
    toolRegistry.register(new ExecuteCommandTool());
    toolRegistry.register(new ExtendCommandTimeoutTool());

    capabilityBridge = {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      executeCommand: vi.fn(),
      extendCommandTimeout: vi.fn(),
      getTimeoutPolicy: vi.fn().mockReturnValue({
        defaultTimeoutMs: 120_000,
        maxPermittedTimeoutMs: 600_000,
        allowAgentExtension: true,
        requireConfirmationForLongCommands: true,
        terminationGracePeriodMs: 5_000,
        warningThresholdRatio: 0.75,
        criticalThresholdRatio: 0.9,
      }),
      addEpisodicMemory: vi.fn(),
      getEpisodicMemory: vi.fn().mockResolvedValue([]),
      searchLongTermMemory: vi.fn().mockResolvedValue([]),
    } as any;
  });

  it('6 & 7. survives command timeout, receives structured timeout output, retries with longer timeout, and completes', async () => {
    let llmTurn = 0;
    const seenToolResults: string[] = [];

    mockProvider.streamChat = async function* (req: any) {
      llmTurn++;
      const toolMessages = (req.messages || []).filter((m: any) => m.role === 'tool');
      if (toolMessages.length > 0) {
        seenToolResults.push(toolMessages[toolMessages.length - 1].content);
      }

      if (llmTurn === 1) {
        yield {
          type: AIStreamEventType.ToolCallComplete,
          toolCall: {
            id: 'tc-1',
            name: 'execute_command',
            arguments: {
              command: 'npm test',
              description: 'Run unit test suite',
              timeoutSeconds: 10,
            },
          },
        } as AIStreamEvent;
        yield { type: AIStreamEventType.Finish, finishReason: 'tool_calls' } as AIStreamEvent;
      } else if (llmTurn === 2) {
        // Recover from timeout by inspecting output and using justified longer timeout
        yield {
          type: AIStreamEventType.ToolCallComplete,
          toolCall: {
            id: 'tc-2',
            name: 'execute_command',
            arguments: {
              command: 'npm test -- --run',
              description: 'Re-run tests with extended timeout',
              timeoutSeconds: 120,
            },
          },
        } as AIStreamEvent;
        yield { type: AIStreamEventType.Finish, finishReason: 'tool_calls' } as AIStreamEvent;
      } else {
        yield {
          type: AIStreamEventType.TextDelta,
          content: 'Recovered after timeout and verified all tests pass.',
        } as AIStreamEvent;
        yield { type: AIStreamEventType.Finish, finishReason: 'stop' } as AIStreamEvent;
      }
    } as any;

    vi.mocked(capabilityBridge.executeCommand)
      .mockResolvedValueOnce({
        commandId: 'cmd-1',
        command: 'npm test',
        description: 'Run unit test suite',
        outcome: 'timed_out',
        timedOut: true,
        cancelled: false,
        exitCode: -1,
        stdout: 'Running 42 tests...\nStill waiting...',
        stderr: '',
        configuredTimeoutMs: 10_000,
        elapsedMs: 10_040,
        terminationResult: 'Forcefully terminated Windows process tree after 5s grace period',
      })
      .mockResolvedValueOnce({
        commandId: 'cmd-2',
        command: 'npm test -- --run',
        description: 'Re-run tests with extended timeout',
        outcome: 'completed',
        timedOut: false,
        cancelled: false,
        exitCode: 0,
        stdout: 'All 42 tests passed.',
        stderr: '',
        configuredTimeoutMs: 120_000,
        elapsedMs: 18_200,
      });

    const session = new AgentSession(
      'agent-recovery-1',
      'ws-1',
      makeDelegation(),
      mockProvider,
      eventEmitter,
      toolRegistry,
      capabilityBridge,
      { autoApprove: true, maxIterations: 6 }
    );

    await session.start('Run the test suite and verify everything passes.');

    expect(session.state).toBe(AgentProtocol.AgentState.Completed);
    expect(llmTurn).toBe(3);

    // Confirm structured timeout details reached the agent
    expect(seenToolResults[0]).toContain('Outcome: timed_out');
    expect(seenToolResults[0]).toContain('Command ID: cmd-1');
    expect(seenToolResults[0]).toContain('Configured Timeout: 10s (10000ms)');
    expect(seenToolResults[0]).toContain('Elapsed Time: 10s (10040ms)');
    expect(seenToolResults[0]).toContain('Forcefully terminated Windows process tree');
    expect(seenToolResults[0]).toContain('TIMEOUT RECOVERY GUIDANCE');

    // Confirm recovery run executed cleanly
    expect(seenToolResults[1]).toContain('Outcome: completed');
    expect(seenToolResults[1]).toContain('All 42 tests passed.');
  });

  it('requires manual user confirmation for long-running commands even when autoApprove is true', async () => {
    let turn = 0;
    mockProvider.streamChat = async function* () {
      turn++;
      if (turn === 1) {
        yield {
          type: AIStreamEventType.ToolCallComplete,
          toolCall: {
            id: 'tc-long-1',
            name: 'execute_command',
            arguments: {
              command: 'npm run build:all',
              timeoutSeconds: 300, // Exceeds 120s default
            },
          },
        } as AIStreamEvent;
        yield { type: AIStreamEventType.Finish, finishReason: 'tool_calls' } as AIStreamEvent;
      } else {
        yield { type: AIStreamEventType.TextDelta, content: 'Done' } as AIStreamEvent;
        yield { type: AIStreamEventType.Finish, finishReason: 'stop' } as AIStreamEvent;
      }
    } as any;

    vi.mocked(capabilityBridge.executeCommand).mockResolvedValue({
      commandId: 'cmd-long-1',
      outcome: 'completed',
      timedOut: false,
      exitCode: 0,
      stdout: 'Built',
      stderr: '',
      configuredTimeoutMs: 300_000,
      elapsedMs: 1200,
    });

    const session = new AgentSession(
      'agent-confirm-long',
      'ws-1',
      makeDelegation(),
      mockProvider,
      eventEmitter,
      toolRegistry,
      capabilityBridge,
      { autoApprove: true }
    );

    const runPromise = session.start('Run long build');

    // Wait until ToolApprovalRequested (manual) fires
    let approvalPayload: AgentProtocol.ToolApprovalRequestedEvent | undefined;
    for (let i = 0; i < 30; i++) {
      const evt = eventEmitter.mock.calls
        .map((c) => c[0])
        .find((e) => e.type === AgentProtocol.AgentEventType.ToolApprovalRequested);
      if (evt) {
        approvalPayload = evt.payload;
        break;
      }
      await new Promise((r) => setTimeout(r, 15));
    }

    expect(approvalPayload).toBeDefined();
    expect(approvalPayload?.approvalMode).toBe('manual');
    expect(session.state).toBe(AgentProtocol.AgentState.AwaitingApproval);

    session.handleApproval(approvalPayload!.approvalId, approvalPayload!.toolCallId, true);
    await runPromise;

    expect(session.state).toBe(AgentProtocol.AgentState.Completed);
    expect(capabilityBridge.executeCommand).toHaveBeenCalledTimes(1);
  });

  it('routes ExtendCommandTimeoutTool to bridge with agent requester identity', async () => {
    vi.mocked(capabilityBridge.extendCommandTimeout!).mockResolvedValueOnce({
      granted: true,
      newTimeoutMs: 240_000,
      deadlineAt: Date.now() + 240_000,
      addedMs: 120_000,
      reason: 'Compiling native modules',
    });

    const tool = new ExtendCommandTimeoutTool();
    const res = await tool.execute(
      { commandId: 'cmd-active-1', additionalSeconds: 120, reason: 'Compiling native modules' },
      capabilityBridge,
      {
        agentId: 'agent-1',
        workspaceId: 'ws-1',
        signal: new AbortController().signal,
      }
    );

    expect(capabilityBridge.extendCommandTimeout).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'agent-1', workspaceId: 'ws-1' }),
      'cmd-active-1',
      120_000,
      'agent',
      'Compiling native modules'
    );
    expect(JSON.parse(res.content).granted).toBe(true);
  });
});
