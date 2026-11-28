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

  it('Test F - Multi-conversation history preserves, switches, pins, renames, and archives conversations', () => {
    const store = useAgentStore.getState();

    store.addUserMessage('First conversation prompt');
    const firstId = useAgentStore.getState().activeConversationId;
    store.renameConversation('Auth Investigation', firstId);
    store.togglePinConversation(firstId);

    // Create a second conversation without losing the first
    store.createNewConversation('ws-2');
    const secondId = useAgentStore.getState().activeConversationId;
    expect(secondId).not.toBe(firstId);
    expect(useAgentStore.getState().displayMessages).toHaveLength(0);

    store.addUserMessage('Second conversation prompt');

    // Switch back to the first conversation
    store.selectConversation(firstId);
    const restored = useAgentStore.getState();
    expect(restored.activeConversationId).toBe(firstId);
    expect(restored.customTitle).toBe('Auth Investigation');
    expect(restored.isPinned).toBe(true);
    expect(restored.displayMessages.map((m) => m.content)).toEqual(['First conversation prompt']);

    // Archive first conversation cleanly
    store.archiveConversation(firstId);
    const afterArchive = useAgentStore.getState();
    expect(afterArchive.activeConversationId).not.toBe(firstId);
    const archivedRecord = afterArchive.conversations.find((c) => c.id === firstId);
    expect(archivedRecord?.archived).toBe(true);
  });
});
