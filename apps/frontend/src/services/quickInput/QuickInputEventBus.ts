// src/services/quickInput/QuickInputEventBus.ts
export enum QuickInputEventType {
  QuickInputOpened = 'QuickInputOpened',
  QuickInputClosed = 'QuickInputClosed',
  ProviderChanged = 'ProviderChanged',
  QueryChanged = 'QueryChanged',
  ItemsUpdated = 'ItemsUpdated',
  SelectionChanged = 'SelectionChanged',
  ItemExecuted = 'ItemExecuted',
  LoadingStarted = 'LoadingStarted',
  LoadingFinished = 'LoadingFinished',
  ProviderError = 'ProviderError',
}

export interface QuickInputEventPayload {
  [QuickInputEventType.QuickInputOpened]: void;
  [QuickInputEventType.QuickInputClosed]: void;
  [QuickInputEventType.ProviderChanged]: { providerId: string };
  [QuickInputEventType.QueryChanged]: { query: string; prefix: string };
  [QuickInputEventType.ItemsUpdated]: { count: number };
  [QuickInputEventType.SelectionChanged]: { index: number; itemId?: string };
  [QuickInputEventType.ItemExecuted]: { itemId: string; providerId: string };
  [QuickInputEventType.LoadingStarted]: void;
  [QuickInputEventType.LoadingFinished]: void;
  [QuickInputEventType.ProviderError]: { error: Error; providerId: string };
}

type QuickInputEventHandler<T extends QuickInputEventType> = (
  payload: QuickInputEventPayload[T]
) => void;

class QuickInputEventBusImpl {
  private listeners: Map<QuickInputEventType, Set<Function>> = new Map();

  subscribe<T extends QuickInputEventType>(
    event: T,
    handler: QuickInputEventHandler<T>
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.unsubscribe(event, handler);
    };
  }

  unsubscribe<T extends QuickInputEventType>(event: T, handler: QuickInputEventHandler<T>): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(handler);
    }
  }

  publish<T extends QuickInputEventType>(event: T, payload: QuickInputEventPayload[T]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach((handler) => {
        try {
          handler(payload);
        } catch (e) {
          console.error(`Error in QuickInputEventBus handler for ${event}:`, e);
        }
      });
    }
  }
}

export const QuickInputEventBus = new QuickInputEventBusImpl();
