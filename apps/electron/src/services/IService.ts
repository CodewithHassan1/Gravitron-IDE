import { ServiceId } from './ServiceIds';
import { IpcContext } from '../ipc/IpcContext';

export interface IService {
  readonly id: ServiceId;
  readonly dependencies: readonly ServiceId[];
}

export interface ILifecycleService extends IService {
  initialize(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
  health(): Promise<boolean>;
}

export interface IpcHandlerRegistration {
  channel: string;
  handler: (payload: any, ctx: IpcContext) => Promise<any>;
}

export interface IIpcService extends IService {
  registerHandlers(): IpcHandlerRegistration[];
}
