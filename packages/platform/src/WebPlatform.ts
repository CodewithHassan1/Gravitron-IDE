import { IPlatform } from './IPlatform';
import { IPlatformCapabilities } from './IPlatformCapabilities';

export class WebPlatform implements IPlatform {
  public readonly capabilities: IPlatformCapabilities = {
    supportsTerminal: () => false,
    supportsFileSystem: () => false,
    supportsGit: () => false,
    supportsAI: () => false,
    supportsExtensions: () => false,
  };

  public createTerminalTransport(): any {
    throw new Error('Terminal not supported on WebPlatform');
  }
}
