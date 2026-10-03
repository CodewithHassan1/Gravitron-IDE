export class EditorPerformanceImpl {
  private metrics: Map<string, number> = new Map();
  private marks: Map<string, number> = new Map();

  markStart(name: string) {
    if (process.env.NODE_ENV !== 'production') {
      this.marks.set(name, performance.now());
    }
  }

  markEnd(name: string, log = false) {
    if (process.env.NODE_ENV !== 'production') {
      const start = this.marks.get(name);
      if (start) {
        const duration = performance.now() - start;
        this.metrics.set(name, duration);
        if (log) {
          console.log(`[EditorPerf] ${name}: ${duration.toFixed(2)}ms`);
        }
        this.marks.delete(name);
        return duration;
      }
    }
    return 0;
  }

  getMetric(name: string) {
    return this.metrics.get(name);
  }

  clear() {
    this.metrics.clear();
    this.marks.clear();
  }
}

export const EditorPerformance = new EditorPerformanceImpl();
