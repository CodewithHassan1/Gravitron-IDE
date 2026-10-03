import { ProtocolVersion } from './versioning';

export interface TraceContext {
  traceId: string;
  spanId?: string;
  parentSpanId?: string;
}

export interface RequestEnvelope<T> {
  version: ProtocolVersion;
  requestId: string;
  traceContext?: TraceContext;
  payload: T;
}

export interface ResponseEnvelope<T> {
  version: ProtocolVersion;
  requestId: string;
  payload: T;
}

export interface EventEnvelope<T> {
  version: ProtocolVersion;
  traceContext?: TraceContext;
  payload: T;
}

export interface ErrorEnvelope {
  version: ProtocolVersion;
  requestId?: string;
  errorName: string;
  message: string;
  code: string;
  details?: any;
}
