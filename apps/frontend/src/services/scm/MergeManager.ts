import { GitManager } from './GitManager';

export class MergeManager {
  static async merge(workspaceId: string, ref: string) {
    await GitManager.getProvider().merge(workspaceId, ref);
  }
}

export class RemoteManager {
  static async fetch(workspaceId: string, remote?: string) {
    await GitManager.getProvider().fetch(workspaceId, remote);
  }
  static async pull(workspaceId: string, remote?: string, branch?: string) {
    await GitManager.getProvider().pull(workspaceId, remote, branch);
  }
  static async push(workspaceId: string, remote?: string, branch?: string) {
    await GitManager.getProvider().push(workspaceId, remote, branch);
  }
}

export class StashManager {
  static async save(workspaceId: string, message?: string) {
    return await GitManager.getProvider().stash(workspaceId, 'save', message);
  }
  static async pop(workspaceId: string) {
    return await GitManager.getProvider().stash(workspaceId, 'pop');
  }
  static async list(workspaceId: string) {
    return await GitManager.getProvider().stash(workspaceId, 'list');
  }
}
