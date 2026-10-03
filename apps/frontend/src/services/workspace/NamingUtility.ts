import { WorkspaceManager } from './WorkspaceManager';
import { useEditorLayoutStore } from '../../stores/ide/editorLayoutStore';

export class NamingUtility {
  /**
   * Generates a unique "Untitled-X" name.
   */
  static generateUntitledName(): string {
    const layoutStore = useEditorLayoutStore.getState();
    const existingTitles = new Set<string>();

    // Collect open tabs
    layoutStore.groups.forEach(g => {
      g.tabs.forEach(t => {
        existingTitles.add(t.title);
      });
    });

    // Collect workspace root files just in case
    const root = WorkspaceManager.getRoot();
    if (root) {
      const rootNodes = WorkspaceManager.getChildren(root.id);
      rootNodes.forEach(node => {
        existingTitles.add(node.name);
      });
    }

    let index = 1;
    while (true) {
      const candidate = `Untitled-${index}`;
      if (!existingTitles.has(candidate) && !existingTitles.has(candidate + '.txt')) {
        return candidate;
      }
      index++;
    }
  }
}
