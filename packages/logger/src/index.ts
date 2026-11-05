import pino from 'pino';

// Define the exact shape required for logs
export interface LogContext {
  trace_id: string;
  span_id: string;
  request_id: string;
  workspace_id?: string;
  organization_id?: string;
  session_id?: string;
  user_id?: string;
  route?: string;
  method?: string;
  duration_ms?: number;
  error_code?: string;
}

export class AGLogger {
  private logger: pino.Logger;

  constructor(serviceName: string, version: string) {
    this.logger = pino({
      base: { service: serviceName, version },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => {
          return { level: label.toUpperCase() };
        },
      },
    });
  }

  info(ctx: LogContext, message: string, extra?: Record<string, unknown>) {
    this.logger.info({ ...ctx, ...extra }, message);
  }

  error(ctx: LogContext, message: string, error?: Error, extra?: Record<string, unknown>) {
    this.logger.error({ ...ctx, err: error, ...extra }, message);
  }

  warn(ctx: LogContext, message: string, extra?: Record<string, unknown>) {
    this.logger.warn({ ...ctx, ...extra }, message);
  }

  debug(ctx: LogContext, message: string, extra?: Record<string, unknown>) {
    this.logger.debug({ ...ctx, ...extra }, message);
  }
}
