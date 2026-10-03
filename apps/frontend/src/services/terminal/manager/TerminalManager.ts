// src/services/terminal/manager/TerminalManager.ts

import { IDisposable, TerminalMetadata } from '../types';
import { TerminalSession } from '../session/TerminalSession';
import { TerminalRegistry } from '../registry/TerminalRegistry';
import { TerminalProtocol } from '@ag/protocol';

export interface TerminalOptions {
  cwd?: string;
  executable?: string;
  args?: string[];
  env?: Record<string, string>;
  name?: string;
  debugLabel?: string;
  profileId?: string;
  workspaceId?: string;
}

export interface TerminalManager extends IDisposable {
  createTerminal(options?: TerminalOptions): Promise<Readonly<TerminalSession>>;
  destroyTerminal(id: string): Promise<void>;
  getTerminal(id: string): Readonly<TerminalSession> | undefined;
  getRegistry(): TerminalRegistry;
  restoreSessions(workspaceId: string): Promise<void>;
  destroyAllSessions(): Promise<void>;
  getProfiles(): Promise<TerminalProtocol.TerminalProfile[]>;
}
