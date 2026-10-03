export class ViewStateManagerImpl {
  // Use WeakMap if keys are objects, but since we use string URIs, we use a standard Map
  // To avoid memory leaks, we can clear state for completely closed files.
  private viewStates: Map<string, any> = new Map();

  saveViewState(uri: string, editorInstance: any) {
    if (!editorInstance) return;
    const state = editorInstance.saveViewState();
    if (state) {
      this.viewStates.set(uri, state);
    }
  }

  restoreViewState(uri: string, editorInstance: any) {
    if (!editorInstance) return;
    const state = this.viewStates.get(uri);
    if (state) {
      editorInstance.restoreViewState(state);
    }
  }

  clearViewState(uri: string) {
    this.viewStates.delete(uri);
  }

  dispose() {
    this.viewStates.clear();
  }
}

export const ViewStateManager = new ViewStateManagerImpl();
