// src/services/quickInput/QuickInputTelemetry.ts
import { QuickInputEventBus, QuickInputEventType } from './QuickInputEventBus';

export interface TelemetryData {
  executionLatency: number[];
  searchLatency: number[];
  cancelledSearches: number;
  cacheHits: number;
  cacheMisses: number;
  mostUsedCommands: Record<string, number>;
}

class QuickInputTelemetryImpl {
  private data: TelemetryData = {
    executionLatency: [],
    searchLatency: [],
    cancelledSearches: 0,
    cacheHits: 0,
    cacheMisses: 0,
    mostUsedCommands: {},
  };

  private searchStartTimes = new Map<string, number>();

  initialize() {
    QuickInputEventBus.subscribe(QuickInputEventType.LoadingStarted, () => {
      this.searchStartTimes.set('current', performance.now());
    });

    QuickInputEventBus.subscribe(QuickInputEventType.LoadingFinished, () => {
      const start = this.searchStartTimes.get('current');
      if (start) {
        const latency = performance.now() - start;
        this.trackSearchLatency(latency);
        this.searchStartTimes.delete('current');
      }
    });

    QuickInputEventBus.subscribe(QuickInputEventType.ItemExecuted, ({ itemId, providerId }) => {
      if (providerId === 'command') {
        this.trackCommandUsage(itemId);
      }
    });
  }

  trackSearchLatency(ms: number) {
    if (process.env.NODE_ENV !== 'production') {
      this.data.searchLatency.push(ms);
      if (this.data.searchLatency.length > 100) this.data.searchLatency.shift();
    }
  }

  trackExecutionLatency(ms: number) {
    if (process.env.NODE_ENV !== 'production') {
      this.data.executionLatency.push(ms);
      if (this.data.executionLatency.length > 100) this.data.executionLatency.shift();
    }
  }

  trackCancelledSearch() {
    if (process.env.NODE_ENV !== 'production') {
      this.data.cancelledSearches++;
    }
  }

  trackCacheHit(hit: boolean) {
    if (process.env.NODE_ENV !== 'production') {
      hit ? this.data.cacheHits++ : this.data.cacheMisses++;
    }
  }

  trackCommandUsage(commandId: string) {
    if (!this.data.mostUsedCommands[commandId]) {
      this.data.mostUsedCommands[commandId] = 0;
    }
    this.data.mostUsedCommands[commandId]++;
  }

  getMetrics() {
    return this.data;
  }
}

export const QuickInputTelemetry = new QuickInputTelemetryImpl();
