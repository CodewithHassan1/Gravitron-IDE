import { IntelligenceManager } from '../IntelligenceManager';
import { IntelligenceProtocol } from '@ag/protocol';
import { ServiceIds } from '../ServiceIds';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('IntelligenceManager Lifecycle and IPC Protocol (Gate 4A.1)', () => {
  let manager: IntelligenceManager;

  beforeEach(() => {
    manager = new IntelligenceManager();
  });

  afterEach(async () => {
    await manager.stop();
  });

  it('should initialize, spawn worker, and complete handshake successfully', async () => {
    await manager.initialize();

    // Give it a brief moment to spawn
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(await manager.health()).toBe(true);

    // Handshake should succeed
    await expect(manager.handshake()).resolves.toBeUndefined();
  });

  it('should reject non-handshake messages that lack workspaceId', async () => {
    await manager.initialize();
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Try sending a custom message that isn't handshake and doesn't have workspaceId
    // Because sendRequest enforces sending workspaceId, we need to bypass it or send a dummy one
    // But since sendRequest enforces providing workspaceId as an argument, let's just pass undefined

    await expect(
      manager.sendRequest(
        IntelligenceProtocol.IntelligenceRequestType.SearchWorkspace,
        undefined as any,
        { query: 'test', type: 'regex' }
      )
    ).rejects.toThrow('workspaceId is required for this request type');
  });

  it('should support workspaceOpen and workspaceClose lifecycle events', async () => {
    await manager.initialize();
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Send workspaceOpen
    await expect(manager.workspaceOpened('test-ws', '/fake/path')).resolves.toBeUndefined();

    // Send workspaceClose
    await expect(manager.workspaceClosed('test-ws')).resolves.toBeUndefined();
  });

  it('should detect crash and restart the worker', async () => {
    await manager.initialize();
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await manager.health()).toBe(true);

    // Manually kill the process to simulate a crash
    const workerProcess = (manager as any).workerProcess;
    expect(workerProcess).toBeDefined();
    workerProcess.kill('SIGKILL');

    // Wait for the exit handler and the 2 second restart timeout
    await new Promise((resolve) => setTimeout(resolve, 2500));

    // Should be healthy again and the old process should be different
    expect(await manager.health()).toBe(true);
    expect((manager as any).workerProcess).toBeDefined();
    expect((manager as any).workerProcess).not.toBe(workerProcess);

    // Handshake should still work on the new process
    await expect(manager.handshake()).resolves.toBeUndefined();
  }, 10000);
});
