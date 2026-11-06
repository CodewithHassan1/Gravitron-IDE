// src/services/workspace/WorkspaceEvents.ts
import { WorkspaceEvent, WorkspaceEventType, WorkspaceEventPayloads } from './types';

type EventCallback<T extends keyof WorkspaceEventPayloads> = (event: WorkspaceEvent<T>) => void;

class WorkspaceEventsImpl {
  private listeners: Map<keyof WorkspaceEventPayloads, Set<any>> = new Map();

  /**
   * Subscribes to a specific workspace event.
   * @param eventType The type of event to listen for (e.g. WorkspaceEventType.WorkspaceOpened or 'fileEvent')
   * @param callback The callback to invoke when the event is emitted.
   * @returns A disposable function to unsubscribe.
   */
  public on<T extends keyof WorkspaceEventPayloads>(
    eventType: T,
    callback: EventCallback<T>
  ): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);

    return () => this.off(eventType, callback);
  }

  /**
   * Unsubscribes a previously registered callback from a specific workspace event.
   * @param eventType The type of event.
   * @param callback The callback to remove.
   */
  public off<T extends keyof WorkspaceEventPayloads>(
    eventType: T,
    callback: EventCallback<T>
  ): void {
    const callbacks = this.listeners.get(eventType);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.listeners.delete(eventType);
      }
    }
  }

  /**
   * Emits an event to all registered listeners.
   * @param eventType The type of the event.
   * @param payload Optional data associated with the event.
   */
  public emit<T extends keyof WorkspaceEventPayloads>(
    eventType: T,
    payload?: WorkspaceEventPayloads[T]
  ): void {
    const callbacks = this.listeners.get(eventType);
    if (callbacks) {
      const event: WorkspaceEvent<T> = Object.freeze({
        type: eventType,
        timestamp: Date.now(),
        payload: payload ? Object.freeze({ ...payload }) : undefined,
      }) as WorkspaceEvent<T>;

      // Emit safely so a throwing listener doesn't break the event bus
      callbacks.forEach((callback) => {
        try {
          callback(event);
        } catch (error) {
          console.error(`[WorkspaceEvents] Error in listener for ${eventType}:`, error);
        }
      });
    }
  }

  /**
   * Clears all active event listeners. Use only during complete workspace teardown.
   */
  public clearAllListeners(): void {
    this.listeners.clear();
  }
}

// Export singleton instance
export const WorkspaceEvents = new WorkspaceEventsImpl();
