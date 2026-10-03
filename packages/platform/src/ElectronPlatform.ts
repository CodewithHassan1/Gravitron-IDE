import { IPlatform } from './IPlatform';
import { IPlatformCapabilities } from './IPlatformCapabilities';

// We rely on the implementer (e.g. ElectronTerminalTransport) to be returned here,
// but since the platform package shouldn't depend on the frontend implementation,
// we'll inject the factory or rely on registering it.

type TransportFactory = () => any;

export class ElectronPlatform implements IPlatform {
  private terminalTransportFactory?: TransportFactory;

  public readonly capabilities: IPlatformCapabilities = {
    supportsTerminal: () => true,
    supportsFileSystem: () => true,
    supportsGit: () => false,
    supportsAI: () => false,
    supportsExtensions: () => false,
  };

  public registerTerminalTransportFactory(factory: TransportFactory) {
    this.terminalTransportFactory = factory;
  }

  public createTerminalTransport(): any {
    if (!this.terminalTransportFactory) {
      throw new Error('Terminal transport factory not registered in ElectronPlatform');
    }
    return this.terminalTransportFactory();
  }
}
