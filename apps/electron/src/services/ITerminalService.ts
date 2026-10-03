import { ILifecycleService, IIpcService } from './IService';
import { TerminalProtocol } from '@ag/protocol';

export interface ITerminalService extends ILifecycleService, IIpcService {
  createTerminal(options: any): Promise<string>;
  closeTerminal(sessionId: string): Promise<void>;
  resizeTerminal(sessionId: string, cols: number, rows: number): Promise<void>;
  writeTerminal(sessionId: string, data: string): Promise<void>;
  listSessions(): string[];
  getProfiles(): Promise<TerminalProtocol.TerminalProfile[]>;
}
