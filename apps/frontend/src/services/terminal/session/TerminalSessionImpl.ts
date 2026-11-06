// src/services/terminal/session/TerminalSessionImpl.ts

import { TerminalSession } from './TerminalSession';
import { TerminalProvider } from '../providers/terminal/TerminalProvider';
import { TerminalSessionState, TerminalMetadata, ITerminalStream, IDisposable } from '../types';
import { TerminalEvents } from '../events/TerminalEvents';
import { TerminalEventType } from '../types/events';

export class TerminalSessionImpl implements TerminalSession {
  private _state: TerminalSessionState = TerminalSessionState.Created;
  private stream: ITerminalStream | null = null;
  private disposables: Set<IDisposable> = new Set();

  private dataListeners: Set<(data: Uint8Array) => void> = new Set();
  private stateListeners: Set<(state: TerminalSessionState) => void> = new Set();
  private stateQueue: TerminalSessionState[] = [];
  private isTransitioning: boolean = false;

  constructor(
    public readonly metadata: Readonly<TerminalMetadata>,
    private readonly provider: TerminalProvider
  ) {}

  public get id(): string {
    return this.metadata.id;
  }

  public get state(): TerminalSessionState {
    return this._state;
  }

  private transitionTo(newState: TerminalSessionState): void {
    if (this._state === newState) return; // Ignore duplicate transitions (e.g. Suspended -> Suspended)

    const valid = this.isValidTransition(this._state, newState);
    if (!valid) {
      console.warn(`Ignoring illegal terminal state transition: ${this._state} -> ${newState}`);
      return;
    }

    this._state = newState;
    this.stateQueue.push(newState);

    if (this.isTransitioning) return;

    this.isTransitioning = true;
    try {
      while (this.stateQueue.length > 0) {
        const stateToNotify = this.stateQueue.shift()!;
        for (const listener of Array.from(this.stateListeners)) {
          try {
            listener(stateToNotify);
          } catch (e) {
            console.error(e);
          }
        }
      }
    } finally {
      this.isTransitioning = false;
    }
  }

  private isValidTransition(from: TerminalSessionState, to: TerminalSessionState): boolean {
    const map: Record<TerminalSessionState, Set<TerminalSessionState>> = {
      [TerminalSessionState.Created]: new Set([
        TerminalSessionState.Initializing,
        TerminalSessionState.Closing,
        TerminalSessionState.Disposed,
      ]),
      [TerminalSessionState.Initializing]: new Set([
        TerminalSessionState.Connecting,
        TerminalSessionState.Closing,
      ]),
      [TerminalSessionState.Connecting]: new Set([
        TerminalSessionState.Running,
        TerminalSessionState.Closing,
      ]),
      [TerminalSessionState.Running]: new Set([
        TerminalSessionState.Suspended,
        TerminalSessionState.Closing,
      ]),
      [TerminalSessionState.Suspended]: new Set([
        TerminalSessionState.Connecting,
        TerminalSessionState.Closing,
      ]),
      [TerminalSessionState.Closing]: new Set([TerminalSessionState.Closed]),
      [TerminalSessionState.Closed]: new Set([TerminalSessionState.Disposed]),
      [TerminalSessionState.Disposed]: new Set(),
    };
    return map[from].has(to);
  }

  public async attach(backendSessionId: string): Promise<void> {
    if (
      this._state === TerminalSessionState.Created ||
      this._state === TerminalSessionState.Suspended
    ) {
      try {
        if (this._state === TerminalSessionState.Created) {
          this.transitionTo(TerminalSessionState.Initializing);
        }
        this.transitionTo(TerminalSessionState.Connecting);

        if (!this.provider.attachStream) {
          throw new Error('Provider does not support attachStream');
        }

        const { stream, history } = await this.provider.attachStream(this.id, backendSessionId);
        this.stream = stream;

        this.disposables.add(
          this.stream.onData((data) => {
            for (const listener of Array.from(this.dataListeners)) {
              listener(data);
            }
          })
        );

        this.disposables.add(
          this.stream.onClose(() => {
            if (this._state === TerminalSessionState.Running) {
              this.suspend().catch(console.error);
            }
          })
        );

        this.disposables.add(
          this.stream.onError((err) => {
            TerminalEvents.emit(TerminalEventType.TerminalError, {
              terminalId: this.id,
              timestamp: Date.now(),
              errorType: 'StreamError',
              message: err.message,
            });
            if (this._state === TerminalSessionState.Running) {
              this.suspend().catch(console.error);
            }
          })
        );

        this.transitionTo(TerminalSessionState.Running);

        // Replay history
        if (history && history.length > 0) {
          for (const listener of Array.from(this.dataListeners)) {
            listener(history);
          }
        }
      } catch (e) {
        this.transitionTo(TerminalSessionState.Closing);
        this.transitionTo(TerminalSessionState.Closed);
        throw e;
      }
    } else {
      throw new Error(`Cannot attach from state ${this._state}`);
    }
  }

  public async connect(): Promise<void> {
    if (
      this._state === TerminalSessionState.Created ||
      this._state === TerminalSessionState.Suspended
    ) {
      try {
        if (this._state === TerminalSessionState.Created) {
          this.transitionTo(TerminalSessionState.Initializing);
        }
        this.transitionTo(TerminalSessionState.Connecting);

        const isValid = await this.provider.validateEnvironment();
        if (!isValid) {
          throw new Error('Terminal environment validation failed.');
        }

        this.stream = await this.provider.createStream({
          metadata: this.metadata,
          cols: 80, // Default until resize
          rows: 24,
        });

        let firstDataEvent = false;
        this.disposables.add(
          this.stream.onData((data) => {
            if (!firstDataEvent) {
              firstDataEvent = true;
            }
            for (const listener of Array.from(this.dataListeners)) {
              listener(data);
            }
          })
        );

        this.disposables.add(
          this.stream.onClose(() => {
            if (this._state === TerminalSessionState.Running) {
              this.suspend().catch(console.error);
            }
          })
        );

        this.disposables.add(
          this.stream.onError((err) => {
            TerminalEvents.emit(TerminalEventType.TerminalError, {
              terminalId: this.id,
              timestamp: Date.now(),
              errorType: 'StreamError',
              message: err.message,
            });
            if (this._state === TerminalSessionState.Running) {
              this.suspend().catch(console.error);
            }
          })
        );

        this.transitionTo(TerminalSessionState.Running);
      } catch (e) {
        this.transitionTo(TerminalSessionState.Closing);
        this.transitionTo(TerminalSessionState.Closed);
        throw e;
      }
    } else {
      throw new Error(`Cannot connect from state ${this._state}`);
    }
  }

  public async write(data: string | Uint8Array): Promise<void> {
    if (this._state !== TerminalSessionState.Running || !this.stream) {
      throw new Error(`Cannot write data in state ${this._state}`);
    }
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    await this.stream.write(bytes);

    TerminalEvents.emit(TerminalEventType.TerminalInput, {
      terminalId: this.id,
      timestamp: Date.now(),
      payloadLength: bytes.byteLength,
    });
  }

  public async resize(cols: number, rows: number): Promise<void> {
    if (this._state !== TerminalSessionState.Running) {
      // Ignored if not running
      return;
    }
    // Provider would handle the resize. Since ITerminalStream doesn't expose resize directly,
    // we would typically delegate to provider.resize or stream.resize if extended.
    // For now we just emit the event.
    TerminalEvents.emit(TerminalEventType.TerminalResized, {
      terminalId: this.id,
      timestamp: Date.now(),
      cols,
      rows,
    });
  }

  public focus(): void {
    TerminalEvents.emit(TerminalEventType.TerminalFocused, {
      terminalId: this.id,
      timestamp: Date.now(),
    });
  }

  public async suspend(): Promise<void> {
    if (this._state === TerminalSessionState.Running) {
      this.transitionTo(TerminalSessionState.Suspended);
      this.clearStream();
    }
  }

  public async resume(): Promise<void> {
    if (this._state === TerminalSessionState.Suspended) {
      await this.connect();
    }
  }

  public async close(): Promise<void> {
    if (
      this._state === TerminalSessionState.Disposed ||
      this._state === TerminalSessionState.Closed ||
      this._state === TerminalSessionState.Closing
    ) {
      return;
    }

    this.transitionTo(TerminalSessionState.Closing);
    this.clearStream();
    this.transitionTo(TerminalSessionState.Closed);

    TerminalEvents.emit(TerminalEventType.TerminalClosed, {
      terminalId: this.id,
      timestamp: Date.now(),
    });
  }

  private clearStream(): void {
    if (this.stream) {
      const s = this.stream;
      this.stream = null;
      s.dispose();
    }
    for (const d of Array.from(this.disposables)) {
      d.dispose();
    }
    this.disposables.clear();
  }

  public onData(listener: (data: Uint8Array) => void): IDisposable {
    this.dataListeners.add(listener);
    return {
      dispose: () => this.dataListeners.delete(listener),
    };
  }

  public onStateChanged(listener: (state: TerminalSessionState) => void): IDisposable {
    this.stateListeners.add(listener);
    return {
      dispose: () => this.stateListeners.delete(listener),
    };
  }

  public dispose(): void {
    if (
      this._state !== TerminalSessionState.Closed &&
      this._state !== TerminalSessionState.Created &&
      this._state !== TerminalSessionState.Closing
    ) {
      // Attempt clean close if not already closed
      this.transitionTo(TerminalSessionState.Closing);
      this.clearStream();
      this.transitionTo(TerminalSessionState.Closed);
    }
    if (
      (this._state as TerminalSessionState) !== TerminalSessionState.Disposed &&
      (this._state as TerminalSessionState) !== TerminalSessionState.Closing
    ) {
      this.transitionTo(TerminalSessionState.Disposed);
    }

    this.dataListeners.clear();
    this.stateListeners.clear();
    this.clearStream();
  }
}
