import { create } from 'zustand';
import { AgentProtocol } from '@ag/protocol';

interface AgentStateStore {
  agentId: string | null;
  workspaceId: string | null;
  state: AgentProtocol.AgentState;
  displayMessages: AgentProtocol.DisplayMessage[];
  pendingApproval: AgentProtocol.AgentSnapshot['pendingApproval'] | null;
  lastSequence: number;

  applySnapshot: (snapshot: AgentProtocol.AgentSnapshot) => void;
  processEvent: (event: AgentProtocol.AgentEventEnvelope) => void;
  addUserMessage: (content: string) => void;
  addToolResultMessage: (toolCallId: string, content: string) => void;
  clear: () => void;
}

export const useAgentStore = create<AgentStateStore>((set, get) => ({
  agentId: null,
  workspaceId: null,
  state: AgentProtocol.AgentState.Idle,
  displayMessages: [],
  pendingApproval: null,
  lastSequence: 0,

  applySnapshot: (snapshot) => {
    set({
      agentId: snapshot.agentId,
      workspaceId: snapshot.workspaceId,
      state: snapshot.state,
      displayMessages: snapshot.displayMessages || [],
      pendingApproval: snapshot.pendingApproval || null,
      lastSequence: snapshot.sequence,
    });
  },

  addUserMessage: (content: string) => {
    const messages = [...get().displayMessages];
    messages.push({
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now(),
    });
    set({ displayMessages: messages });
  },

  addToolResultMessage: (toolCallId: string, content: string) => {
    const messages = [...get().displayMessages];
    messages.push({
      id: crypto.randomUUID(),
      role: 'tool',
      content,
      timestamp: Date.now(),
      toolCallId,
    });
    set({ displayMessages: messages });
  },

  processEvent: (event) => {
    const currentState = get();

    // Ignore events for other agents
    if (currentState.agentId && currentState.agentId !== event.agentId) {
      return;
    }

    // Sequence correlation check
    if (event.sequence <= currentState.lastSequence) {
      console.warn(
        `[AgentStore] Dropping stale event seq=${event.sequence} (lastSeq=${currentState.lastSequence})`
      );
      return;
    }

    const updates: Partial<AgentStateStore> = {
      lastSequence: event.sequence,
      agentId: event.agentId,
      workspaceId: event.workspaceId,
    };

    switch (event.type) {
      case AgentProtocol.AgentEventType.StateChanged: {
        const payload = event.payload as AgentProtocol.StateChangedEvent;
        updates.state = payload.state;
        if (payload.state !== AgentProtocol.AgentState.AwaitingApproval) {
          updates.pendingApproval = null;
        }
        break;
      }

      case AgentProtocol.AgentEventType.ToolApprovalRequested: {
        const payload = event.payload as AgentProtocol.ToolApprovalRequestedEvent;
        updates.pendingApproval = {
          approvalId: payload.approvalId,
          toolCallId: payload.toolCallId,
          toolName: payload.toolName,
          arguments: payload.arguments,
        };
        updates.state = AgentProtocol.AgentState.AwaitingApproval;
        break;
      }

      case AgentProtocol.AgentEventType.StreamEvent: {
        const payload = event.payload as AgentProtocol.StreamEventPayload;
        const messages = [...currentState.displayMessages];
        const streamEvent = payload.event;

        if (streamEvent.type === 'text-delta') {
          let lastMsg = messages[messages.length - 1];
          if (!lastMsg || lastMsg.role !== 'assistant') {
            lastMsg = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: '',
              timestamp: Date.now(),
              toolCalls: [],
            };
            messages.push(lastMsg);
          }
          lastMsg.content += streamEvent.content || '';
        } else if (streamEvent.type === 'tool-call-complete') {
          let lastMsg = messages[messages.length - 1];
          if (!lastMsg || lastMsg.role !== 'assistant') {
            lastMsg = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: '',
              timestamp: Date.now(),
              toolCalls: [],
            };
            messages.push(lastMsg);
          }
          if (!lastMsg.toolCalls) lastMsg.toolCalls = [];
          if (streamEvent.toolCall && streamEvent.toolCall.id && streamEvent.toolCall.name) {
            lastMsg.toolCalls.push({
              id: streamEvent.toolCall.id,
              name: streamEvent.toolCall.name,
              arguments: streamEvent.toolCall.arguments || {},
            });
          }
        }

        updates.displayMessages = messages;
        break;
      }
    }

    set(updates);
  },

  clear: () => {
    set({
      agentId: null,
      workspaceId: null,
      state: AgentProtocol.AgentState.Idle,
      displayMessages: [],
      pendingApproval: null,
      lastSequence: 0,
    });
  },
}));
