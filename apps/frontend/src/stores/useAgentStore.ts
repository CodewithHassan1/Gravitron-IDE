import { create } from 'zustand';
import { AgentProtocol } from '@ag/protocol';

const STORAGE_KEY = 'ag_agent_conversations_v1';
const MAX_STORED_CONVERSATIONS = 30;

function generateId(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface AgentConversationRecord {
  id: string;
  title: string;
  customTitle: string | null;
  pinned: boolean;
  archived: boolean;
  workspaceId: string | null;
  agentId: string | null;
  state: AgentProtocol.AgentState;
  statusReason: string | null;
  activeToolName: string | null;
  lastError: string | null;
  plan: AgentProtocol.AgentPlan | null;
  displayMessages: AgentProtocol.DisplayMessage[];
  specialistActivities: AgentProtocol.SpecialistDelegationPayload[];
  commandExecutions: Record<string, AgentProtocol.ActiveCommandExecutionSnapshot>;
  commandExecutionOrder: string[];
  lastSequence: number;
  createdAt: number;
  updatedAt: number;
}

function computeConversationTitle(
  customTitle: string | null,
  messages: AgentProtocol.DisplayMessage[]
): string {
  if (customTitle && customTitle.trim()) return customTitle.trim();
  const firstUserMsg = messages.find((m) => m.role === 'user');
  if (!firstUserMsg || !firstUserMsg.content) return 'New Chat';
  const firstLine = firstUserMsg.content.trim().replace(/^#+\s*/, '').split('\n')[0].trim();
  return firstLine || 'New Chat';
}

function createEmptyConversation(
  workspaceId: string | null = null,
  id: string = generateId()
): AgentConversationRecord {
  const now = Date.now();
  return {
    id,
    title: 'New Chat',
    customTitle: null,
    pinned: false,
    archived: false,
    workspaceId,
    agentId: null,
    state: AgentProtocol.AgentState.Idle,
    statusReason: null,
    activeToolName: null,
    lastError: null,
    plan: null,
    displayMessages: [],
    specialistActivities: [],
    commandExecutions: {},
    commandExecutionOrder: [],
    lastSequence: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function persistConversations(conversations: AgentConversationRecord[]): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    // Only persist non-empty or named/pinned conversations (capped at MAX_STORED_CONVERSATIONS)
    const meaningful = conversations
      .filter(
        (c) =>
          c.displayMessages.length > 0 ||
          Boolean(c.customTitle) ||
          c.pinned ||
          c.archived ||
          Boolean(c.agentId)
      )
      .slice(0, MAX_STORED_CONVERSATIONS)
      .map((c) => ({
        ...c,
        // Never persist active spinning transient tool states across full app restarts
        commandExecutions: Object.fromEntries(
          Object.entries(c.commandExecutions || {}).map(([k, v]) => [
            k,
            v.status === 'running' ||
              v.status === 'warning' ||
              v.status === 'critical' ||
              v.status === 'terminating'
              ? { ...v, status: 'cancelled_by_user' as const }
              : v,
          ])
        ),
      }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(meaningful));
  } catch {
    // Ignore localStorage quota or restricted environment errors
  }
}

function loadPersistedConversations(): AgentConversationRecord[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c) => c && typeof c.id === 'string' && Array.isArray(c.displayMessages));
  } catch {
    return [];
  }
}

interface AgentStateStore {
  activeConversationId: string;
  conversations: AgentConversationRecord[];
  customTitle: string | null;
  isPinned: boolean;
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
  createNewConversation: (workspaceId?: string | null) => void;
  selectConversation: (conversationId: string) => void;
  renameConversation: (title: string, conversationId?: string) => void;
  togglePinConversation: (conversationId?: string) => void;
  archiveConversation: (conversationId?: string) => void;
  deleteConversation: (conversationId: string) => void;
  hydrateConversations: () => void;
  clear: () => void;
}

function syncActiveRecord(
  current: AgentStateStore,
  nextFields: Partial<AgentStateStore>
): AgentConversationRecord[] {
  const merged = { ...current, ...nextFields };
  const activeId = merged.activeConversationId;
  const now = Date.now();
  const title = computeConversationTitle(merged.customTitle, merged.displayMessages);

  const updatedRecord: AgentConversationRecord = {
    id: activeId,
    title,
    customTitle: merged.customTitle,
    pinned: merged.isPinned,
    archived: false,
    workspaceId: merged.workspaceId,
    agentId: merged.agentId,
    state: merged.state,
    statusReason: merged.statusReason,
    activeToolName: merged.activeToolName,
    lastError: merged.lastError,
    plan: merged.plan,
    displayMessages: merged.displayMessages,
    specialistActivities: merged.specialistActivities,
    commandExecutions: merged.commandExecutions,
    commandExecutionOrder: merged.commandExecutionOrder,
    lastSequence: merged.lastSequence,
    createdAt: current.conversations.find((c) => c.id === activeId)?.createdAt ?? now,
    updatedAt: now,
  };

  const existingIdx = current.conversations.findIndex((c) => c.id === activeId);
  let nextConversations: AgentConversationRecord[];
  if (existingIdx >= 0) {
    nextConversations = [...current.conversations];
    nextConversations[existingIdx] = {
      ...nextConversations[existingIdx],
      ...updatedRecord,
      archived: nextConversations[existingIdx].archived,
    };
  } else {
    nextConversations = [updatedRecord, ...current.conversations];
  }

  persistConversations(nextConversations);
  return nextConversations;
}

function applyEventToSnapshotState(
  target: {
    agentId: string | null;
    workspaceId: string | null;
    state: AgentProtocol.AgentState;
    statusReason: string | null;
    activeToolName: string | null;
    lastError: string | null;
    plan: AgentProtocol.AgentPlan | null;
    displayMessages: AgentProtocol.DisplayMessage[];
    pendingApproval?: AgentProtocol.AgentSnapshot['pendingApproval'] | null;
    specialistActivities: AgentProtocol.SpecialistDelegationPayload[];
    commandExecutions: Record<string, AgentProtocol.ActiveCommandExecutionSnapshot>;
    commandExecutionOrder: string[];
    lastSequence: number;
  },
  event: AgentProtocol.AgentEventEnvelope
): Partial<typeof target> | null {
  if (event.sequence <= target.lastSequence) {
    return null;
  }

  const updates: Partial<typeof target> = {
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
        const isNew = !target.commandExecutions[exec.commandId];
        updates.commandExecutions = {
          ...target.commandExecutions,
          [exec.commandId]: exec,
        };
        if (isNew) {
          updates.commandExecutionOrder = [...target.commandExecutionOrder, exec.commandId];
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
      const messages = [...target.displayMessages];
      const streamEvent = payload.event;

      if (streamEvent.type === 'text-delta') {
        const prevLast = messages[messages.length - 1];
        if (!prevLast || prevLast.role !== 'assistant') {
          messages.push({
            id: generateId(),
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
            id: generateId(),
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
      const currentActivities = [...(target.specialistActivities || [])];
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

  return updates;
}

const initialConvId = generateId();

export const useAgentStore = create<AgentStateStore>((set, get) => ({
  activeConversationId: initialConvId,
  conversations: [],
  customTitle: null,
  isPinned: false,
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

  hydrateConversations: () => {
    const persisted = loadPersistedConversations();
    if (persisted.length === 0) return;
    set((current) => {
      const existingIds = new Set(current.conversations.map((c) => c.id));
      const merged = [
        ...current.conversations,
        ...persisted.filter((c) => !existingIds.has(c.id)),
      ];
      return { conversations: merged };
    });
  },

  beginRun: (workspaceId: string) => {
    const current = get();
    const nextFields: Partial<AgentStateStore> = {
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
    };
    const conversations = syncActiveRecord(current, nextFields);
    set({ ...nextFields, conversations });
  },

  setError: (error: string | null) => {
    set((current) => {
      const nextFields: Partial<AgentStateStore> = {
        lastError: error,
        state: error ? AgentProtocol.AgentState.Failed : current.state,
        statusReason: error || current.statusReason,
      };
      const conversations = syncActiveRecord(current, nextFields);
      return { ...nextFields, conversations };
    });
  },

  applySnapshot: (snapshot) => {
    if (!snapshot || typeof snapshot !== 'object' || !snapshot.state || !snapshot.agentId) {
      return;
    }

    const current = get();
    const incomingMessages = Array.isArray(snapshot.displayMessages)
      ? snapshot.displayMessages
      : [];

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

    const nextFields: Partial<AgentStateStore> = {
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
    };
    const conversations = syncActiveRecord(current, nextFields);
    set({ ...nextFields, conversations });
  },

  addUserMessage: (content: string) => {
    const current = get();
    const messages = [
      ...current.displayMessages,
      {
        id: generateId(),
        role: 'user' as const,
        content,
        timestamp: Date.now(),
      },
    ];
    const nextFields: Partial<AgentStateStore> = { displayMessages: messages };
    const conversations = syncActiveRecord(current, nextFields);
    set({ ...nextFields, conversations });
  },

  addToolResultMessage: (toolCallId: string, content: string) => {
    const current = get();
    const messages = [
      ...current.displayMessages,
      {
        id: generateId(),
        role: 'tool' as const,
        content,
        timestamp: Date.now(),
        toolCallId,
      },
    ];
    const nextFields: Partial<AgentStateStore> = { displayMessages: messages };
    const conversations = syncActiveRecord(current, nextFields);
    set({ ...nextFields, conversations });
  },

  processEvent: (event) => {
    const currentState = get();

    // If this event belongs to a DIFFERENT conversation's agentId, either ignore
    // it (Test E isolation) or update that background conversation record cleanly.
    if (currentState.agentId && currentState.agentId !== event.agentId) {
      const bgIdx = currentState.conversations.findIndex((c) => c.agentId === event.agentId);
      if (bgIdx >= 0) {
        const bgConv = currentState.conversations[bgIdx];
        const bgUpdates = applyEventToSnapshotState(bgConv, event);
        if (bgUpdates) {
          const nextConvs = [...currentState.conversations];
          nextConvs[bgIdx] = {
            ...bgConv,
            ...bgUpdates,
            updatedAt: Date.now(),
          };
          persistConversations(nextConvs);
          set({ conversations: nextConvs });
        }
      }
      return;
    }

    if (event.sequence <= currentState.lastSequence) {
      console.warn(
        `[AgentStore] Dropping stale event seq=${event.sequence} (lastSeq=${currentState.lastSequence})`
      );
      return;
    }

    const updates = applyEventToSnapshotState(currentState, event);
    if (!updates) return;

    const conversations = syncActiveRecord(currentState, updates);
    set({ ...updates, conversations });
  },

  createNewConversation: (workspaceId = null) => {
    const current = get();
    const persistedConvs =
      current.displayMessages.length > 0 || current.customTitle || current.isPinned
        ? syncActiveRecord(current, {})
        : current.conversations;

    const newId = generateId();
    const empty = createEmptyConversation(workspaceId ?? current.workspaceId, newId);
    set({
      activeConversationId: empty.id,
      conversations: [empty, ...persistedConvs.filter((c) => c.id !== empty.id)],
      customTitle: null,
      isPinned: false,
      agentId: null,
      workspaceId: workspaceId ?? current.workspaceId,
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

  selectConversation: (conversationId: string) => {
    const current = get();
    if (conversationId === current.activeConversationId) return;

    const savedConvs =
      current.displayMessages.length > 0 || current.customTitle || current.isPinned || current.agentId
        ? syncActiveRecord(current, {})
        : current.conversations;

    const target = savedConvs.find((c) => c.id === conversationId);
    if (!target) return;

    set({
      activeConversationId: target.id,
      conversations: savedConvs,
      customTitle: target.customTitle,
      isPinned: target.pinned,
      agentId: target.agentId,
      workspaceId: target.workspaceId,
      state: target.state,
      statusReason: target.statusReason,
      activeToolName: target.activeToolName,
      lastError: target.lastError,
      plan: target.plan,
      displayMessages: target.displayMessages,
      pendingApproval: null,
      specialistActivities: target.specialistActivities,
      commandExecutions: target.commandExecutions,
      commandExecutionOrder: target.commandExecutionOrder,
      lastSequence: target.lastSequence,
    });
  },

  renameConversation: (title: string, conversationId?: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const current = get();
    const targetId = conversationId || current.activeConversationId;
    if (targetId === current.activeConversationId) {
      const nextFields: Partial<AgentStateStore> = { customTitle: trimmed };
      const conversations = syncActiveRecord(current, nextFields);
      set({ ...nextFields, conversations });
    } else {
      const nextConvs = current.conversations.map((c) =>
        c.id === targetId ? { ...c, customTitle: trimmed, title: trimmed, updatedAt: Date.now() } : c
      );
      persistConversations(nextConvs);
      set({ conversations: nextConvs });
    }
  },

  togglePinConversation: (conversationId?: string) => {
    const current = get();
    const targetId = conversationId || current.activeConversationId;
    if (targetId === current.activeConversationId) {
      const nextFields: Partial<AgentStateStore> = { isPinned: !current.isPinned };
      const conversations = syncActiveRecord(current, nextFields);
      set({ ...nextFields, conversations });
    } else {
      const nextConvs = current.conversations.map((c) =>
        c.id === targetId ? { ...c, pinned: !c.pinned, updatedAt: Date.now() } : c
      );
      persistConversations(nextConvs);
      set({ conversations: nextConvs });
    }
  },

  archiveConversation: (conversationId?: string) => {
    const current = get();
    const targetId = conversationId || current.activeConversationId;
    let nextConvs =
      targetId === current.activeConversationId
        ? syncActiveRecord(current, {})
        : [...current.conversations];

    nextConvs = nextConvs.map((c) =>
      c.id === targetId ? { ...c, archived: true, updatedAt: Date.now() } : c
    );
    persistConversations(nextConvs);

    if (targetId === current.activeConversationId) {
      const newId = generateId();
      const empty = createEmptyConversation(current.workspaceId, newId);
      set({
        activeConversationId: empty.id,
        conversations: [empty, ...nextConvs],
        customTitle: null,
        isPinned: false,
        agentId: null,
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
    } else {
      set({ conversations: nextConvs });
    }
  },

  deleteConversation: (conversationId: string) => {
    const current = get();
    const nextConvs = current.conversations.filter((c) => c.id !== conversationId);
    persistConversations(nextConvs);

    if (conversationId === current.activeConversationId) {
      const nextActive = nextConvs.find((c) => !c.archived);
      if (nextActive) {
        set({
          activeConversationId: nextActive.id,
          conversations: nextConvs,
          customTitle: nextActive.customTitle,
          isPinned: nextActive.pinned,
          agentId: nextActive.agentId,
          workspaceId: nextActive.workspaceId,
          state: nextActive.state,
          statusReason: nextActive.statusReason,
          activeToolName: nextActive.activeToolName,
          lastError: nextActive.lastError,
          plan: nextActive.plan,
          displayMessages: nextActive.displayMessages,
          pendingApproval: null,
          specialistActivities: nextActive.specialistActivities,
          commandExecutions: nextActive.commandExecutions,
          commandExecutionOrder: nextActive.commandExecutionOrder,
          lastSequence: nextActive.lastSequence,
        });
      } else {
        const newId = generateId();
        set({
          activeConversationId: newId,
          conversations: nextConvs,
          customTitle: null,
          isPinned: false,
          agentId: null,
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
      }
    } else {
      set({ conversations: nextConvs });
    }
  },

  clear: () => {
    set({
      activeConversationId: generateId(),
      customTitle: null,
      isPinned: false,
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
