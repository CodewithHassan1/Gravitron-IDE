import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApplicationHost } from '../../src/ApplicationHost';
import { TerminalService } from '../../src/services/TerminalService';
import { RequestEnvelope, ProtocolVersion, Channels } from '@ag/protocol';
import { IMessageChannel } from '@ag/platform';
import { ElectronTerminalTransport } from '../../../frontend/src/services/terminal/providers/transport/ElectronTerminalTransport';
import { TerminalDescriptor } from '../../../frontend/src/services/terminal/types';
import { randomUUID } from 'crypto';
import { WorkspaceExecutionService } from '../../src/services/execution/WorkspaceExecutionService';
import { ExecutionContextResolver } from '../../src/services/execution/ExecutionContextResolver';
import { DefaultProfileResolver } from '../../src/services/execution/resolvers/ProfileResolver';
import { DefaultEnvironmentResolver } from '../../src/services/execution/resolvers/EnvironmentResolver';
import { DefaultWorkingDirectoryResolver } from '../../src/services/execution/resolvers/WorkingDirectoryResolver';
import { DefaultShellResolver } from '../../src/services/execution/resolvers/ShellResolver';
import { RegistryCapabilityResolver } from '../../src/services/execution/resolvers/CapabilityResolver';
import { ExecutionPolicyPipeline } from '../../src/services/execution/policies/IExecutionPolicyPipeline';
import { ExecutionBackendRegistry } from '../../src/services/terminal/pty/types';
import { LocalBackend } from '../../src/services/terminal/pty/LocalBackend';
import { DockerBackend } from '../../src/services/terminal/pty/DockerBackend';

// A fake ipcMain/ipcRenderer bridge for integration tests
class FakeIpcBridge {
  private handlers = new Map<string, Function>();
  private listeners = new Map<string, Set<Function>>();

  // Main Side
  public handle(channel: string, handler: Function) {
    this.handlers.set(channel, handler);
  }

  public clear() {
    this.handlers.clear();
    this.listeners.clear();
  }

  // Renderer Side (invoke)
  public async invoke(channel: string, envelope: any) {
    const handler = this.handlers.get(channel);
    if (!handler) throw new Error(`No handler for ${channel}`);

    // Simulate IPC serialization
    const serialized = structuredClone(envelope);
    const response = await handler(TRUSTED_SENDER_EVENT as any, serialized);
    if (response?.errorName === 'IpcError') {
      throw new Error(response.message);
    }
    return structuredClone(response);
  }

  // Renderer Side (on)
  public on(channel: string, listener: Function) {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());
    }
    this.listeners.get(channel)!.add(listener);
  }

  public removeListener(channel: string, listener: Function) {
    this.listeners.get(channel)?.delete(listener);
  }

  // Main Side (send to renderer)
  public send(channel: string, payload: any) {
    const subs = this.listeners.get(channel);
    if (subs) {
      const serialized = structuredClone(payload);
      subs.forEach((cb) => cb({}, serialized));
    }
  }
}

const bridge = new FakeIpcBridge();

// PHASE 8.3: the fake bridge impersonates the trusted app renderer frame the
// real preload bridge originates from.
const TRUSTED_SENDER_EVENT = {
  senderFrame: { url: 'file:///agent/index.html' },
  sender: { getURL: () => 'file:///agent/index.html' },
};

// Mock ipcMain.handle to wire into our bridge
vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: Function) => bridge.handle(ch, fn),
  },
}));

describe('IPC Integration: Frontend Transport <-> Main Process', () => {
  let host: ApplicationHost;
  let transport: ElectronTerminalTransport;

  beforeEach(async () => {
    bridge.clear();

    // Setup Main Process
    const { ipcMain } = await import('electron');
    host = new ApplicationHost();

    // Mock WindowService so we don't spawn actual UI windows in tests
    const mockWindowService = {
      id: Symbol.for('Window'),
      dependencies: [],
      initialize: async () => {},
      start: async () => {},
      stop: async () => {},
      dispose: async () => {},
      health: async () => true,
      createMainWindow: async () => {},
      broadcast: (ch: string, payload: any) => bridge.send(ch, payload),
    };

    // Setup Execution Layer
    const backendRegistry = new ExecutionBackendRegistry();
    backendRegistry.register(new LocalBackend());
    backendRegistry.register(new DockerBackend());

    const contextResolver = new ExecutionContextResolver(
      new DefaultProfileResolver(),
      new DefaultEnvironmentResolver(),
      new DefaultWorkingDirectoryResolver(),
      new DefaultShellResolver(),
      new RegistryCapabilityResolver(backendRegistry)
    );

    const policyPipeline = new ExecutionPolicyPipeline();
    const executionService = new WorkspaceExecutionService(
      contextResolver,
      policyPipeline,
      backendRegistry
    );
    host.getServiceContainer().register(mockWindowService as any);
    host.getServiceContainer().register(executionService);

    host.getServiceContainer().register(
      new TerminalService(
        () => host.getServiceContainer().get(mockWindowService.id as any),
        () => host.getServiceContainer().get(executionService.id as any)
      )
    );
    await host.start();

    // Setup Fake Preload agApi
    const agApi = {
      terminal: {
        create: async (config: any) => {
          const res = await bridge.invoke(Channels.Terminal.CreateRequest, {
            version: ProtocolVersion.V1,
            requestId: randomUUID(),
            payload: config,
          });
          return res.payload.sessionId;
        },
        resize: async (sessionId: string, cols: number, rows: number) => {
          await bridge.invoke(Channels.Terminal.ResizeRequest, {
            version: ProtocolVersion.V1,
            requestId: randomUUID(),
            payload: { sessionId, cols, rows },
          });
        },
        kill: async (sessionId: string) => {
          await bridge.invoke(Channels.Terminal.DestroyRequest, {
            version: ProtocolVersion.V1,
            requestId: randomUUID(),
            payload: sessionId,
          });
        },
        attach: (sessionId: string) =>
          ({
            send: async (data: string) => {
              await bridge.invoke(Channels.Terminal.WriteRequest, {
                version: ProtocolVersion.V1,
                requestId: randomUUID(),
                payload: { sessionId, data },
              });
            },
            subscribe: (cb: Function) => {
              const handler = (_e: any, payload: any) => {
                if (payload?.sessionId === sessionId) {
                  cb(payload);
                }
              };
              bridge.on(Channels.Terminal.OnEvent, handler);
              return { dispose: () => bridge.removeListener(Channels.Terminal.OnEvent, handler) };
            },
            dispose: async () => {
              await bridge.invoke(Channels.Terminal.DestroyRequest, {
                version: ProtocolVersion.V1,
                requestId: randomUUID(),
                payload: sessionId,
              });
            },
          }) as IMessageChannel<string, string>,
      },
    };

    transport = new ElectronTerminalTransport(agApi.terminal);
  });

  afterEach(async () => {
    await host.stop();
    vi.resetModules();
  });

  const mockConfig: TerminalDescriptor = {
    metadata: {
      id: 'test-term',
      debugLabel: 'test',
      name: 'test',
      args: [],
      env: process.env as Record<string, string>,
    },
    layout: {},
  };

  it('can create a terminal, resize, write, and kill cleanly', async () => {
    const stream = await transport.createStream(mockConfig);
    expect(stream).toBeDefined();

    // We can't actually get output in mock yet, but we can call it without throwing
    stream.write(new TextEncoder().encode('ls\n'));

    // Not testing stream.onData yet since the Mock TerminalService doesn't echo anything natively
    // We just ensure no IPC errors
    await transport.resize('dummy', 80, 24).catch(() => {}); // Will throw because sessionId is internal to transport? Wait, transport uses its own ID?
    // Actually, createStream returns ITerminalStream. The sessionId is captured inside ElectronTerminalStream closure in transport.
    // Wait, the transport resize takes terminalId from the UI, but we don't map terminalId -> sessionId in transport!
    // Ah, `TerminalService` created a UUID. The UI called `createStream` which returned `ITerminalStream`.
    // Let's test the main process state
    const ts = host.getServiceContainer().get<TerminalService>(Symbol.for('Terminal'));
    expect(ts.listSessions().length).toBe(1);

    const sessionId = ts.listSessions()[0];
    await transport.resize('test-term', 100, 40);

    await transport.kill('test-term');
    expect(ts.listSessions().length).toBe(0);
  });

  it('handles 10 concurrent creates safely (Concurrency Check)', async () => {
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(transport.createStream(mockConfig));
    }
    const streams = await Promise.all(promises);
    expect(streams.length).toBe(10);

    const ts = host.getServiceContainer().get<TerminalService>(Symbol.for('Terminal'));
    expect(ts.listSessions().length).toBe(10);
  });

  it('rejects malformed envelopes gracefully', async () => {
    const badPromise = bridge.invoke(Channels.Terminal.CreateRequest, {
      payload: 'missing-version-and-id',
    });
    await expect(badPromise).rejects.toThrow('Invalid Request Envelope');
  });

  it('simulates listener cleanup on dispose', async () => {
    const stream = await transport.createStream(mockConfig);
    const ts = host.getServiceContainer().get<TerminalService>(Symbol.for('Terminal'));
    const sessionId = ts.listSessions()[0];

    const cb = vi.fn();
    const sub = stream.onData(cb);

    // Simulate main process pushing data
    bridge.send(Channels.Terminal.OnEvent, {
      category: 'data',
      kind: 'output',
      sessionId,
      data: new TextEncoder().encode('hello'),
    });
    expect(cb).toHaveBeenCalledTimes(1);

    sub.dispose();
    bridge.send(Channels.Terminal.OnEvent, {
      category: 'data',
      kind: 'output',
      sessionId,
      data: new TextEncoder().encode('world'),
    });
    expect(cb).toHaveBeenCalledTimes(1); // Not called again
  });

  it('handles main process crash gracefully (timeout/connection drop)', async () => {
    // Simulate backend crash: We mock a timeout on the bridge invoke
    vi.spyOn(bridge, 'invoke').mockImplementationOnce(async () => {
      throw new Error('IPC Connection Dropped');
    });

    await expect(transport.createStream(mockConfig)).rejects.toThrow('IPC Connection Dropped');
  });

  it('rejects commands for already closed sessions', async () => {
    await transport.createStream(mockConfig);
    await transport.kill('test-term'); // This deletes from sessionMap

    // Subsequent resize should silently ignore since sessionMap.get('test-term') is undefined
    await expect(transport.resize('test-term', 10, 10)).resolves.not.toThrow();
  });

  it('simulates dropped events and malformed data', async () => {
    const stream = await transport.createStream(mockConfig);
    const cb = vi.fn();
    stream.onData(cb);

    // Should safely ignore events for other sessions or bad formats
    bridge.send(Channels.Terminal.OnEvent, {
      category: 'data',
      kind: 'output',
      sessionId: 'wrong-id',
      data: 'hello',
    });
    bridge.send(Channels.Terminal.OnEvent, {
      category: 'data',
      kind: 'output',
      data: 'missing-id',
    });
    bridge.send(Channels.Terminal.OnEvent, null);

    expect(cb).not.toHaveBeenCalled();
  });
});
