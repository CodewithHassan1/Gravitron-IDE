// src/services/terminal/providers/terminal/TerminalProvider.ts

import { TerminalDescriptor, ITerminalStream, TerminalCapabilities, IDisposable } from '../../types';

export interface TerminalProvider extends IDisposable {
  readonly id: string;
  readonly capabilities: TerminalCapabilities;
  
  createStream(config: TerminalDescriptor): Promise<ITerminalStream>;
  attachStream?(terminalId: string, sessionId: string): Promise<{ stream: ITerminalStream; history: Uint8Array }>;
  listSessions?(): Promise<{ sessionId: string; state: string }[]>;
  validateEnvironment(): Promise<boolean>;
  getProfiles?(): Promise<any[]>;
  kill?(terminalId: string): Promise<void>;
}
