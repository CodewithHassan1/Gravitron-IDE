import { DocumentWorkItem } from './DocumentWorkItem';
import { DocumentId } from '../models/EntityIds';

export class PriorityQueue {
  // A map to ensure we only have one item per document (coalescing)
  private items = new Map<DocumentId, DocumentWorkItem>();

  /**
   * Enqueues an item. If an item for the document already exists,
   * its priority is upgraded (lowered value) and its enqueued time is preserved.
   * This is how we coalesce rapid modifications.
   */
  enqueue(item: DocumentWorkItem): void {
    const existing = this.items.get(item.documentId);
    if (existing) {
      // Coalesce: keep the older enqueuedAt, take the more urgent priority
      const merged: DocumentWorkItem = {
        ...existing,
        priority: Math.min(existing.priority, item.priority),
        reason: existing.priority <= item.priority ? existing.reason : item.reason,
      };
      this.items.set(item.documentId, merged);
    } else {
      this.items.set(item.documentId, item);
    }
  }

  /**
   * Dequeues up to `count` items with the highest priority (lowest number).
   */
  dequeueBatch(count: number): DocumentWorkItem[] {
    const all = Array.from(this.items.values());
    // Sort by priority (asc), then by enqueuedAt (asc)
    all.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.enqueuedAt - b.enqueuedAt;
    });

    const batch = all.slice(0, count);
    for (const item of batch) {
      this.items.delete(item.documentId);
    }
    return batch;
  }

  size(): number {
    return this.items.size;
  }

  getOldestAgeMs(): number {
    if (this.items.size === 0) return 0;
    let oldest = Date.now();
    for (const item of this.items.values()) {
      if (item.enqueuedAt < oldest) {
        oldest = item.enqueuedAt;
      }
    }
    return Date.now() - oldest;
  }
}
