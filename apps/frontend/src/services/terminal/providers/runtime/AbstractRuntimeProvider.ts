// src/services/terminal/providers/runtime/AbstractRuntimeProvider.ts

import { RuntimeProvider, RuntimeCapabilities, ProcessManager, ResourceMonitor } from './RuntimeProvider';
import { RuntimeStatus } from '../../types';

export abstract class AbstractRuntimeProvider implements RuntimeProvider {
  public abstract readonly type: string;

  public get capabilities(): RuntimeCapabilities {
    return {
      supportsResize: true,
      supportsSignals: true,
      supportsEnvironment: true,
      supportsPersistence: false,
      supportsReconnect: false,
      supportsDetach: false,
    };
  }

  public abstract getProcessManager(): ProcessManager;
  public abstract getResourceMonitor(): ResourceMonitor;

  public async connect(): Promise<void> {
    // Default no-op
  }

  public async disconnect(): Promise<void> {
    // Default no-op
  }

  public getStatus(): RuntimeStatus {
    return {
      isConnected: true,
      latencyMs: 0,
      lastHeartbeat: Date.now(),
    };
  }

  public dispose(): void {
    // Override in subclass
  }
}
