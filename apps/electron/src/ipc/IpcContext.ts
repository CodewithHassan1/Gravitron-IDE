export interface IpcContext {
  requestId: string;
  traceId: string;
  spanId?: string;
  parentSpanId?: string;
  abortSignal: AbortSignal;
  logger: {
    log: (msg: string, ...args: any[]) => void;
    error: (msg: string, ...args: any[]) => void;
    warn: (msg: string, ...args: any[]) => void;
  };
}
