import { ILifecycleService, IIpcService } from './IService';

export interface IExternalLauncher {
  openExternal(url: string): Promise<void>;
}

export interface IExternalLinkService extends ILifecycleService, IIpcService {
  openUrl(urlStr: string): Promise<void>;
}
