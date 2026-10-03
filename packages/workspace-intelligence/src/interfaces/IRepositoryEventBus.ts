import { RepositoryEvent } from '../events/RepositoryEvent';

export enum EventDeliveryMode {
  LIVE = 'LIVE',
  REPLAY = 'REPLAY',
  RECOVERY = 'RECOVERY'
}

export interface IRepositoryEventBus {
  /**
   * Subscribes to repository events.
   * @param callback The callback to invoke when an event is published.
   * @returns A disposable function to unsubscribe.
   */
  subscribe(callback: (event: RepositoryEvent, mode: EventDeliveryMode) => void): () => void;

  /**
   * Publishes a new repository event.
   * @param event The event to publish.
   * @param mode The mode of delivery.
   */
  publish(event: RepositoryEvent, mode?: EventDeliveryMode): void;
}
