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
    this.use(this.validationMiddleware.bind(this));
    this.use(this.loggingMiddleware.bind(this));
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
