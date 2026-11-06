import { TelemetryEvent } from './AITelemetry';

export class AIHistory {
  async persistEvent(event: TelemetryEvent) {
    // Stub: Save metrics to IndexedDB locally.
    // Intentionally omitting raw prompts and generated code for privacy.
    console.log('Persisting AI History event', event.type, event.durationMs);
  }

  async exportHistoryJSON(): Promise<string> {
    // Stub
    return '[]';
  }
}

export const GlobalAIHistory = new AIHistory();
