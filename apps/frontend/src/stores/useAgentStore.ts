import { create } from 'zustand';
import { AgentProtocol } from '@ag/protocol';

interface AgentStateStore {
  agentId: string | null;
  workspaceId: string | null;
  state: AgentProtocol.AgentState;
  statusReason: string | null;
  activeToolName: string | null;
  lastError: string | null;
  plan: AgentProtocol.AgentPlan | null;
  displayMessages: AgentProtocol.DisplayMessage[];
  pendingApproval: AgentProtocol.AgentSnapshot['pendingApproval'] | null;
  specialistActivities: AgentProtocol.SpecialistDelegationPayload[];
  commandExecutions: Record<string, AgentProtocol.ActiveCommandExecutionSnapshot>;
  commandExecutionOrder: string[];
  lastSequence: number;

  beginRun: (workspaceId: string) => void;
  setError: (error: string | null) => void;
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
  statusReason: null,
  activeToolName: null,
  lastError: null,
  plan: null,
  displayMessages: [],
  pendingApproval: null,
  specialistActivities: [],
  commandExecutions: {},
  commandExecutionOrder: [],
  lastSequence: 0,

  beginRun: (workspaceId: string) => {
    set({
      agentId: null,
      workspaceId,
      state: AgentProtocol.AgentState.Planning,
      statusReason: 'Starting agent session...',
      activeToolName: null,
      lastError: null,
      pendingApproval: null,
      specialistActivities: [],
      commandExecutions: {},
      commandExecutionOrder: [],
      lastSequence: 0,
    });
  },

  setError: (error: string | null) => {
    set((current) => ({
      lastError: error,
      state: error ? AgentProtocol.AgentState.Failed : current.state,
      statusReason: error || current.statusReason,
    }));
  },

  applySnapshot: (snapshot) => {
    if (!snapshot || typeof snapshot !== 'object' || !snapshot.state || !snapshot.agentId) {
      return;
    }

    const current = get();
    const incomingMessages = Array.isArray(snapshot.displayMessages)
      ? snapshot.displayMessages
      : [];

    // Preserve optimistic local messages if snapshot arrived before main-process memory saved them
    const nextMessages =
      incomingMessages.length >= current.displayMessages.length
        ? incomingMessages
        : current.displayMessages;

    const nextExecutions: Record<string, AgentProtocol.ActiveCommandExecutionSnapshot> = {
      ...current.commandExecutions,
    };
    const nextOrder = [...current.commandExecutionOrder];
    if (Array.isArray(snapshot.activeCommandExecutions)) {
      for (const exec of snapshot.activeCommandExecutions) {
        if (!nextExecutions[exec.commandId]) {
          nextOrder.push(exec.commandId);
        }
        nextExecutions[exec.commandId] = exec;
      }
    }

    set({
      agentId: snapshot.agentId,
      workspaceId: snapshot.workspaceId || current.workspaceId,
      state: snapshot.state,
      displayMessages: nextMessages,
      pendingApproval: snapshot.pendingApproval || null,
      plan: snapshot.plan ?? current.plan,
      commandExecutions: nextExecutions,
      commandExecutionOrder: nextOrder,
      lastSequence:
        typeof snapshot.sequence === 'number'
          ? Math.max(current.lastSequence, snapshot.sequence)
          : current.lastSequence,
    });
  },

  addUserMessage: (content: string) => {
    const messages = [
      ...get().displayMessages,
      {
        id: crypto.randomUUID(),
        role: 'user' as const,
        content,
        timestamp: Date.now(),
      },
    ];
    set({ displayMessages: messages });
  },

  addToolResultMessage: (toolCallId: string, content: string) => {
    const messages = [
      ...get().displayMessages,
      {
        id: crypto.randomUUID(),
        role: 'tool' as const,
        content,
        timestamp: Date.now(),
        toolCallId,
      },
    ];
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
        if (payload.state) {
          updates.state = payload.state;
        }
        updates.statusReason = payload.reason || null;

        if (payload.state === AgentProtocol.AgentState.Failed) {
          updates.lastError = payload.reason || 'Agent execution failed.';
        } else if (
          payload.state === AgentProtocol.AgentState.Planning ||
          payload.state === AgentProtocol.AgentState.CallingProvider
        ) {
          updates.lastError = null;
        }

        if (payload.state !== AgentProtocol.AgentState.AwaitingApproval) {
          updates.pendingApproval = null;
        }
        if (
          payload.state !== AgentProtocol.AgentState.ExecutingTool &&
          payload.state !== AgentProtocol.AgentState.ToolCallPending
        ) {
          updates.activeToolName = null;
        }
        break;
      }

      case AgentProtocol.AgentEventType.PlanUpdated: {
        const payload = event.payload as AgentProtocol.PlanUpdatedEvent;
        if (payload?.plan) {
          updates.plan = payload.plan;
        }
        break;
      }

      case AgentProtocol.AgentEventType.CommandExecutionUpdated: {
        const payload = event.payload as AgentProtocol.CommandExecutionUpdatedEvent;
        const exec = payload?.execution;
        if (exec?.commandId) {
          const isNew = !currentState.commandExecutions[exec.commandId];
          updates.commandExecutions = {
            ...currentState.commandExecutions,
            [exec.commandId]: exec,
          };
          if (isNew) {
            updates.commandExecutionOrder = [...currentState.commandExecutionOrder, exec.commandId];
          }
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
        updates.activeToolName = payload.toolName;
        updates.state = AgentProtocol.AgentState.AwaitingApproval;
        updates.statusReason = `Waiting for approval to run ${payload.toolName}`;
        break;
      }

      case AgentProtocol.AgentEventType.StreamEvent: {
        const payload = event.payload as AgentProtocol.StreamEventPayload;
        const messages = [...currentState.displayMessages];
        const streamEvent = payload.event;

        if (streamEvent.type === 'text-delta') {
          const prevLast = messages[messages.length - 1];
          if (!prevLast || prevLast.role !== 'assistant') {
            messages.push({
              id: crypto.randomUUID(),
              role: 'assistant',
              content: streamEvent.content || '',
              timestamp: Date.now(),
              toolCalls: [],
            });
          } else {
            messages[messages.length - 1] = {
              ...prevLast,
              content: prevLast.content + (streamEvent.content || ''),
            };
          }
        } else if (streamEvent.type === 'tool-call-complete') {
          const prevLast = messages[messages.length - 1];
          const toolCall =
            streamEvent.toolCall && streamEvent.toolCall.id && streamEvent.toolCall.name
              ? {
                  id: streamEvent.toolCall.id,
                  name: streamEvent.toolCall.name,
                  arguments: streamEvent.toolCall.arguments || {},
                }
              : null;

          if (toolCall && toolCall.name !== 'update_plan') {
            updates.activeToolName = toolCall.name;
          }

          if (!prevLast || prevLast.role !== 'assistant') {
            messages.push({
              id: crypto.randomUUID(),
              role: 'assistant',
              content: '',
              timestamp: Date.now(),
              toolCalls: toolCall ? [toolCall] : [],
            });
          } else {
            messages[messages.length - 1] = {
              ...prevLast,
              toolCalls: toolCall
                ? [...(prevLast.toolCalls || []), toolCall]
                : prevLast.toolCalls || [],
            };
          }
        }

        updates.displayMessages = messages;
        break;
      }

      case AgentProtocol.AgentEventType.SpecialistDelegation: {
        const payload = event.payload as AgentProtocol.SpecialistDelegationPayload;
        const currentActivities = [...(currentState.specialistActivities || [])];
        const existingIdx = currentActivities.findIndex(
          (a) => a.specialistName === payload.specialistName && a.status === 'running'
        );
        if (existingIdx >= 0 && (payload.status === 'completed' || payload.status === 'failed')) {
          currentActivities[existingIdx] = payload;
        } else {
          currentActivities.push(payload);
        }
        updates.specialistActivities = currentActivities;
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
      statusReason: null,
      activeToolName: null,
      lastError: null,
      plan: null,
      displayMessages: [],
      pendingApproval: null,
      specialistActivities: [],
      commandExecutions: {},
      commandExecutionOrder: [],
      lastSequence: 0,
    });
  },
}));
