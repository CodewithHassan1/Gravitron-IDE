import { PlatformError } from '../ipc/errors';

export class TerminalNotFoundError extends PlatformError {
  constructor(sessionId: string) {
    super('TERMINAL_NOT_FOUND', `Terminal session ${sessionId} not found.`);
  }
}

export class TerminalStartError extends PlatformError {
  constructor(message: string) {
    super('TERMINAL_START_ERROR', `Failed to start terminal: ${message}`);
  }
}
