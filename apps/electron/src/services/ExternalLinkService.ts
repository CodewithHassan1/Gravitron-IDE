import { IExternalLinkService, IExternalLauncher } from './IExternalLinkService';
import { ServiceId, ServiceIds } from './ServiceIds';
import { IpcHandlerRegistration } from './IService';
import { Channels } from '@ag/protocol';

export class ExternalLinkService implements IExternalLinkService {
  public readonly id = ServiceIds.ExternalLink;
  public readonly dependencies: readonly ServiceId[] = [];
  private static ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

  constructor(private launcher: IExternalLauncher) {}

  public async initialize(): Promise<void> {}
  public async start(): Promise<void> {}
  public async stop(): Promise<void> {}
  public async dispose(): Promise<void> {}
  public async health(): Promise<boolean> { return true; }

  public async openUrl(urlStr: string): Promise<void> {
    try {
      const url = new URL(urlStr);
      if (!ExternalLinkService.ALLOWED_PROTOCOLS.has(url.protocol)) {
        throw new Error(`Protocol not allowed: ${url.protocol}`);
      }
      await this.launcher.openExternal(url.href);
    } catch (e) {
      console.error(`Failed to open external URL ${urlStr}`, e);
      throw e;
    }
  }

  public registerHandlers(): IpcHandlerRegistration[] {
    return [
      {
        channel: Channels.Window.OpenExternalRequest,
        handler: async (url: string) => {
          await this.openUrl(url);
        }
      }
    ];
  }
}
