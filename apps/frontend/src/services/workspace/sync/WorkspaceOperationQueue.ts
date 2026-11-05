// src/services/workspace/sync/WorkspaceOperationQueue.ts

import { WorkspaceOperation } from './WorkspaceOperation';

export class WorkspaceOperationQueue {
  private queue: WorkspaceOperation[] = [];

  /**
   * Enqueue a new operation at the end of the queue.
   */
  public enqueue(operation: WorkspaceOperation): void {
    this.queue.push(operation);
  }

  /**
   * Dequeue the next operation from the front.
   */
  public dequeue(): WorkspaceOperation | undefined {
    return this.queue.shift();
  }

  /**
   * Re-queue an operation at the front (useful for retries).
   */
  public requeue(operation: WorkspaceOperation): void {
    this.queue.unshift(operation);
  }

  /**
   * Peek at the next operation without removing it.
   */
  public peek(): WorkspaceOperation | undefined {
    return this.queue[0];
  }

  /**
   * Get all operations currently in the queue.
   */
  public getOperations(): readonly WorkspaceOperation[] {
    return this.queue;
  }

  /**
   * Remove an operation by its ID (e.g., for cancellation).
   */
  public cancel(operationId: string): boolean {
    const initialLength = this.queue.length;
    this.queue = this.queue.filter((op) => op.id !== operationId);
    return this.queue.length < initialLength;
  }

  /**
   * Replace the entire queue (useful for replay from persisted state).
   */
  public restore(operations: WorkspaceOperation[]): void {
    this.queue = [...operations];
  }

  /**
   * Clear the entire queue.
   */
  public clear(): void {
    this.queue = [];
  }

  public get size(): number {
    return this.queue.length;
  }
}
