import { DocumentWorkItem } from './DocumentWorkItem';

export interface BatchPlan {
  items: DocumentWorkItem[];
  // Potential future properties like optimal thread count for this batch
}

export class BatchPlanner {
  /**
   * Plans a batch of work items.
   * Right now this just takes the raw dequeued items, but could in the future
   * group them by language, proximity in the file tree, or independent subgraphs
   * to maximize cache hits and parallel execution efficiency.
   */
  plan(items: DocumentWorkItem[]): BatchPlan {
    return {
      items,
    };
  }
}
