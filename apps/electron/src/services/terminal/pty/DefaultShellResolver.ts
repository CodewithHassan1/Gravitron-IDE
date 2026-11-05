import { IShellResolver, ShellLaunchConfiguration } from './types';
import * as os from 'os';

export class DefaultShellResolver implements IShellResolver {
  public resolveLocal(): ShellLaunchConfiguration {
    const isWindows = os.platform() === 'win32';

    if (isWindows) {
      return {
        executable: process.env.COMSPEC || 'cmd.exe',
        args: [],
        loginShell: false,
        interactive: true,
      };
    } else {
      // macOS / Linux
      const shell = process.env.SHELL || '/bin/sh';
      return {
        executable: shell,
        args: ['-l'], // login shell by default on Unix
        loginShell: true,
        interactive: true,
      };
    }
  }

  public resolveDocker(containerId: string): ShellLaunchConfiguration {
    return {
      executable: 'docker',
      args: ['exec', '-it', containerId, '/bin/sh'],
      loginShell: false,
      interactive: true,
    };
  }

  public resolveSSH(host: string): ShellLaunchConfiguration {
    return {
      executable: 'ssh',
      args: [host],
      loginShell: true,
      interactive: true,
    };
  }
}
