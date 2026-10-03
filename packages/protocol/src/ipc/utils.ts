import { ResponseEnvelope, ErrorEnvelope } from './envelopes';

/**
 * Safely unwraps an IPC response envelope, throwing a structured error if the backend returned an ErrorEnvelope.
 * This should be the authoritative way to parse IPC responses.
 */
export function unwrapIpcResponse<T>(response: ResponseEnvelope<T> | ErrorEnvelope): T {
  if (!response) {
    throw new Error("[IPC Error] Invalid IPC Response: received null or undefined");
  }

  if ('errorName' in response) {
    throw new Error(
      `[IPC Error]\n` +
      `requestId: ${response.requestId ?? 'unknown'}\n` +
      `errorName: ${response.errorName}\n` +
      `code: ${response.code}\n` +
      `message: ${response.message}`
    );
  }

  // By definition, if it's not an ErrorEnvelope, it is a ResponseEnvelope.
  // This correctly supports ResponseEnvelope<void> where payload may be undefined.
  return response.payload;
}