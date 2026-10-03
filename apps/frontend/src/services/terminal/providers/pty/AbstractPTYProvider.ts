// src/services/terminal/providers/pty/AbstractPTYProvider.ts

import { PTYProvider } from './PTYProvider';
import { ITerminalStream } from '../../types';

export abstract class AbstractPTYProvider implements PTYProvider {
  public abstract readonly id: string;

  public abstract spawn(cwd: string, executable: string, args: ReadonlyArray<string>, env: Readonly<Record<string, string>>): Promise<ITerminalStream>;
  
  public async resize(cols: number, rows: number): Promise<void> {
    // Override if PTY supports dynamic resize
  }

  public async kill(signal?: string): Promise<void> {
    // Override to send signal to PTY
  }

  public dispose(): void {
    // Clean up handles
  }
}
