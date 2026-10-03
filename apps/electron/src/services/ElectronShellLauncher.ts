import { IExternalLauncher } from './IExternalLinkService';
import { shell } from 'electron';

export class ElectronShellLauncher implements IExternalLauncher {
  public async openExternal(url: string): Promise<void> {
    await shell.openExternal(url);
  }
}
