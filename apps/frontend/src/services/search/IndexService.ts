export interface IndexItem {
  id: string;
  type:
    | 'file'
    | 'folder'
    | 'symbol'
    | 'command'
    | 'recent_file'
    | 'recent_command'
    | 'workspace'
    | 'git_branch'
    | 'task'
    | 'breakpoint'
    | 'bookmark'
    | 'diagnostic'
    | 'reference';
  title: string;
  description?: string;
  path?: string;
  icon?: string;
  metadata?: any;
}

export class IndexServiceImpl {
  private index: Map<string, IndexItem> = new Map();

  buildIndex(items: IndexItem[]) {
    items.forEach((item) => this.index.set(item.id, item));
  }

  updateIndex(item: IndexItem) {
    this.index.set(item.id, item);
  }

  removeFile(id: string) {
    this.index.delete(id);
  }

  getAllItems(): IndexItem[] {
    return Array.from(this.index.values());
  }

  clear() {
    this.index.clear();
  }
}

export const IndexService = new IndexServiceImpl();
