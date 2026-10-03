import { ExecutionRequest, ExecutionProfile, ShellDescriptor, TerminalProtocol } from '@ag/protocol';
import { IShellResolver } from '../IResolvers';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

function findExecutable(name: string): string | null {
  try {
    const isWindows = os.platform() === 'win32';
    const cmd = isWindows ? `where ${name}` : `which ${name}`;
    const output = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' }).trim();
    if (output) {
      const firstPath = output.split(/\r?\n/)[0].trim();
      if (fs.existsSync(firstPath)) return firstPath;
    }
  } catch (e) {
    // not found
  }
  return null;
}

export class DefaultShellResolver implements IShellResolver {
  private cachedProfiles: TerminalProtocol.TerminalProfile[] | null = null;

  public async discoverProfiles(): Promise<TerminalProtocol.TerminalProfile[]> {
    if (this.cachedProfiles) {
      return this.cachedProfiles;
    }

    const profiles: TerminalProtocol.TerminalProfile[] = [];
    const platform = os.platform();

    if (platform === 'win32') {
      // 1. Windows PowerShell
      const sysroot = process.env.SystemRoot || 'C:\\Windows';
      const powershellPath = findExecutable('powershell.exe') || path.join(sysroot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      if (fs.existsSync(powershellPath)) {
        profiles.push({
          id: 'powershell',
          name: 'PowerShell',
          executable: powershellPath,
          args: [],
          platform,
          isDefault: true
        });
      }

      // 2. PowerShell 7 (pwsh)
      let pwshPath = findExecutable('pwsh.exe');
      if (!pwshPath) {
        const pwshPaths = [
          path.join(process.env.ProgramW6432 || 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe'),
          path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'PowerShell', '7', 'pwsh.exe'),
          path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'pwsh.exe')
        ];
        for (const p of pwshPaths) {
          if (p && fs.existsSync(p)) {
            pwshPath = p;
            break;
          }
        }
      }
      if (pwshPath) {
        profiles.push({
          id: 'pwsh',
          name: 'PowerShell 7',
          executable: pwshPath,
          args: [],
          platform,
          isDefault: false
        });
      }

      // 3. Command Prompt
      const cmdPath = findExecutable('cmd.exe') || path.join(sysroot, 'System32', 'cmd.exe');
      if (fs.existsSync(cmdPath)) {
        profiles.push({
          id: 'cmd',
          name: 'Command Prompt',
          executable: cmdPath,
          args: [],
          platform,
          isDefault: profiles.length === 0
        });
      }

      // 4. Git Bash
      let gitBashPath = findExecutable('bash.exe');
      if (!gitBashPath || !gitBashPath.toLowerCase().includes('git')) {
        const gitBashPaths = [
          path.join(process.env.ProgramW6432 || 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
          path.join(process.env.ProgramW6432 || 'C:\\Program Files', 'Git', 'usr', 'bin', 'bash.exe'),
          path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Git', 'bin', 'bash.exe'),
          path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe')
        ];
        for (const p of gitBashPaths) {
          if (p && fs.existsSync(p)) {
            gitBashPath = p;
            break;
          }
        }
      }
      if (gitBashPath) {
        profiles.push({
          id: 'git-bash',
          name: 'Git Bash',
          executable: gitBashPath,
          args: ['-l'],
          platform,
          isDefault: false
        });
      }
    } else {
      // Unix/macOS
      const unixShellNames = [
        { id: 'bash', name: 'Bash', cmd: 'bash' },
        { id: 'zsh', name: 'Zsh', cmd: 'zsh' },
        { id: 'sh', name: 'sh', cmd: 'sh' },
        { id: 'fish', name: 'Fish', cmd: 'fish' }
      ];
      
      let hasDefault = false;
      const userShell = process.env.SHELL;

      for (const shell of unixShellNames) {
        const executable = findExecutable(shell.cmd) || `/bin/${shell.cmd}`;
        if (fs.existsSync(executable)) {
          const isUserShell = userShell === executable;
          if (isUserShell) hasDefault = true;
          
          profiles.push({
            id: shell.id,
            name: shell.name,
            executable,
            args: ['-l'],
            platform,
            isDefault: isUserShell
          });
        }
      }
      
      // If none marked default, mark the first one
      if (!hasDefault && profiles.length > 0) {
        profiles[0].isDefault = true;
      }
    }

    this.cachedProfiles = profiles;
    return profiles;
  }

  public async resolve(request: ExecutionRequest, profile: ExecutionProfile): Promise<ShellDescriptor> {
    if (request.shellOverride) {
      return request.shellOverride;
    }

    const profiles = await this.discoverProfiles();

    if (request.profileId) {
      const selected = profiles.find(p => p.id === request.profileId);
      if (selected) {
        return { executable: selected.executable, args: selected.args };
      }
    }

    if (profile.shell) {
      return profile.shell;
    }

    if (request.target.kind === 'docker') {
      return { executable: request.target.execCommand || 'sh', args: [] };
    }

    const defaultProfile = profiles.find(p => p.isDefault) || profiles[0];
    if (defaultProfile) {
      return { executable: defaultProfile.executable, args: defaultProfile.args };
    }

    // Fallback if absolutely nothing discovered
    const isWindows = os.platform() === 'win32';
    if (isWindows) {
      return { executable: 'cmd.exe', args: [] };
    } else {
      return { executable: 'sh', args: ['-l'] };
    }
  }
}
