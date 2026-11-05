import { TaskDefinition } from '@ag/protocol';

/**
 * A resolved execution graph where each array of tasks can be executed in parallel.
 * Sequential execution proceeds from index 0 to N.
 */
export type TaskExecutionGroup = TaskDefinition[];

export class TaskDependencyResolver {
  /**
   * Performs a topological sort of the provided tasks based on their dependencies.
   * Groups tasks into parallelizable execution batches.
   * Throws if a cycle is detected or a dependency is missing.
   */
  public resolve(tasks: readonly TaskDefinition[]): TaskExecutionGroup[] {
    const taskMap = new Map<string, TaskDefinition>();
    const inDegree = new Map<string, number>();
    const adjacencyList = new Map<string, string[]>();

    // Initialize graph
    for (const task of tasks) {
      taskMap.set(task.id, task);
      inDegree.set(task.id, 0);
      adjacencyList.set(task.id, []);
    }

    // Build edges
    for (const task of tasks) {
      const deps = task.dependencies || [];
      for (const depId of deps) {
        if (!taskMap.has(depId)) {
          throw new Error(`Task ${task.id} depends on missing task ${depId}`);
        }

        adjacencyList.get(depId)!.push(task.id);
        inDegree.set(task.id, inDegree.get(task.id)! + 1);
      }
    }

    const groups: TaskExecutionGroup[] = [];
    let processedCount = 0;

    // Kahn's algorithm modified to group by depth (parallel groups)
    let queue: string[] = [];

    // Find all tasks with 0 in-degree
    for (const [taskId, count] of inDegree.entries()) {
      if (count === 0) {
        queue.push(taskId);
      }
    }

    while (queue.length > 0) {
      const currentGroupTasks = queue.map((id) => taskMap.get(id)!);
      groups.push(currentGroupTasks);
      processedCount += queue.length;

      const nextQueue: string[] = [];

      for (const taskId of queue) {
        const dependents = adjacencyList.get(taskId)!;
        for (const depId of dependents) {
          const newInDegree = inDegree.get(depId)! - 1;
          inDegree.set(depId, newInDegree);
          if (newInDegree === 0) {
            nextQueue.push(depId);
          }
        }
      }

      queue = nextQueue;
    }

    if (processedCount !== tasks.length) {
      throw new Error('Circular dependency detected in task graph');
    }

    return groups;
  }
}
