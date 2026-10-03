import { TerminalProvider } from './TerminalProvider';
import { TerminalDescriptor, ITerminalStream, TerminalCapabilities, ITerminalTransport, IDisposable } from '../../types';
import { TerminalEvents } from '../../events/TerminalEvents';
import { TerminalEventType } from '../../types/events';

export abstract class AbstractTerminalProvider implements TerminalProvider {
  public abstract readonly id: string;
  
  public get capabilities(): TerminalCapabilities {
    return {
      supportsResize: true,
      supportsColor: true,
      supportsTitle: true,
      supportsMouse: false,
    };
  }

  protected transport: ITerminalTransport;
  private disposables: IDisposable[] = [];

  constructor(transport: ITerminalTransport) {
    this.transport = transport;

    // Listen to global resize events and forward them to transport
    const resizeListener = TerminalEvents.on(TerminalEventType.TerminalResized, (event) => {
      this.transport.resize(event.terminalId, event.cols, event.rows).catch(err => {
        console.error(`Failed to resize terminal ${event.terminalId} over transport:`, err);
      });
    });
    this.disposables.push(resizeListener);
  }

  public async createStream(config: TerminalDescriptor): Promise<ITerminalStream> {
    return this.transport.createStream(config);
  }
  
  public async validateEnvironment(): Promise<boolean> {
    return true;
  }

  public async attachStream(terminalId: string, sessionId: string): Promise<{ stream: ITerminalStream; history: Uint8Array }> {
    if (this.transport.attachStream) {
      return this.transport.attachStream(terminalId, sessionId);
    }
    throw new Error('Transport does not support attachStream');
  }

  public async listSessions(): Promise<{ sessionId: string; state: string }[]> {
    if (this.transport.listSessions) {
      return this.transport.listSessions();
    }
    return [];
  }

  public async getProfiles(): Promise<any[]> {
    if (this.transport.getProfiles) {
      return this.transport.getProfiles();
    }
    return [];
  }

  public async kill(terminalId: string): Promise<void> {
    if (this.transport.kill) {
      await this.transport.kill(terminalId);
    }
  }

  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
    this.transport.dispose();
  }
}
