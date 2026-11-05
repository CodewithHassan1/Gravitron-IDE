export interface IDisposable {
  dispose(): void;
}

export class DisposableRegistryImpl {
  private disposables: Map<string, Set<IDisposable>> = new Map();

  register(ownerId: string, disposable: IDisposable) {
    if (!this.disposables.has(ownerId)) {
      this.disposables.set(ownerId, new Set());
    }
    this.disposables.get(ownerId)!.add(disposable);
  }

  unregister(ownerId: string, disposable: IDisposable) {
    const ownerDisposables = this.disposables.get(ownerId);
    if (ownerDisposables) {
      ownerDisposables.delete(disposable);
    }
  }

  disposeByOwner(ownerId: string) {
    const ownerDisposables = this.disposables.get(ownerId);
    if (ownerDisposables) {
      ownerDisposables.forEach((d) => {
        try {
          d.dispose();
        } catch (e) {
          console.error(`Error disposing resource for owner ${ownerId}`, e);
        }
      });
      ownerDisposables.clear();
      this.disposables.delete(ownerId);
    }
  }

  disposeAll() {
    this.disposables.forEach((set, ownerId) => this.disposeByOwner(ownerId));
  }
}

export const DisposableRegistry = new DisposableRegistryImpl();
