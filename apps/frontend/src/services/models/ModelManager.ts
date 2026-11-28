import type {
  DownloadProgressInfo,
  HardwareProfile,
  LocalModelsSnapshot,
  LocalRuntimeStatus,
} from '@ag/protocol';

declare global {
  interface Window {
    agApi?: any;
  }
}

export class ModelManager {
  public isAvailable(): boolean {
    return typeof window !== 'undefined' && Boolean(window.agApi?.models);
  }

  public async getCatalogSnapshot(): Promise<LocalModelsSnapshot> {
    if (!this.isAvailable()) {
      throw new Error('Model manager is only available in Gravitron IDE desktop.');
    }
    return await window.agApi.models.getCatalogSnapshot();
  }

  public async getHardwareProfile(): Promise<HardwareProfile> {
    if (!this.isAvailable()) {
      throw new Error('Hardware detection is only available in Gravitron IDE desktop.');
    }
    return await window.agApi.models.getHardwareProfile();
  }

  public async setStorageDir(storageDir: string): Promise<{ storageDir: string }> {
    return await window.agApi.models.setStorageDir(storageDir);
  }

  public async selectStorageFolder(): Promise<{ storageDir: string } | null> {
    return await window.agApi.models.selectStorageFolder();
  }

  public async installModel(
    modelId: string
  ): Promise<{ started: boolean; alreadyInstalled?: boolean; error?: string }> {
    return await window.agApi.models.installModel(modelId);
  }

  public async pauseDownload(modelId: string): Promise<{ paused: boolean }> {
    return await window.agApi.models.pauseDownload(modelId);
  }

  public async resumeDownload(modelId: string): Promise<{ started: boolean; error?: string }> {
    return await window.agApi.models.resumeDownload(modelId);
  }

  public async cancelDownload(modelId: string): Promise<{ cancelled: boolean }> {
    return await window.agApi.models.cancelDownload(modelId);
  }

  public async removeModel(
    modelId: string
  ): Promise<{ removed: boolean; freedBytes: number; error?: string }> {
    return await window.agApi.models.removeModel(modelId);
  }

  public async verifyModel(modelId: string): Promise<{ valid: boolean; message: string }> {
    return await window.agApi.models.verifyModel(modelId);
  }

  public async selectDefaultModel(modelId: string): Promise<{ defaultModelId: string }> {
    return await window.agApi.models.selectDefaultModel(modelId);
  }

  public async loadModel(modelId: string): Promise<LocalRuntimeStatus> {
    return await window.agApi.models.loadModel(modelId);
  }

  public async unloadModel(): Promise<LocalRuntimeStatus> {
    return await window.agApi.models.unloadModel();
  }

  public async getRuntimeStatus(): Promise<LocalRuntimeStatus> {
    return await window.agApi.models.getRuntimeStatus();
  }

  public async completeSetup(): Promise<{ setupCompleted: boolean }> {
    return await window.agApi.models.completeSetup();
  }

  public subscribeDownloadProgress(cb: (info: DownloadProgressInfo) => void): () => void {
    if (!this.isAvailable()) return () => {};
    const sub = window.agApi.models.onDownloadProgress(cb);
    return () => sub?.dispose?.();
  }

  public subscribeRuntimeStatus(cb: (status: LocalRuntimeStatus) => void): () => void {
    if (!this.isAvailable()) return () => {};
    const sub = window.agApi.models.onRuntimeStatus(cb);
    return () => sub?.dispose?.();
  }
}

export const modelManager = new ModelManager();
