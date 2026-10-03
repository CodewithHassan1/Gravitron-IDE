import { IRepositoryEventBus, EventDeliveryMode } from '../interfaces/IRepositoryEventBus';
import { RepositoryEvent } from './RepositoryEvent';

export class RepositoryEventBus implements IRepositoryEventBus {
  private listeners = new Set<(event: RepositoryEvent, mode: EventDeliveryMode) => void>();

  public subscribe(callback: (event: RepositoryEvent, mode: EventDeliveryMode) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  public publish(event: RepositoryEvent, mode: EventDeliveryMode = EventDeliveryMode.LIVE): void {
    for (const listener of this.listeners) {
      try {
        listener(event, mode);
      } catch (e) {
        console.error('Error in RepositoryEventBus listener:', e);
      }
    }
  }
}
