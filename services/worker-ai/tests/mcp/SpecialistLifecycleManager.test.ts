import { describe, it, expect, vi } from 'vitest';
import { SpecialistLifecycleManager } from '../../src/mcp/SpecialistLifecycleManager';
import { AgentRouterClient } from '../../src/mcp/AgentRouterClient';

describe('SpecialistLifecycleManager — Synchronous, Asynchronous & Duplicate Prevention', () => {
  it('handles synchronous responses immediately without polling', async () => {
    const mockClient = {
      callTool: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Here is the direct architectural analysis.' }],
        isError: false,
      }),
    } as unknown as AgentRouterClient;

    const manager = new SpecialistLifecycleManager(mockClient);

    const result = await manager.executeTool('softwareengineeringexpert', {
      payload: { task_desciption: 'Analyze auth structure' },
    });

    expect(result).toBe('Here is the direct architectural analysis.');
    expect(mockClient.callTool).toHaveBeenCalledTimes(1);
    expect(mockClient.callTool).toHaveBeenCalledWith('softwareengineeringexpert', expect.anything());

    const logs = manager.getAuditLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].status).toBe('success');
  });

  it('handles asynchronous task_id with bounded wait_for_task polling until completion', async () => {
    let waitCalls = 0;
    const mockClient = {
      callTool: vi.fn().mockImplementation((toolName: string, args: any) => {
        if (toolName === 'softwareengineeringexpert') {
          return Promise.resolve({
            content: [
              {
                type: 'text',
                text: 'STATUS: RUNNING\ntask_id: 88888888-4444-4444-4444-121212121212\nWaiting for completion...',
              },
            ],
          });
        }
        if (toolName === 'wait_for_task') {
          waitCalls++;
          if (waitCalls === 1) {
            return Promise.resolve({
              content: [
                {
                  type: 'text',
                  text: 'STATUS: RUNNING\ntask_id: 88888888-4444-4444-4444-121212121212',
                },
              ],
            });
          }
          return Promise.resolve({
            content: [
              {
                type: 'text',
                text: 'STATUS: COMPLETED\ntask_id: 88888888-4444-4444-4444-121212121212\nCompleted Analysis: The module needs decoupling.',
              },
            ],
          });
        }
        return Promise.reject(new Error(`Unexpected tool ${toolName}`));
      }),
    } as unknown as AgentRouterClient;

    const manager = new SpecialistLifecycleManager(mockClient);

    const result = await manager.executeTool(
      'softwareengineeringexpert',
      { payload: { task_desciption: 'Async analysis test' } },
      { pollIntervalMs: 20, maxWaitSeconds: 5 }
    );

    expect(result).toContain('STATUS: COMPLETED');
    expect(result).toContain('Completed Analysis: The module needs decoupling.');
    expect(waitCalls).toBe(2);

    const taskState = manager.getTaskState('88888888-4444-4444-4444-121212121212');
    expect(taskState).toBeDefined();
    expect(taskState?.status).toBe('completed');
  });

  it('prevents duplicate remote tasks by deduplicating identical concurrent requests', async () => {
    let callCount = 0;
    const mockClient = {
      callTool: vi.fn().mockImplementation(async () => {
        callCount++;
        await new Promise((r) => setTimeout(r, 50));
        return {
          content: [{ type: 'text', text: 'Result of shared computation' }],
        };
      }),
    } as unknown as AgentRouterClient;

    const manager = new SpecialistLifecycleManager(mockClient);

    const promise1 = manager.executeTool('softwareengineeringexpert', {
      payload: { query: 'same-query' },
    });
    const promise2 = manager.executeTool('softwareengineeringexpert', {
      payload: { query: 'same-query' },
    });

    const [res1, res2] = await Promise.all([promise1, promise2]);

    expect(res1).toBe('Result of shared computation');
    expect(res2).toBe('Result of shared computation');
    // Only one remote call was made!
    expect(callCount).toBe(1);
  });

  it('handles cancellation signal cleanly without spawning new tasks', async () => {
    const mockClient = {
      callTool: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: 'STATUS: RUNNING\ntask_id: 99999999-4444-4444-4444-121212121212',
          },
        ],
      }),
    } as unknown as AgentRouterClient;

    const manager = new SpecialistLifecycleManager(mockClient);
    const controller = new AbortController();

    // Abort after 30ms
    setTimeout(() => controller.abort(), 30);

    await expect(
      manager.executeTool(
        'softwareengineeringexpert',
        { payload: { query: 'long-wait' } },
        { signal: controller.signal, pollIntervalMs: 50, maxWaitSeconds: 10 }
      )
    ).rejects.toThrow('cancelled by user');

    const taskState = manager.getTaskState('99999999-4444-4444-4444-121212121212');
    expect(taskState?.status).toBe('cancelled');
  });

  it('handles remote task failure cleanly', async () => {
    const mockClient = {
      callTool: vi.fn().mockImplementation((toolName: string) => {
        if (toolName === 'softwareengineeringexpert') {
          return Promise.resolve({
            content: [
              {
                type: 'text',
                text: 'STATUS: RUNNING\ntask_id: 11111111-2222-3333-4444-555555555555',
              },
            ],
          });
        }
        if (toolName === 'wait_for_task') {
          return Promise.resolve({
            content: [
              {
                type: 'text',
                text: 'STATUS: FAILED\ntask_id: 11111111-2222-3333-4444-555555555555\nError: Remote worker exceeded memory limits',
              },
            ],
          });
        }
        return Promise.reject(new Error(`Unexpected tool ${toolName}`));
      }),
    } as unknown as AgentRouterClient;

    const manager = new SpecialistLifecycleManager(mockClient);

    await expect(
      manager.executeTool(
        'softwareengineeringexpert',
        { payload: { query: 'fail-test' } },
        { pollIntervalMs: 20, maxWaitSeconds: 5 }
      )
    ).rejects.toThrow('Specialist task 11111111-2222-3333-4444-555555555555 failed remotely');

    const taskState = manager.getTaskState('11111111-2222-3333-4444-555555555555');
    expect(taskState?.status).toBe('failed');
  });
});
