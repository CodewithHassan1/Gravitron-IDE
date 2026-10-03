export interface EditorExtension {
  id: string;
  name: string;
  activate: (registry: any) => void;
  deactivate?: () => void;
}

class EditorRegistryImpl {
  private extensions: Map<string, EditorExtension> = new Map();

  register(extension: EditorExtension) {
    if (this.extensions.has(extension.id)) {
      console.warn(`Extension ${extension.id} is already registered.`);
      return;
    }
    this.extensions.set(extension.id, extension);
    // Activation logic will be handled by EditorManager / Service Registry
  }

  getExtension(id: string) {
    return this.extensions.get(id);
  }

  getAll() {
    return Array.from(this.extensions.values());
  }
}

export const EditorRegistry = new EditorRegistryImpl();
