export interface PendingMutation {
  id: string;
  path: string;
  operation: string;
  expires: number;
}

export class MutationTracker {
  private mutations = new Map<string, PendingMutation>();
  private MUTATION_TIMEOUT_MS = 5000; // 5 seconds expiry

  public createMutation(path: string, operation: string): string {
    const id = crypto.randomUUID();
    this.mutations.set(id, {
      id,
      path,
      operation,
      expires: Date.now() + this.MUTATION_TIMEOUT_MS,
    });
    this.cleanup();
    return id;
  }

  public hasMutationForPath(path: string): boolean {
    this.cleanup();
    const values = Array.from(this.mutations.values());
    for (let i = 0; i < values.length; i++) {
      if (values[i].path === path) {
        return true;
      }
    }
    return false;
  }

  public resolveMutation(id: string): void {
    this.mutations.delete(id);
  }

  private cleanup(): void {
    const now = Date.now();
    const entries = Array.from(this.mutations.entries());
    for (let i = 0; i < entries.length; i++) {
      const [id, mutation] = entries[i];
      if (mutation.expires < now) {
        this.mutations.delete(id);
      }
    }
  }
}
