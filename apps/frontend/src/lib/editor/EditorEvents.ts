type EventHandler<T = any> = (data: T) => void;

export class EditorEventBusImpl {
  private listeners: Map<string, Set<EventHandler>> = new Map();

  on<T>(event: string, handler: EventHandler<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);

    return () => this.off(event, handler);
  }

  off<T>(event: string, handler: EventHandler<T>): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  emit<T>(event: string, data?: T): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler(data));
    }
  }
  
  dispose() {
    this.listeners.clear();
  }
}

export const EditorEvents = {
  EditorOpened: 'EditorOpened',
  EditorClosed: 'EditorClosed',
  TabActivated: 'TabActivated',
  ModelChanged: 'ModelChanged',
  CursorChanged: 'CursorChanged',
  SelectionChanged: 'SelectionChanged',
  EditorFocused: 'EditorFocused',
  GroupChanged: 'GroupChanged',
  SplitCreated: 'SplitCreated',
  SplitClosed: 'SplitClosed',
  
  // Enterprise additions
  DiagnosticsUpdated: 'DiagnosticsUpdated',
  EditorSaved: 'EditorSaved',
  EditorFormatted: 'EditorFormatted',
  AIEvent: 'AIEvent',
  GitEvent: 'GitEvent',
} as const;

export const editorEventBus = new EditorEventBusImpl();
export const EditorEventBus = editorEventBus;
