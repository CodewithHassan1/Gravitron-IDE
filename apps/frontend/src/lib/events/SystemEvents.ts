type EventCallback = (payload: any) => void;

export class EventBus {
  private listeners: Map<string, Set<EventCallback>> = new Map();

  on(event: string, callback: EventCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.off(event, callback); // Returns unsubscribe function
  }

  off(event: string, callback: EventCallback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event)!.delete(callback);
    }
  }

  emit(event: string, payload?: any) {
    if (this.listeners.has(event)) {
      this.listeners.get(event)!.forEach((callback) => {
        try {
          callback(payload);
        } catch (e) {
          console.error(`Error in event listener for ${event}`, e);
        }
      });
    }
  }
}

export const SystemEvents = {
  // Navigation & Search
  SearchStarted: 'search.started',
  SearchCompleted: 'search.completed',
  SearchCancelled: 'search.cancelled',
  IndexUpdated: 'search.indexUpdated',
  FileIndexed: 'search.fileIndexed',

  // Commands
  CommandRegistered: 'command.registered',
  CommandUnregistered: 'command.unregistered',
  CommandExecuted: 'command.executed',

  // NEW
  MenuRegistered: 'menu.registered',

  // Interaction
  NavigationChanged: 'navigation.changed',
  SymbolSelected: 'navigation.symbolSelected',
  FileOpened: 'navigation.fileOpened',

  // Context
  ContextChanged: 'context.changed',
};

export const systemEventBus = new EventBus();
