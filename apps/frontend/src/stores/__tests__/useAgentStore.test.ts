import { describe, it, expect, beforeEach } from 'vitest';
import { useAgentStore } from '../useAgentStore';
import { AgentProtocol } from '@ag/protocol';

describe('useAgentStore', () => {
  beforeEach(() => {
    useAgentStore.getState().clear();
  });

  it('Test D - Stale event rejection', () => {
    const store = useAgentStore.getState();

    // Apply initial snapshot with sequence = 100
    store.applySnapshot({
      agentId: 'agent-1',
      workspaceId: 'ws-1',
      state: AgentProtocol.AgentState.Planning,
      displayMessages: [],
      sequence: 100,
    });

    let currentState = useAgentStore.getState();
    expect(currentState.lastSequence).toBe(100);

    // Inject event sequence = 99 (Expected: IGNORED)
    store.processEvent({
      eventId: 'e1',
      agentId: 'agent-1',
      workspaceId: 'ws-1',
      sequence: 99,
      timestamp: Date.now(),
      type: AgentProtocol.AgentEventType.StateChanged,
      payload: {
        type: AgentProtocol.AgentEventType.StateChanged,
        agentId: 'agent-1',
        state: AgentProtocol.AgentState.CallingProvider,
      },
    });

    currentState = useAgentStore.getState();
    expect(currentState.lastSequence).toBe(100);
    expect(currentState.state).toBe(AgentProtocol.AgentState.Planning);

    // Inject event sequence = 101 (Expected: APPLIED)
    store.processEvent({
      eventId: 'e2',
      agentId: 'agent-1',
      workspaceId: 'ws-1',
      sequence: 101,
      timestamp: Date.now(),
      type: AgentProtocol.AgentEventType.StateChanged,
      payload: {
        type: AgentProtocol.AgentEventType.StateChanged,
        agentId: 'agent-1',
        state: AgentProtocol.AgentState.CallingProvider,
      },
    });

    currentState = useAgentStore.getState();
    expect(currentState.lastSequence).toBe(101);
    expect(currentState.state).toBe(AgentProtocol.AgentState.CallingProvider);

    // Inject event sequence = 101 again (Expected: IGNORED)
    store.processEvent({
      eventId: 'e3',
      agentId: 'agent-1',
      workspaceId: 'ws-1',
      sequence: 101,
      timestamp: Date.now(),
      type: AgentProtocol.AgentEventType.StateChanged,
      payload: {
        type: AgentProtocol.AgentEventType.StateChanged,
        agentId: 'agent-1',
        state: AgentProtocol.AgentState.Streaming,
      },
    });

    currentState = useAgentStore.getState();
    expect(currentState.lastSequence).toBe(101); // remains 101
    expect(currentState.state).toBe(AgentProtocol.AgentState.CallingProvider); // remains CallingProvider
  });

  it('Test E - Multiple agents isolation', () => {
    const store = useAgentStore.getState();

    // Initial agent A
    store.applySnapshot({
      agentId: 'agent-A',
      workspaceId: 'ws-A',
      state: AgentProtocol.AgentState.Planning,
      displayMessages: [],
      sequence: 10,
    });

    // Event from agent B (should be ignored since we are tracking agent-A)
    store.processEvent({
      eventId: 'e1',
      agentId: 'agent-B',
      workspaceId: 'ws-B',
      sequence: 11,
      timestamp: Date.now(),
      type: AgentProtocol.AgentEventType.StateChanged,
      payload: {
        type: AgentProtocol.AgentEventType.StateChanged,
        agentId: 'agent-B',
        state: AgentProtocol.AgentState.Completed,
      },
    });

    const currentState = useAgentStore.getState();
    expect(currentState.agentId).toBe('agent-A');
    expect(currentState.workspaceId).toBe('ws-A');
    expect(currentState.state).toBe(AgentProtocol.AgentState.Planning);
  });
});
