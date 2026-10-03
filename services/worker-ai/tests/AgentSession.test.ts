import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentSession } from '../src/AgentSession';
import { AgentProtocol } from '@ag/protocol';
import { AIProvider, AIStreamEventType, AIStreamEvent } from '@ag/ai-providers';
import { ToolRegistry } from '../src/tools/ToolRegistry';

describe('AgentSession', () => {
  let mockProvider: AIProvider;
  let eventEmitter: ReturnType<typeof vi.fn>;
  let toolRegistry: ToolRegistry;
  let capabilityBridge: AgentProtocol.IAgentCapabilityBridge;

  beforeEach(() => {
    mockProvider = {
      completeChat: vi.fn(),
      streamChat: vi.fn()
    } as any;
    eventEmitter = vi.fn();
    toolRegistry = new ToolRegistry();
    capabilityBridge = {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      executeCommand: vi.fn(),
      addEpisodicMemory: vi.fn(),
      getEpisodicMemory: vi.fn().mockResolvedValue([]),
      searchLongTermMemory: vi.fn().mockResolvedValue([])
    } as any;
  });

  it('runs the core loop without tools and completes', async () => {
    // Mock the generator
    mockProvider.streamChat = async function* () {
      yield { type: AIStreamEventType.TextDelta, content: 'Hello' } as AIStreamEvent;
      yield { type: AIStreamEventType.Finish, finishReason: 'stop' } as AIStreamEvent;
    } as any;

    const session = new AgentSession('test-agent-1', 'ws-1', mockProvider, eventEmitter, toolRegistry, capabilityBridge);

    await session.start('test prompt');

    expect(session.state).toBe(AgentProtocol.AgentState.Completed);
    // State transitions: Idle -> Planning -> CallingProvider -> Streaming -> Completed
    const states = eventEmitter.mock.calls
      .filter(c => c[0].type === AgentProtocol.AgentEventType.StateChanged)
      .map(c => (c[0].payload as any).state);

    expect(states).toEqual([
      AgentProtocol.AgentState.Planning,
      AgentProtocol.AgentState.CallingProvider,
      AgentProtocol.AgentState.Streaming,
      AgentProtocol.AgentState.Completed
    ]);
  });

  it('handles simulated tools and loops', async () => {
    let callCount = 0;
    mockProvider.streamChat = async function* () {
      callCount++;
      if (callCount === 1) {
        yield {
          type: AIStreamEventType.ToolCallComplete,
          toolCall: { id: 'call_1', name: 'dummy_tool', arguments: { action: 'run' } }
        } as AIStreamEvent;
      } else {
        yield { type: AIStreamEventType.TextDelta, content: 'Done' } as AIStreamEvent;
      }
    } as any;

    toolRegistry.register({
      definition: {
        name: 'dummy_tool',
        description: 'dummy',
        inputSchema: { type: 'object', properties: { action: { type: 'string' } } },
        riskLevel: 'read'
      },
      execute: async () => ({ content: 'done', truncated: false, originalSize: 4 })
    });

    const session = new AgentSession('test-agent-2', 'ws-1', mockProvider, eventEmitter, toolRegistry, capabilityBridge);
    await session.start('test tool');

    expect(session.state).toBe(AgentProtocol.AgentState.Completed);
    expect(callCount).toBe(2); // looped once
  });

  it('cancels deterministically', async () => {
    mockProvider.streamChat = async function* (req, signal) {
      // simulate long running
      yield { type: AIStreamEventType.TextDelta, content: 'start' } as AIStreamEvent;
      await new Promise(resolve => setTimeout(resolve, 50));
      if (signal?.aborted) {
        const err = new Error('Cancelled');
        (err as any).type = 'Cancelled';
        throw err;
      }
    } as any;

    const session = new AgentSession('test-agent-3', 'ws-1', mockProvider, eventEmitter, toolRegistry, capabilityBridge);

    const startPromise = session.start('test cancel');
    // wait until it's streaming
    await new Promise(resolve => {
      const check = setInterval(() => {
        if (session.state === AgentProtocol.AgentState.Streaming) {
          clearInterval(check);
          resolve(null);
        }
      }, 10);
    });
    session.cancel();
    await startPromise;

    expect(session.state).toBe(AgentProtocol.AgentState.Cancelled);
  });

  it('fails on MAX_ITERATIONS exhaustion', async () => {
    mockProvider.streamChat = async function* () {
      yield {
        type: AIStreamEventType.ToolCallComplete,
        toolCall: { id: 'call_inf', name: 'dummy_tool', arguments: { action: 'run' } }
      } as AIStreamEvent;
    } as any;

    toolRegistry.register({
      definition: {
        name: 'dummy_tool',
        description: 'dummy',
        inputSchema: { type: 'object', properties: { action: { type: 'string' } } },
        riskLevel: 'read'
      },
      execute: async () => ({ content: 'done', truncated: false, originalSize: 4 })
    });

    const session = new AgentSession('test-agent-4', 'ws-1', mockProvider, eventEmitter, toolRegistry, capabilityBridge);
    await session.start('inf loop');

    expect(session.state).toBe(AgentProtocol.AgentState.Failed);

    const failedEvent = eventEmitter.mock.calls.find(c =>
      c[0].type === AgentProtocol.AgentEventType.StateChanged &&
      (c[0].payload as any).state === AgentProtocol.AgentState.Failed
    );
    expect((failedEvent[0].payload as any).reason).toContain('Exceeded MAX_ITERATIONS');
  });

  it('fails on consecutive tool errors (recovery budget)', async () => {
    mockProvider.streamChat = async function* () {
      yield {
        type: AIStreamEventType.ToolCallComplete,
        toolCall: { id: 'call_err', name: 'error_tool', arguments: {} }
      } as AIStreamEvent;
    } as any;

    toolRegistry.register({
      definition: {
        name: 'error_tool',
        description: 'dummy error',
        inputSchema: { type: 'object', properties: {} },
        riskLevel: 'read'
      },
      execute: async () => { throw new Error('Boom'); }
    });

    const session = new AgentSession('test-agent-5', 'ws-1', mockProvider, eventEmitter, toolRegistry, capabilityBridge);
    await session.start('fail loop');

    expect(session.state).toBe(AgentProtocol.AgentState.Failed);

    const failedEvent = eventEmitter.mock.calls.find(c =>
      c[0].type === AgentProtocol.AgentEventType.StateChanged &&
      (c[0].payload as any).state === AgentProtocol.AgentState.Failed
    );
    expect((failedEvent[0].payload as any).reason).toContain('Exceeded MAX_CONSECUTIVE_ERRORS');
  });

  it('recovers from tool error and resets budget', async () => {
    let callCount = 0;
    mockProvider.streamChat = async function* () {
      callCount++;
      if (callCount === 1) {
        yield {
          type: AIStreamEventType.ToolCallComplete,
          toolCall: { id: 'call_err', name: 'error_tool', arguments: {} }
        } as AIStreamEvent;
      } else if (callCount === 2) {
        yield {
          type: AIStreamEventType.ToolCallComplete,
          toolCall: { id: 'call_succ', name: 'success_tool', arguments: {} }
        } as AIStreamEvent;
      } else {
        yield { type: AIStreamEventType.Finish, finishReason: 'stop' } as AIStreamEvent;
      }
    } as any;

    toolRegistry.register({
      definition: {
        name: 'error_tool',
        description: 'dummy',
        inputSchema: { type: 'object', properties: {} },
        riskLevel: 'read'
      },
      execute: async () => { throw new Error('Boom'); }
    });
    
    toolRegistry.register({
      definition: {
        name: 'success_tool',
        description: 'dummy',
        inputSchema: { type: 'object', properties: {} },
        riskLevel: 'read'
      },
      execute: async () => ({ content: 'success', truncated: false })
    });

    const session = new AgentSession('test-agent-6', 'ws-1', mockProvider, eventEmitter, toolRegistry, capabilityBridge);
    await session.start('recover loop');

    expect(session.state).toBe(AgentProtocol.AgentState.Completed);
    expect(callCount).toBe(3); // 1 err, 1 succ, 1 finish
  });

  it('handles update_plan tool', async () => {
    let callCount = 0;
    mockProvider.streamChat = async function* () {
      callCount++;
      if (callCount === 1) {
        yield {
          type: AIStreamEventType.ToolCallComplete,
          toolCall: { id: 'call_plan', name: 'update_plan', arguments: { steps: [{ id: '1', description: 'test', status: 'pending' }] } }
        } as AIStreamEvent;
      } else {
        yield { type: AIStreamEventType.Finish, finishReason: 'stop' } as AIStreamEvent;
      }
    } as any;

    const session = new AgentSession('test-agent-7', 'ws-1', mockProvider, eventEmitter, toolRegistry, capabilityBridge);
    await session.start('plan loop');

    const failedEvent = eventEmitter.mock.calls.find(c => c[0].type === AgentProtocol.AgentEventType.StateChanged && c[0].payload.state === AgentProtocol.AgentState.Failed);
    if (failedEvent) console.log("FAILED REASON:", failedEvent[0].payload.reason);

    expect(session.state).toBe(AgentProtocol.AgentState.Completed);
    expect(session.plan).toBeDefined();
    expect(session.plan?.steps[0].description).toBe('test');
    
    const planEvent = eventEmitter.mock.calls.find(c =>
      c[0].type === AgentProtocol.AgentEventType.PlanUpdated
    );
    expect(planEvent).toBeDefined();
  });
});
