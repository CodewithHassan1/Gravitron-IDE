export interface CancellationToken {
  readonly isCancellationRequested: boolean;
  onCancellationRequested(listener: () => void): { dispose: () => void };
}

export class CancellationTokenSource {
  private _isCancellationRequested = false;
  private _listeners: (() => void)[] = [];

  get token(): CancellationToken {
    return {
      isCancellationRequested: this._isCancellationRequested,
      onCancellationRequested: (listener: () => void) => {
        if (this._isCancellationRequested) {
          listener();
          return { dispose: () => {} };
        }
        this._listeners.push(listener);
        return {
          dispose: () => {
            const index = this._listeners.indexOf(listener);
            if (index > -1) {
              this._listeners.splice(index, 1);
            }
          }
        };
      }
    };
  }

  cancel(): void {
    if (this._isCancellationRequested) return;
    this._isCancellationRequested = true;
    for (const listener of this._listeners) {
      listener();
    }
    this._listeners = [];
  }
}
