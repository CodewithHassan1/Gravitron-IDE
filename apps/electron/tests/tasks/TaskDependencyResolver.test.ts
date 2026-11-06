import { describe, it, expect } from 'vitest';
import { TaskDependencyResolver } from '../../src/services/tasks/TaskDependencyResolver';
import { TaskDefinition } from '@ag/protocol';

describe('TaskDependencyResolver', () => {
  it('resolves a simple sequential chain', () => {
    const resolver = new TaskDependencyResolver();
    const tasks: TaskDefinition[] = [
      { id: '1', name: 'Task 1', type: 'shell' },
      { id: '2', name: 'Task 2', type: 'shell', dependencies: ['1'] },
      { id: '3', name: 'Task 3', type: 'shell', dependencies: ['2'] },
    ];

    const groups = resolver.resolve(tasks);
    expect(groups).toHaveLength(3);
    expect(groups[0][0].id).toBe('1');
    expect(groups[1][0].id).toBe('2');
    expect(groups[2][0].id).toBe('3');
  });

  it('groups parallel tasks together', () => {
    const resolver = new TaskDependencyResolver();
    const tasks: TaskDefinition[] = [
      { id: 'compile-c', name: 'Compile C', type: 'shell' },
      { id: 'compile-cpp', name: 'Compile C++', type: 'shell' },
      { id: 'link', name: 'Link', type: 'shell', dependencies: ['compile-c', 'compile-cpp'] },
    ];

    const groups = resolver.resolve(tasks);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(2); // compile-c and compile-cpp can run in parallel
    expect(groups[0].map((t) => t.id).sort()).toEqual(['compile-c', 'compile-cpp'].sort());
    expect(groups[1]).toHaveLength(1);
    expect(groups[1][0].id).toBe('link');
  });

  it('detects missing dependencies', () => {
    const resolver = new TaskDependencyResolver();
    const tasks: TaskDefinition[] = [
      { id: '1', name: 'Task 1', type: 'shell', dependencies: ['missing'] },
    ];

    expect(() => resolver.resolve(tasks)).toThrow('Task 1 depends on missing task missing');
  });

  it('detects simple cycles', () => {
    const resolver = new TaskDependencyResolver();
    const tasks: TaskDefinition[] = [
      { id: '1', name: 'Task 1', type: 'shell', dependencies: ['2'] },
      { id: '2', name: 'Task 2', type: 'shell', dependencies: ['1'] },
    ];

    expect(() => resolver.resolve(tasks)).toThrow('Circular dependency detected in task graph');
  });

  it('detects complex cycles', () => {
    const resolver = new TaskDependencyResolver();
    const tasks: TaskDefinition[] = [
      { id: '1', name: 'Task 1', type: 'shell' },
      { id: '2', name: 'Task 2', type: 'shell', dependencies: ['1', '4'] },
      { id: '3', name: 'Task 3', type: 'shell', dependencies: ['2'] },
      { id: '4', name: 'Task 4', type: 'shell', dependencies: ['3'] },
    ];

    expect(() => resolver.resolve(tasks)).toThrow('Circular dependency detected in task graph');
  });

  it('scales to 1000+ nodes deterministically', () => {
    const resolver = new TaskDependencyResolver();
    const tasks: TaskDefinition[] = [];

    // Create 1000 tasks, each depending on the previous one (a deep chain)
    for (let i = 0; i < 1000; i++) {
      tasks.push({
        id: `task-${i}`,
        name: `Task ${i}`,
        type: 'shell',
        dependencies: i > 0 ? [`task-${i - 1}`] : [],
      });
    }

    // Add 500 parallel tasks that depend on task-999
    for (let i = 0; i < 500; i++) {
      tasks.push({
        id: `parallel-${i}`,
        name: `Parallel ${i}`,
        type: 'shell',
        dependencies: ['task-999'],
      });
    }

    const groups = resolver.resolve(tasks);

    // 1000 sequential groups + 1 final parallel group
    expect(groups).toHaveLength(1001);

    expect(groups[0][0].id).toBe('task-0');
    expect(groups[999][0].id).toBe('task-999');
    expect(groups[1000]).toHaveLength(500);
    expect(groups[1000][0].id.startsWith('parallel-')).toBe(true);
  });
});
