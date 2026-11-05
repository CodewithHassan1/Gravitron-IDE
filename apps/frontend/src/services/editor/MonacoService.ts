import { loader } from '@monaco-editor/react';

export class MonacoService {
  private monaco: any = null;
  private isLoaded = false;
  private loadPromise: Promise<any> | null = null;

  async loadMonaco(): Promise<any> {
    if (this.isLoaded && this.monaco) return this.monaco;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = new Promise(async (resolve, reject) => {
      try {
        const monaco = await loader.init();
        this.monaco = monaco;
        this.isLoaded = true;
        this.setupGlobals();
        resolve(monaco);
      } catch (err) {
        reject(err);
      }
    });

    return this.loadPromise;
  }

  getMonaco() {
    if (!this.isLoaded) throw new Error('Monaco is not yet loaded. Call loadMonaco() first.');
    return this.monaco;
  }

  private setupGlobals() {
    if (!this.monaco) return;

    // Setup global semantic highlighting configuration or any global overrides
    // e.g. bracket pair colorization defaults if not handled by editor options
  }
}
