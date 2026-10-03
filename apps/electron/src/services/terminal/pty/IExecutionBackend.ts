import { TerminalProtocol, ExecutionBackendKind, ExecutionTarget, ExecutionContext } from '@ag/protocol';
import { IProcess } from './types';

/**
 * Execution backend capabilities
 */
export interface ExecutionBackendCapabilities extends TerminalProtocol.TerminalCapabilities {}

export interface IExecutionBackend {
  readonly kind: ExecutionBackendKind;
  readonly capabilities: ExecutionBackendCapabilities;
  
  createProcess(sessionId: string, context: ExecutionContext): Promise<string>;
  getProcess(nativeProcessId: string): IProcess | undefined;
  dispose(): void;
}
