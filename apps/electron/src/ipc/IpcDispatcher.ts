import { RequestEnvelope, ErrorEnvelope, ProtocolVersion } from '@ag/protocol';
import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { ApplicationHost } from '../ApplicationHost';
import { IpcContext } from './IpcContext';
import { randomUUID } from 'node:crypto';

export type IpcMiddleware = (
  envelope: RequestEnvelope<any>,
  event: IpcMainInvokeEvent,
  ctx: IpcContext,
  next: () => Promise<any>
) => Promise<any>;

export class IpcDispatcher {
  private middlewares: IpcMiddleware[] = [];
  private activeRequests = new Map<string, AbortController>();

  constructor(private host: ApplicationHost) {
    this.use(this.trustedSenderMiddleware.bind(this));
    this.use(this.validationMiddleware.bind(this));
    this.use(this.loggingMiddleware.bind(this));
  }

  /**
   * PHASE 8.3 ENFORCEMENT: only trusted renderer frames may issue IPC against
   * the privileged main process. In development the IDE frontend is served
   * from http://localhost:<port>; in production it is loaded from the bundled
   * app:// or file:// origin. Any other sender is denied before payload
   * handling. This mirrors NavigationPolicy's trust model.
   */
  private async trustedSenderMiddleware(envelope: RequestEnvelope<any>, event: IpcMainInvokeEvent, ctx: IpcContext, next: () => Promise<any>) {
    const senderUrl = event?.senderFrame?.url || (event?.sender?.getURL?.() as string | undefined);
    if (!senderUrl || !this.isTrustedSenderUrl(senderUrl)) {
      console.error(`[IPC] Rejected IPC from untrusted sender: ${senderUrl ?? 'no sender frame'}`);
      return this.createErrorResponse('UNTRUSTED_SENDER', 'Untrusted IPC sender', envelope.requestId);
    }
    return next();
  }

  private isTrustedSenderUrl(senderUrl: string): boolean {
    try {
      const url = new URL(senderUrl);
      const isDevTrusted =
        (url.protocol === 'http:' || url.protocol === 'https:') &&
        (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
      const isProdTrusted = url.protocol === 'app:' || url.protocol === 'file:';
      return isDevTrusted || isProdTrusted;
    } catch {
      return false;
    }
  }

  public use(middleware: IpcMiddleware) {
    this.middlewares.push(middleware);
  }

  public registerHandler<TReq, TRes>(
    channel: string,
    handler: (payload: TReq, ctx: IpcContext) => Promise<TRes>
  ) {
    ipcMain.handle(channel, async (event, rawEnvelope: unknown) => {
      // Basic shape validation must happen before we even pass to middleware
      if (!this.isValidEnvelope(rawEnvelope)) {
        console.error(`[IPC] Invalid envelope on ${channel}`);
        return this.createErrorResponse('VALIDATION_ERROR', 'Invalid Request Envelope');
      }

      const envelope = rawEnvelope as RequestEnvelope<TReq>;

      const abortController = new AbortController();
      this.activeRequests.set(envelope.requestId, abortController);

      const ctx: IpcContext = {
        requestId: envelope.requestId,
        traceId: envelope.traceContext?.traceId || randomUUID(),
        spanId: envelope.traceContext?.spanId,
        parentSpanId: envelope.traceContext?.parentSpanId,
        abortSignal: abortController.signal,
        logger: {
          log: (msg: string, ...args: any[]) => console.log(`[ReqID: ${envelope.requestId}] ${msg}`, ...args),
          error: (msg: string, ...args: any[]) => console.error(`[ReqID: ${envelope.requestId}] ${msg}`, ...args),
          warn: (msg: string, ...args: any[]) => console.warn(`[ReqID: ${envelope.requestId}] ${msg}`, ...args)
        }
      };

      let index = 0;

      const next = async (): Promise<any> => {
        if (index < this.middlewares.length) {
          const mw = this.middlewares[index++];
          return mw(envelope, event, ctx, next);
        } else {
          return handler(envelope.payload, ctx);
        }
      };

      try {
        const result = await next();
        if (result && typeof result === 'object' && 'errorName' in result) {
          return result;
        }
        return {
          version: ProtocolVersion.V1,
          requestId: envelope.requestId,
          payload: result
        };
      } catch (e: any) {
        return this.createErrorResponse('INTERNAL_ERROR', e?.message || 'Unknown Error', envelope.requestId);
      } finally {
        this.activeRequests.delete(envelope.requestId);
      }
    });
  }

  public registerCancellationHandler() {
    // Assuming Channels.IPC.CancelRequest is defined
    ipcMain.handle('ipc/cancelRequest', (event, envelope: RequestEnvelope<{ requestId: string }>) => {
      const abortController = this.activeRequests.get(envelope.payload.requestId);
      if (abortController) {
        abortController.abort();
      }
      return {
        version: ProtocolVersion.V1,
        requestId: envelope.requestId,
        payload: { cancelled: !!abortController }
      };
    });
  }

  private async validationMiddleware(envelope: RequestEnvelope<any>, event: IpcMainInvokeEvent, ctx: IpcContext, next: () => Promise<any>) {
    // Future validation extension point
    return next();
  }

  private async loggingMiddleware(envelope: RequestEnvelope<any>, event: IpcMainInvokeEvent, ctx: IpcContext, next: () => Promise<any>) {
    ctx.logger.log(`req start`);
    const start = Date.now();
    try {
      const result = await next();
      ctx.logger.log(`res in ${Date.now() - start}ms`);
      return result;
    } catch (e) {
      ctx.logger.error(`err`, e);
      throw e;
    }
  }

  private isValidEnvelope(envelope: any): envelope is RequestEnvelope<any> {
    return (
      envelope &&
      typeof envelope === 'object' &&
      envelope.version === ProtocolVersion.V1 &&
      typeof envelope.requestId === 'string' &&
      'payload' in envelope
    );
  }

  private createErrorResponse(code: string, message: string, requestId?: string): ErrorEnvelope {
    return {
      version: ProtocolVersion.V1,
      requestId,
      errorName: 'IpcError',
      code,
      message
    };
  }
}
