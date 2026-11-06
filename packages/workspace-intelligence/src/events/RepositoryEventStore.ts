import { RepositoryEvent } from './RepositoryEvent';
import { WorkspaceId } from '../models/EntityIds';

export interface IRepositoryEventStore {
  /**
   * Appends a new event to the store.
   * @param event The event to store.
   */
  append(event: RepositoryEvent): Promise<void>;

  /**
   * Appends multiple events to the store in a single batch.
   * @param events The events to store.
   */
  appendBatch(events: RepositoryEvent[]): Promise<void>;

  /**
   * Retrieves events for a specific workspace, ordered by sequence number.
   * @param workspaceId The workspace ID.
   * @param fromSequenceNumber Inclusive lower bound for sequence numbers.
   * @param toSequenceNumber Inclusive upper bound for sequence numbers.
   */
  getEvents(
    workspaceId: WorkspaceId,
    fromSequenceNumber: number,
    toSequenceNumber?: number
  ): Promise<RepositoryEvent[]>;

  /**
   * Clears the event store (typically used for testing or hard resets).
   */
  clear(workspaceId: WorkspaceId): Promise<void>;
}

export class MemoryEventStore implements IRepositoryEventStore {
  private eventsByWorkspace = new Map<WorkspaceId, RepositoryEvent[]>();

  async append(event: RepositoryEvent): Promise<void> {
    this.appendBatch([event]);
  }

  async appendBatch(events: RepositoryEvent[]): Promise<void> {
    if (events.length === 0) return;
    const workspaceId = events[0].workspaceId;
    let list = this.eventsByWorkspace.get(workspaceId);
    if (!list) {
      list = [];
      this.eventsByWorkspace.set(workspaceId, list);
    }
    list.push(...events);
    // Sort in case batch comes in slightly out of order, though the append should be sequential
    list.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }

  async getEvents(
    workspaceId: WorkspaceId,
    fromSequenceNumber: number,
    toSequenceNumber?: number
  ): Promise<RepositoryEvent[]> {
    const list = this.eventsByWorkspace.get(workspaceId) || [];
    return list.filter((e) => {
      if (e.sequenceNumber < fromSequenceNumber) return false;
      if (toSequenceNumber !== undefined && e.sequenceNumber > toSequenceNumber) return false;
      return true;
    });
  }

  async clear(workspaceId: WorkspaceId): Promise<void> {
    this.eventsByWorkspace.delete(workspaceId);
  }
}
