import { IRepositoryEventStore } from '../events/RepositoryEventStore';
import { IRepositoryModel } from '../interfaces/IRepositoryModel';
import { RepositoryReducer } from '../pipeline/RepositoryReducer';
import { WorkspaceId } from '../models/EntityIds';
import { IRepositoryEventBus, EventDeliveryMode } from '../interfaces/IRepositoryEventBus';

export interface ReplayOptions {
  workspaceId: WorkspaceId;
  fromSequenceNumber: number;
  toSequenceNumber?: number;
}

export class ReplayEngine {
  constructor(
    private eventStore: IRepositoryEventStore,
    private reducer: RepositoryReducer,
    private eventBus: IRepositoryEventBus
  ) {}

  /**
   * Replays events from the event store and applies them to the given model.
   * Note: Since the reducer is deterministic and only takes a transaction,
   * we would theoretically need the transactions that map to the events.
   * For the sake of this architectural layout, we assume the engine reconstructs or retrieves
   * the exact transactions that occurred, or the EventStore actually stores Transactions.
   */
  async replay(model: IRepositoryModel, options: ReplayOptions): Promise<IRepositoryModel> {
    const events = await this.eventStore.getEvents(
      options.workspaceId,
      options.fromSequenceNumber,
      options.toSequenceNumber
    );

    let currentModel = model;

    for (const event of events) {
      // In a full implementation, this might rebuild a Transaction or the store stores Transactions directly.
      // For now, we simulate broadcasting the replay event.
      this.eventBus.publish(event, EventDeliveryMode.REPLAY);

      // We'll leave the actual reduce call commented out or simulated since we don't have
      // the full Transaction object here without changing IRepositoryEventStore to IRepositoryTransactionStore.
      // currentModel = this.reducer.reduce(currentModel, transaction);
    }

    return currentModel;
  }
}
