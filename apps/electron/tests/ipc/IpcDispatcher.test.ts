import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IpcDispatcher } from '../../src/ipc/IpcDispatcher';
import { ApplicationHost } from '../../src/ApplicationHost';
import { ProtocolVersion } from '@ag/protocol';
import { ipcMain } from 'electron';

// Mock ipcMain.handle
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}));

const TRUSTED_SENDER_EVENT = {
  senderFrame: { url: 'file:///agent/index.html' },
  sender: { getURL: () => 'file:///agent/index.html' },
};

describe('IpcDispatcher', () => {
  let dispatcher: IpcDispatcher;
  let host: ApplicationHost;

  beforeEach(() => {
    vi.clearAllMocks();
    host = new ApplicationHost();
    dispatcher = new IpcDispatcher(host);
  });

  it('registers handler via ipcMain', () => {
    dispatcher.registerHandler('test/channel', async () => 'test');
    expect(ipcMain.handle).toHaveBeenCalledWith('test/channel', expect.any(Function));
  });

  it('rejects malformed payloads without valid envelopes', async () => {
    dispatcher.registerHandler('test/channel', async () => 'test');
    const handler = vi.mocked(ipcMain.handle).mock.calls[0][1] as Function;

    const result = await handler(TRUSTED_SENDER_EVENT as any, { invalid: 'payload' });
    expect(result.errorName).toBe('IpcError');
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('processes valid envelopes and wraps response', async () => {
    dispatcher.registerHandler('test/channel', async (payload: string) => payload + ' processed');
    const handler = vi.mocked(ipcMain.handle).mock.calls[0][1] as Function;

    const validRequest = {
      version: ProtocolVersion.V1,
      requestId: '123',
      payload: 'hello'
    };

    const result = await handler(TRUSTED_SENDER_EVENT as any, validRequest);
    expect(result.payload).toBe('hello processed');
    expect(result.requestId).toBe('123');
    expect(result.version).toBe(ProtocolVersion.V1);
  });

  it('rejects untrusted sender frames before any payload handling (PHASE 8.3)', async () => {
    const handlerSpy = vi.fn().mockResolvedValue('should-not-run');
    dispatcher.registerHandler('test/trust', handlerSpy);
    const handler = vi.mocked(ipcMain.handle).mock.calls[0][1] as Function;

    const result = await handler({ senderFrame: { url: 'http://evil.example.com/phish' } } as any, {
      version: ProtocolVersion.V1,
      requestId: '123',
      payload: null
    });

    expect(result.errorName).toBe('IpcError');
    expect(result.code).toBe('UNTRUSTED_SENDER');
    expect(handlerSpy).not.toHaveBeenCalled();
  });

  it('executes middleware in order', async () => {
    const log: string[] = [];
    dispatcher.use(async (env, evt, ctx, next) => {
      log.push('mw1 start');
      const res = await next();
      log.push('mw1 end');
      return res;
    });
    dispatcher.use(async (env, evt, ctx, next) => {
      log.push('mw2 start');
      const res = await next();
      log.push('mw2 end');
      return res;
    });

    dispatcher.registerHandler('test/pipeline', async () => {
      log.push('handler');
      return 'ok';
    });
    const handler = vi.mocked(ipcMain.handle).mock.calls[0][1] as Function;
    
    await handler(TRUSTED_SENDER_EVENT as any, {
      version: ProtocolVersion.V1,
      requestId: '123',
      payload: null
    });

    expect(log).toEqual(['mw1 start', 'mw2 start', 'handler', 'mw2 end', 'mw1 end']);
  });
});
