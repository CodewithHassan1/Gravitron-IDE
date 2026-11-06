type EventCallback = (payload: any) => void;
export declare class EventBus {
  private listeners;
  on(event: string, callback: EventCallback): () => void;
  off(event: string, callback: EventCallback): void;
  emit(event: string, payload?: any): void;
}
export declare const SystemEvents: {
  SearchStarted: string;
  SearchCompleted: string;
  SearchCancelled: string;
  IndexUpdated: string;
  FileIndexed: string;
  CommandRegistered: string;
  CommandUnregistered: string;
  CommandExecuted: string;
  NavigationChanged: string;
  SymbolSelected: string;
  FileOpened: string;
  ContextChanged: string;
};
export declare const systemEventBus: EventBus;
export {};
