// src/services/terminal/registry/TerminalRegistry.ts

import { TerminalSession } from '../session/TerminalSession';
import { IDisposable } from '../types';

export interface TerminalRegistry extends IDisposable {
  getSessions(): ReadonlyArray<Readonly<TerminalSession>>;
  getSession(id: string): Readonly<TerminalSession> | undefined;
  getActiveSession(): Readonly<TerminalSession> | undefined;

  setActiveSession(id: string): void;
  addSession(session: TerminalSession): void;
  hasSession(id: string): boolean;
  replaceSession(id: string, session: TerminalSession): void;
  removeSession(id: string): void;

  onRegistryChanged(
    listener: (sessions: ReadonlyArray<Readonly<TerminalSession>>) => void
  ): IDisposable;
  onActiveSessionChanged(
    listener: (session: Readonly<TerminalSession> | undefined) => void
  ): IDisposable;
}
