import { describe, it, expect, vi } from 'vitest';
import { ApplicationHost } from '../src/ApplicationHost';
import { ILifecycleService } from '../src/services/IService';
import { ServiceId, ServiceIds } from '../src/services/ServiceIds';

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}));

class MockService implements ILifecycleService {
  public id = ServiceIds.Window; // Mock ID
  public dependencies: readonly ServiceId[] = [];
  public initialized = false;
  public started = false;
  public stopped = false;
  public disposed = false;

  async initialize() {
    this.initialized = true;
  }
  async start() {
    this.started = true;
  }
  async stop() {
    this.stopped = true;
  }
  async dispose() {
    this.disposed = true;
  }
  async health() {
    return true;
  }
}

describe('ApplicationHost', () => {
  it('initializes and starts registered services', async () => {
    const host = new ApplicationHost();
    const service = new MockService();
    host.getServiceContainer().register(service);

    await host.start();
    expect(service.initialized).toBe(true);
    expect(service.started).toBe(true);
  });

  it('stops and disposes services on stop', async () => {
    const host = new ApplicationHost();
    const service = new MockService();
    host.getServiceContainer().register(service);

    await host.start();
    await host.stop();
    expect(service.stopped).toBe(true);
    expect(service.disposed).toBe(true);
  });
});
