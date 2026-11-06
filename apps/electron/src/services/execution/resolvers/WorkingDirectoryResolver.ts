import { ExecutionRequest, ExecutionProfile } from '@ag/protocol';
import { IWorkingDirectoryResolver } from '../IResolvers';
import * as os from 'os';
import * as fs from 'fs';

export class DefaultWorkingDirectoryResolver implements IWorkingDirectoryResolver {
  public async resolve(request: ExecutionRequest, profile: ExecutionProfile): Promise<string> {
    let resolvedCwd: string | undefined;

    if (request.cwdOverride) {
      resolvedCwd = request.cwdOverride;
    } else if (request.target.kind === 'local' && request.target.cwd) {
      resolvedCwd = request.target.cwd;
    }

    if (request.target.kind === 'docker' && request.target.workingDirectory) {
      return request.target.workingDirectory;
    }

    if (resolvedCwd) {
      const isWindows = os.platform() === 'win32';
      if (isWindows && resolvedCwd.length >= 3 && resolvedCwd.charCodeAt(0) === 47) {
        const c1 = resolvedCwd.charCodeAt(1);
        const c2 = resolvedCwd.charCodeAt(2);
        if (((c1 >= 65 && c1 <= 90) || (c1 >= 97 && c1 <= 122)) && c2 === 58) {
          resolvedCwd = resolvedCwd.substring(1).split('/').join('\\');
        }
      }

      if (fs.existsSync(resolvedCwd) && fs.statSync(resolvedCwd).isDirectory()) {
        return resolvedCwd;
      }
      console.warn(
        `[WorkingDirectoryResolver] Provided cwd '${resolvedCwd}' does not exist or is not a directory. Resolution failed.`
      );
      throw new Error(
        `Invalid working directory: '${resolvedCwd}'. Directory does not exist or is invalid.`
      );
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
