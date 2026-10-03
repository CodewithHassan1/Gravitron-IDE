export interface TelemetryEvent {
  id: string;
  type: 'capability' | 'provider' | 'tool';
  durationMs: number;
  providerId?: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  toolId?: string;
  success: boolean;
  error?: string;
  timestamp: number;
}

export class AITelemetrySession {
  private events: TelemetryEvent[] = [];

  recordEvent(event: TelemetryEvent) {
    this.events.push(event);
  }

  getEvents(): TelemetryEvent[] { 
    return this.events; 
  }
}

export const TelemetrySession = new AITelemetrySession();
