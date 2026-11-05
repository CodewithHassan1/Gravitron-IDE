import { describe, it, expect, vi } from 'vitest';
import { TaskScheduler } from '../../src/services/tasks/TaskScheduler';
import { TaskRuntime } from '../../src/services/tasks/TaskRuntime';
import { TaskRunner } from '../../src/services/tasks/TaskRunner';

describe('TaskScheduler', () => {
  it('schedules tasks up to max concurrent limit', () => {
    const runtime = new TaskRuntime();
    const scheduler = new TaskScheduler(runtime, { maxConcurrentTasks: 2 });

    // Mock 3 runners
    const createMockRunner = (id: string) => {
      let resolvePromise: (value: number) => void;
      const promise = new Promise<number>((resolve) => {
        resolvePromise = resolve;
      });
      return {
        runner: {
          executionId: id,
          run: vi.fn().mockReturnValue(promise),
          cancel: vi.fn(),
          dispose: vi.fn(),
        } as unknown as TaskRunner,
        complete: () => resolvePromise(0),
      };
    };

    const t1 = createMockRunner('1');
    const t2 = createMockRunner('2');
    const t3 = createMockRunner('3');

    scheduler.schedule(t1.runner);
    scheduler.schedule(t2.runner);
    scheduler.schedule(t3.runner);

    expect(scheduler.getActiveCount()).toBe(2);
    expect(scheduler.getQueueLength()).toBe(1);

    expect(t1.runner.run).toHaveBeenCalled();
    expect(t2.runner.run).toHaveBeenCalled();
    expect(t3.runner.run).not.toHaveBeenCalled();
  });
});
