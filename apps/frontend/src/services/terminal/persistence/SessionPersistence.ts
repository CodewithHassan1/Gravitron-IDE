// src/services/terminal/persistence/SessionPersistence.ts

import { TerminalSnapshot } from '../types';

export interface SessionPersistence {
  save(workspaceId: string, snapshot: TerminalSnapshot): Promise<void>;
  load(workspaceId: string): Promise<TerminalSnapshot | null>;
  clear(workspaceId: string): Promise<void>;
}
