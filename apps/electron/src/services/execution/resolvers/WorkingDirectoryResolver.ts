import { ExecutionRequest, ExecutionProfile } from '@ag/protocol';
import { IWorkingDirectoryResolver } from '../IResolvers';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

export class DefaultWorkingDirectoryResolver implements IWorkingDirectoryResolver {
  private normalizeCandidate(candidate: string): string {
    let clean = candidate;
    if (clean.startsWith('file://')) {
      clean = clean.replace(/^file:\/+(localhost\/)?/i, '');
      try {
        clean = decodeURIComponent(clean);
      } catch { }
    }

    const isWindows = os.platform() === 'win32';
    if (isWindows) {
      if (clean.length >= 3 && clean.charCodeAt(0) === 47) {
        const c1 = clean.charCodeAt(1);
        const c2 = clean.charCodeAt(2);
        if (((c1 >= 65 && c1 <= 90) || (c1 >= 97 && c1 <= 122)) && c2 === 58) {
          clean = clean.substring(1);
        }
      }
      clean = clean.split('/').join('\\');
    }
    return clean;
  }

  public async resolve(request: ExecutionRequest, profile: ExecutionProfile): Promise<string> {
    let resolvedCwd: string | undefined;

      if (request.cwdOverride && request.cwdOverride.trim()) {
        resolvedCwd = this.normalizeCandidate(request.cwdOverride.trim());
      } else if (request.target.kind === 'local' && request.target.cwd && request.target.cwd.trim()) {
        resolvedCwd = this.normalizeCandidate(request.target.cwd.trim());
      }

      if (request.target.kind === 'docker' && request.target.workingDirectory) {
        return request.target.workingDirectory;
      }

      if (resolvedCwd) {
            if (fs.existsSync(resolvedCwd)) {
              const stat = fs.statSync(resolvedCwd);
              if (stat.isDirectory()) {
                return resolvedCwd;
              } else if (stat.isFile()) {
                return path.dirname(resolvedCwd);
              }
            }
            console.warn(
                `[WorkingDirectoryResolver] Provided cwd '${resolvedCwd}' does not exist or is not a directory. Falling back to workspace directory.`
            );
          }

          // Try resolving from workspaceId if it is a directory path
          if (request.workspaceId && request.workspaceId !== 'local-workspace' && request.workspaceId !== 'unknown') {
            const wsPath = this.normalizeCandidate(request.workspaceId.trim());
            if (fs.existsSync(wsPath)) {
              const stat = fs.statSync(wsPath);
              if (stat.isDirectory()) {
                return wsPath;
              } else if (stat.isFile()) {
                return path.dirname(wsPath);
              }
            }
          }

          // Default to homedir or some workspace root ideally provided by workspace service
          const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
          if (home && fs.existsSync(home) && fs.statSync(home).isDirectory()) {
            return home;
          }

          const isWindows = os.platform() === 'win32';
          return isWindows ? (process.env.SystemDrive || 'C:') + '\\' : '/';
        }
      }
