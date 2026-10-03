export class DecorationManagerImpl {
  private monacoInstance: any = null;
  // Map of editorId -> channel -> decorationsCollection
  private editorDecorations: Map<string, Map<string, any>> = new Map();

  setMonaco(monaco: any) {
    this.monacoInstance = monaco;
  }

  setDecorations(editorInstance: any, channel: string, decorations: any[]) {
    if (!this.monacoInstance || !editorInstance) return;
    
    const editorId = editorInstance.getId();
    
    if (!this.editorDecorations.has(editorId)) {
      this.editorDecorations.set(editorId, new Map());
    }
    
    const channelMap = this.editorDecorations.get(editorId)!;
    let collection = channelMap.get(channel);
    
    if (!collection) {
      // Initialize collection
      collection = editorInstance.createDecorationsCollection(decorations);
      channelMap.set(channel, collection);
    } else {
      // Update existing collection
      collection.set(decorations);
    }
  }

  clearDecorations(editorInstance: any, channel?: string) {
    if (!editorInstance) return;
    const editorId = editorInstance.getId();
    const channelMap = this.editorDecorations.get(editorId);
    
    if (!channelMap) return;
    
    if (channel) {
      const collection = channelMap.get(channel);
      if (collection) {
        collection.clear();
      }
    } else {
      channelMap.forEach(collection => collection.clear());
    }
  }

  disposeEditor(editorId: string) {
    const channelMap = this.editorDecorations.get(editorId);
    if (channelMap) {
      channelMap.forEach(collection => collection.clear());
      this.editorDecorations.delete(editorId);
    }
  }
  
  dispose() {
    this.editorDecorations.forEach((channelMap) => {
      channelMap.forEach(collection => collection.clear());
    });
    this.editorDecorations.clear();
    this.monacoInstance = null;
  }
}

export const DecorationManager = new DecorationManagerImpl();
