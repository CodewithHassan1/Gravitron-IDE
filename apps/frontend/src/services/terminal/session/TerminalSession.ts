// src/services/terminal/session/TerminalSession.ts

import { IDisposable, TerminalSessionState, ITerminalStream, TerminalMetadata } from '../types';

export interface TerminalSession extends IDisposable {
  readonly id: string;
  readonly state: TerminalSessionState;
  readonly metadata: Readonly<TerminalMetadata>;
  
  write(data: string | Uint8Array): Promise<void>;
  resize(cols: number, rows: number): Promise<void>;
  focus(): void;
  
  connect(): Promise<void>;
  suspend(): Promise<void>;
  resume(): Promise<void>;
  close(): Promise<void>;
  
  onData(listener: (data: Uint8Array) => void): IDisposable;
  onStateChanged(listener: (state: TerminalSessionState) => void): IDisposable;
}
