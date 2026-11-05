import { DisposableRegistry } from './DisposableRegistry';
import { ViewStateManager } from './ViewStateManager';

export class ModelManagerImpl {
  private monacoInstance: any = null;
  private models: Map<string, any> = new Map();

  setMonaco(monaco: any) {
    this.monacoInstance = monaco;
  }

  getModel(
    uriString: string,
    defaultLanguage: string = 'plaintext',
    initialValue: string = ''
  ): any {
    if (!this.monacoInstance) return null;

    let model = this.models.get(uriString);
    if (!model) {
      const uri = this.monacoInstance.Uri.parse(uriString);
      // Check if it already exists in monaco memory
      model = this.monacoInstance.editor.getModel(uri);

      if (!model) {
        model = this.monacoInstance.editor.createModel(initialValue, defaultLanguage, uri);
        DisposableRegistry.register('modelManager', model);
      }
      this.models.set(uriString, model);
    }
    return model;
  }

  /**
   * Disposes a model and its associated view state.
   */
  disposeModel(uriString: string) {
    const model = this.models.get(uriString);
    if (model) {
      DisposableRegistry.unregister('modelManager', model);
      model.dispose();
      this.models.delete(uriString);
      ViewStateManager.clearViewState(uriString);
    }
  }

  /**
   * Garbage collection: removes models that are no longer actively open in any group.
   * Call this when tabs are closed.
   */
  garbageCollect(activeUris: Set<string>) {
    this.models.forEach((model, uriString) => {
      // settings://user is a virtual document, usually kept alive or managed differently, but if not in active, we can dispose.
      if (!activeUris.has(uriString)) {
        this.disposeModel(uriString);
      }
    });
  }

  disposeAll() {
    this.models.forEach((model, uriString) => {
      this.disposeModel(uriString);
    });
    this.models.clear();
    this.monacoInstance = null;
  }
}

export const ModelManager = new ModelManagerImpl();
