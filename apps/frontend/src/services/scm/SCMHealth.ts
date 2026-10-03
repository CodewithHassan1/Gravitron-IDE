export class SCMHealth {
  private metrics: Record<string, number> = {};

  recordLatency(operation: string, ms: number) {
    this.metrics[`${operation}_latency`] = ms;
  }

  getMetrics() {
    return { ...this.metrics };
  }
}

export const scmHealth = new SCMHealth();
