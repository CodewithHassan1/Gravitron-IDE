// src/services/terminal/index.ts

import { TerminalManagerImpl } from './manager/TerminalManagerImpl';
import { AbstractTerminalProvider } from './providers/terminal/AbstractTerminalProvider';
import { MemoryTerminalStream } from './providers/stream/MemoryTerminalStream';
import { MockTransport } from './providers/transport/MockTransport';
import { ElectronTerminalTransport } from './providers/transport/ElectronTerminalTransport';
import { WebSocketTerminalTransport } from './providers/transport/WebSocketTerminalTransport';
import { IndexedDBSessionPersistence } from './persistence/IndexedDBSessionPersistence';
import { TerminalScheduler } from './scheduler/TerminalScheduler';
import { PlatformFactory, ElectronPlatform, WebPlatform } from '@ag/platform';

// Boot platform
if (typeof window !== 'undefined' && (window as any).agApi) {
  const electronPlatform = new ElectronPlatform();
  electronPlatform.registerTerminalTransportFactory(
    () => new ElectronTerminalTransport((window as any).agApi.terminal)
  );
  PlatformFactory.register(electronPlatform);
} else {
  const webPlatform = new WebPlatform();
  PlatformFactory.register(webPlatform);
}

const platform = PlatformFactory.getPlatform();
const transport = platform.capabilities.supportsTerminal()
  ? platform.createTerminalTransport()
  : new WebSocketTerminalTransport('ws://localhost:8081');

// Placeholder Provider until Phase 4.4 / 4.2
class DefaultTerminalProvider extends AbstractTerminalProvider {
  public readonly id = 'default-browser-provider';

  public async validateEnvironment() {
    return true;
  }
}

export const TerminalManager = new TerminalManagerImpl(
  new DefaultTerminalProvider(transport),
  new IndexedDBSessionPersistence(),
  new TerminalScheduler()
);

export * from './manager/TerminalManager';
export * from './registry/TerminalRegistry';
export * from './session/TerminalSession';
export * from './types';
