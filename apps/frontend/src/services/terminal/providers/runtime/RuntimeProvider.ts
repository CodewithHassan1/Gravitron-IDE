// src/services/terminal/providers/runtime/RuntimeProvider.ts

import { IDisposable, RuntimeStatus, ResourceLimits, ResourceUsage } from '../../types';

export interface ProcessManager {
  spawn(command: string, args: ReadonlyArray<string>, cwd: string, env: Readonly<Record<string, string>>): Promise<number>;
  kill(pid: number, signal?: string): Promise<void>;
  isAlive(pid: number): boolean;
}

export interface ResourceMonitor {
  getUsage(pid?: number): Promise<ResourceUsage>;
  setLimits(limits: ResourceLimits): Promise<void>;
}

export interface RuntimeCapabilities {
  readonly supportsResize: boolean;
  readonly supportsSignals: boolean;
  readonly supportsEnvironment: boolean;
  readonly supportsPersistence: boolean;
  readonly supportsReconnect: boolean;
  readonly supportsDetach: boolean;
}

export interface RuntimeProvider extends IDisposable {
  readonly type: string;
  readonly capabilities: RuntimeCapabilities;
  
  getProcessManager(): ProcessManager;
  getResourceMonitor(): ResourceMonitor;
  
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): RuntimeStatus;
}
