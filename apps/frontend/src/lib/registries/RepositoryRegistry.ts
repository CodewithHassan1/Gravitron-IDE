import { IWorkspaceRoot } from '../../platform/repository/WorkspaceProvider';

export class RepositoryRegistry {
  private static activeRepositories = new Map<string, IWorkspaceRoot>();

  static register(root: IWorkspaceRoot) {
    this.activeRepositories.set(root.id, root);
  }

  static unregister(id: string) {
    this.activeRepositories.delete(id);
  }

  static get(id: string): IWorkspaceRoot | undefined {
    return this.activeRepositories.get(id);
  }

  static getAll(): IWorkspaceRoot[] {
    return Array.from(this.activeRepositories.values());
  }

  static clear() {
    this.activeRepositories.clear();
  }
}
