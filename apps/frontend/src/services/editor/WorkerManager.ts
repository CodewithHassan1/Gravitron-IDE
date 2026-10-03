export class WorkerManagerImpl {
  private initialized = false;
  private workerPromises: Map<string, Promise<any>> = new Map();

  initialize(monaco: any) {
    if (this.initialized) return;

    // Define MonacoEnvironment if it doesn't exist to override worker loading
    if (typeof window !== 'undefined') {
      window.MonacoEnvironment = window.MonacoEnvironment || {};
      
      const originalGetWorkerUrl = window.MonacoEnvironment.getWorkerUrl;
      window.MonacoEnvironment.getWorkerUrl = (moduleId: string, label: string) => {
        // Here we intercept worker creation to ensure they are reused and not needlessly fetched multiple times
        // @monaco-editor/react handles default workers out of the box, but we can hook in for custom languages
        if (originalGetWorkerUrl) {
          return originalGetWorkerUrl(moduleId, label);
        }
        return './editor.worker.bundle.js'; // fallback if needed, but react-monaco handles standard ones
      };
    }
    
    this.initialized = true;
  }

  // Support lazy loading of future custom language workers
  getWorker(label: string, url: string): Promise<any> {
    if (this.workerPromises.has(label)) {
      return this.workerPromises.get(label)!;
    }

    const promise = new Promise((resolve, reject) => {
      try {
        const worker = new Worker(url);
        resolve(worker);
      } catch (err) {
        reject(err);
      }
    });

    this.workerPromises.set(label, promise);
    return promise;
  }

  dispose() {
    // We intentionally don't terminate standard Monaco workers to allow reuse,
    // but custom workers could be terminated here if needed.
    this.workerPromises.clear();
  }
}

export const WorkerManager = new WorkerManagerImpl();
