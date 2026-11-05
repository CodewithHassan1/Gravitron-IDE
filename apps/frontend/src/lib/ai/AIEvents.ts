export enum AIEventType {
  ConversationStarted = 'ConversationStarted',
  ConversationEnded = 'ConversationEnded',
  ProviderChanged = 'ProviderChanged',
  PromptBuilt = 'PromptBuilt',
  PromptCompressed = 'PromptCompressed',
  StreamingStarted = 'StreamingStarted',
  StreamingChunk = 'StreamingChunk',
  StreamingFinished = 'StreamingFinished',
  ToolStarted = 'ToolStarted',
  ToolFinished = 'ToolFinished',
  ToolFailed = 'ToolFailed',
  AgentStarted = 'AgentStarted',
  AgentPaused = 'AgentPaused',
  AgentResumed = 'AgentResumed',
  AgentCancelled = 'AgentCancelled',
  AgentCompleted = 'AgentCompleted',
}

export interface AIEvent {
  type: AIEventType;
  payload?: any;
  timestamp: number;
}

export class AIEventEmitter {
  private listeners = new Map<AIEventType, Set<(event: AIEvent) => void>>();

  on(type: AIEventType, callback: (event: AIEvent) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);
    return () => this.listeners.get(type)!.delete(callback);
  }

  emit(type: AIEventType, payload?: any) {
    const event: AIEvent = { type, payload, timestamp: Date.now() };
    const handlers = this.listeners.get(type);
    if (handlers) {
      handlers.forEach((h) => h(event));
    }
  }
}

export const GlobalAIEvents = new AIEventEmitter();
