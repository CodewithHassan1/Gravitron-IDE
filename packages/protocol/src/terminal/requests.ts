import { ExecutionTarget } from '../execution/types';

export interface TerminalProfile {
  id: string;
  name: string;
  executable: string;
  args: string[];
  platform: string;
  isDefault: boolean;
}

export interface TerminalCreateRequestOptions {
  id?: string; // frontend terminal ID
  target?: ExecutionTarget; // defaults to { kind: 'local' }
  cwd?: string; // legacy fallback
  env?: Record<string, string>;
  profileId?: string; // the profile ID to resolve
  executable?: string; // optional override
  args?: string[]; // optional override
  workspaceId?: string; // workspace identity for local terminals
}
