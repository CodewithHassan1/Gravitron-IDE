// src/services/terminal/providers/pty/PTYProvider.ts

import { ITerminalStream, IDisposable } from '../../types';

export interface PTYProvider extends IDisposable {
  readonly id: string;
  spawn(
    cwd: string,
    executable: string,
    args: ReadonlyArray<string>,
    env: Readonly<Record<string, string>>
  ): Promise<ITerminalStream>;
  resize(cols: number, rows: number): Promise<void>;
  kill(signal?: string): Promise<void>;
}
