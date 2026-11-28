import { app, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as https from 'https';
import {
  Channels,
  LOCAL_MODEL_CATALOG,
  UNVERIFIED_MODEL_CANDIDATES,
  type DownloadProgressInfo,
  type HardwareProfile,
  type InstalledModelRecord,
  type LocalModelCatalogEntry,
  type LocalModelsSnapshot,
  type LocalModelWithStatus,
  type ModelInstallState,
} from '@ag/protocol';
import type { IService, ILifecycleService, IIpcService, IpcHandlerRegistration } from '../IService';
import { ServiceIds, type ServiceId } from '../ServiceIds';
import { WindowService } from '../WindowService';
import { detectHardwareProfile } from './HardwareDetector';
import { evaluateCatalogRecommendations } from './RecommendationEngine';
import { LocalInferenceManager } from './LocalInferenceManager';

interface PersistedModelsManifest {
  storageDir: string;
  defaultModelId?: string;
  setupCompleted: boolean;
  installed: Record<string, InstalledModelRecord>;
}

interface ActiveDownloadTask {
  modelId: string;
  entry: LocalModelCatalogEntry;
  partPath: string;
  finalPath: string;
  abortController: AbortController;
  bytesDownloaded: number;
  totalBytes: number;
  paused: boolean;
  cancelled: boolean;
}

const TRUSTED_DOWNLOAD_HOST_PATTERNS = [
  /^huggingface\.co$/i,
  /^(?:[a-z0-9-]+\.)+hf\.co$/i,
  /^(?:[a-z0-9-]+\.)+huggingface\.co$/i,
];

function isTrustedDownloadUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    return TRUSTED_DOWNLOAD_HOST_PATTERNS.some((re) => re.test(parsed.hostname));
  } catch {
    return false;
  }
}

async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export class ModelManagerService implements IService, ILifecycleService, IIpcService {
  public readonly id: ServiceId = ServiceIds.Models;
  public readonly dependencies: readonly ServiceId[] = [ServiceIds.Window];

  private readonly manifestPath: string;
  private manifest: PersistedModelsManifest;
  private cachedHardware: HardwareProfile | null = null;
  private activeDownloads = new Map<string, ActiveDownloadTask>();
  private downloadStates = new Map<string, DownloadProgressInfo>();
  private runtimeManager: LocalInferenceManager;
  private unsubscribeRuntime?: () => void;

  constructor(
    private windowService: WindowService,
    runtimeManager?: LocalInferenceManager
  ) {
    const userData = app?.getPath ? app.getPath('userData') : process.cwd();
    this.manifestPath = path.join(userData, 'models-manifest.json');
    const defaultStorageDir = path.join(userData, 'models');
    this.manifest = {
      storageDir: defaultStorageDir,
      setupCompleted: false,
      installed: {},
    };
    this.runtimeManager = runtimeManager || new LocalInferenceManager();
    this.loadManifest();
  }

  public getRuntimeManager(): LocalInferenceManager {
    return this.runtimeManager;
  }

  public async initialize(): Promise<void> {
    this.unsubscribeRuntime = this.runtimeManager.onStatusChanged((status) => {
      this.windowService.broadcast(Channels.Models.OnRuntimeStatus, status);
    });
  }

  public async start(): Promise<void> {
    await this.refreshHardwareProfile().catch(() => {});
  }

  public async stop(): Promise<void> {
    for (const task of this.activeDownloads.values()) {
      task.cancelled = true;
      task.abortController.abort();
    }
    this.activeDownloads.clear();
    await this.runtimeManager.unload();
    this.unsubscribeRuntime?.();
    this.unsubscribeRuntime = undefined;
  }

  public async dispose(): Promise<void> {
    await this.stop();
  }

  public async health(): Promise<boolean> {
    return true;
  }

  private loadManifest(): void {
    if (!fs.existsSync(this.manifestPath)) return;
    try {
      const raw = fs.readFileSync(this.manifestPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedModelsManifest>;
      if (parsed.storageDir && typeof parsed.storageDir === 'string') {
        this.manifest.storageDir = parsed.storageDir;
      }
      if (typeof parsed.setupCompleted === 'boolean') {
        this.manifest.setupCompleted = parsed.setupCompleted;
      }
      if (parsed.defaultModelId && typeof parsed.defaultModelId === 'string') {
        this.manifest.defaultModelId = parsed.defaultModelId;
      }
      if (parsed.installed && typeof parsed.installed === 'object') {
        for (const [id, rec] of Object.entries(parsed.installed)) {
          if (rec?.filePath && fs.existsSync(rec.filePath)) {
            this.manifest.installed[id] = rec;
          }
        }
      }
    } catch {
      // ignore corrupted manifest
    }
  }

  private saveManifest(): void {
    try {
      const dir = path.dirname(this.manifestPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.manifestPath, JSON.stringify(this.manifest, null, 2), 'utf8');
    } catch (err: any) {
      console.warn('[ModelManagerService] Failed to save manifest:', err?.message);
    }
  }

  public async refreshHardwareProfile(): Promise<HardwareProfile> {
    this.cachedHardware = await detectHardwareProfile(this.manifest.storageDir);
    return this.cachedHardware;
  }

  public async getHardwareProfile(): Promise<HardwareProfile> {
    if (!this.cachedHardware || this.cachedHardware.storage.path !== this.manifest.storageDir) {
      return await this.refreshHardwareProfile();
    }
    return this.cachedHardware;
  }

  public getInstalledRecord(modelId: string): InstalledModelRecord | undefined {
    const rec = this.manifest.installed[modelId];
    if (rec && fs.existsSync(rec.filePath)) {
      return rec;
    }
    return undefined;
  }

  public async getCatalogSnapshot(): Promise<LocalModelsSnapshot> {
    const hardware = await this.getHardwareProfile();
    const recommendations = evaluateCatalogRecommendations(LOCAL_MODEL_CATALOG, hardware);
    const recMap = new Map(recommendations.map((r) => [r.modelId, r]));
    const runtimeStatus = this.runtimeManager.getStatus();

    const models: LocalModelWithStatus[] = LOCAL_MODEL_CATALOG.map((entry) => {
      const installedRecord = this.getInstalledRecord(entry.id);
      const progress = this.downloadStates.get(entry.id);
      let installState: ModelInstallState = 'not_installed';
      if (installedRecord) {
        installState = 'installed';
      } else if (progress) {
        installState = progress.state;
      }

      return {
        entry,
        recommendation: recMap.get(entry.id)!,
        installState,
        installedRecord,
        downloadProgress: progress,
        isLoaded: runtimeStatus.status === 'running' && runtimeStatus.loadedModelId === entry.id,
      };
    });

    return {
      hardware,
      storageDir: this.manifest.storageDir,
      defaultModelId: this.manifest.defaultModelId,
      runtime: runtimeStatus,
      models,
      unverifiedCandidates: UNVERIFIED_MODEL_CANDIDATES,
      setupCompleted: this.manifest.setupCompleted,
    };
  }

  private resolveSafeModelPath(filename: string): string {
    const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const resolvedDir = path.resolve(this.manifest.storageDir);
    const resolvedFile = path.resolve(resolvedDir, safeName);
    if (!resolvedFile.startsWith(resolvedDir + path.sep)) {
      throw new Error(`Unsafe model storage path rejected: ${filename}`);
    }
    return resolvedFile;
  }

  private broadcastProgress(info: DownloadProgressInfo): void {
    this.downloadStates.set(info.modelId, info);
    this.windowService.broadcast(Channels.Models.OnDownloadProgress, info);
  }

  public async installModel(modelId: string): Promise<{ started: boolean; alreadyInstalled?: boolean; error?: string }> {
    const entry = LOCAL_MODEL_CATALOG.find((m) => m.id === modelId);
    if (!entry) {
      return { started: false, error: `Unknown local model '${modelId}'.` };
    }
    if (entry.sharded) {
      return {
        started: false,
        error: `${entry.name} requires multi-part sharded server weights and is not supported for single-file desktop download.`,
      };
    }

    const existing = this.getInstalledRecord(modelId);
    if (existing) {
      return { started: false, alreadyInstalled: true };
    }

    const active = this.activeDownloads.get(modelId);
    if (active && !active.paused) {
      return { started: true };
    }

    if (!isTrustedDownloadUrl(entry.downloadUrl)) {
      return { started: false, error: 'Untrusted download origin rejected.' };
    }

    if (!fs.existsSync(this.manifest.storageDir)) {
      fs.mkdirSync(this.manifest.storageDir, { recursive: true });
    }

    const hw = await this.refreshHardwareProfile();
    if (hw.storage.availableBytes > 0 && hw.storage.availableBytes < entry.downloadSizeBytes + 256 * 1024 ** 2) {
      return {
        started: false,
        error: `Insufficient disk space in ${this.manifest.storageDir}. Requires ${(entry.downloadSizeBytes / 1024 ** 3).toFixed(2)} GB.`,
      };
    }

    const finalPath = this.resolveSafeModelPath(entry.ggufFilename);
    const partPath = `${finalPath}.part`;

    // Reuse already valid complete file if present on disk
    if (fs.existsSync(finalPath)) {
      const stat = fs.statSync(finalPath);
      if (stat.size === entry.downloadSizeBytes) {
        if (!entry.sha256 || (await computeFileSha256(finalPath)) === entry.sha256) {
          this.manifest.installed[modelId] = {
            modelId,
            filePath: finalPath,
            fileSizeBytes: stat.size,
            sha256: entry.sha256,
            verifiedAt: Date.now(),
            installedAt: Date.now(),
          };
          if (!this.manifest.defaultModelId) this.manifest.defaultModelId = modelId;
          this.saveManifest();
          this.broadcastProgress({
            modelId,
            state: 'installed',
            bytesDownloaded: stat.size,
            totalBytes: stat.size,
            speedBytesPerSec: 0,
            percent: 100,
          });
          return { started: false, alreadyInstalled: true };
        }
      }
    }

    const initialBytes = fs.existsSync(partPath) ? fs.statSync(partPath).size : 0;
    const abortController = new AbortController();
    const task: ActiveDownloadTask = {
      modelId,
      entry,
      partPath,
      finalPath,
      abortController,
      bytesDownloaded: initialBytes,
      totalBytes: entry.downloadSizeBytes,
      paused: false,
      cancelled: false,
    };
    this.activeDownloads.set(modelId, task);

    void this.runDownloadTask(task);
    return { started: true };
  }

  private async runDownloadTask(task: ActiveDownloadTask): Promise<void> {
    const { modelId, entry, partPath, finalPath, abortController } = task;
    let lastReportAt = 0;
    let windowStartAt = Date.now();
    let windowBytes = 0;

    try {
      this.broadcastProgress({
        modelId,
        state: 'downloading',
        bytesDownloaded: task.bytesDownloaded,
        totalBytes: task.totalBytes,
        speedBytesPerSec: 0,
        percent: Math.min(99, Math.round((task.bytesDownloaded / Math.max(1, task.totalBytes)) * 100)),
      });

      const response = await this.fetchWithTrustedRedirects(entry.downloadUrl, task.bytesDownloaded, abortController.signal);
      if (!response.ok && response.status !== 206) {
        throw new Error(`Download failed with HTTP ${response.status}`);
      }

      const appendMode = response.status === 206 && task.bytesDownloaded > 0;
      if (!appendMode && task.bytesDownloaded > 0) {
        task.bytesDownloaded = 0;
      }

      const writeStream = fs.createWriteStream(partPath, { flags: appendMode ? 'a' : 'w' });
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Download stream body unavailable.');
      }

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (task.paused || task.cancelled) {
            await reader.cancel().catch(() => {});
            break;
          }
          await new Promise<void>((resolve, reject) => {
            writeStream.write(value, (err) => (err ? reject(err) : resolve()));
          });
          task.bytesDownloaded += value.byteLength;
          windowBytes += value.byteLength;

          const now = Date.now();
          if (now - lastReportAt >= 400) {
            const elapsedSec = Math.max(0.2, (now - windowStartAt) / 1000);
            const speed = Math.round(windowBytes / elapsedSec);
            lastReportAt = now;
            if (now - windowStartAt >= 3000) {
              windowStartAt = now;
              windowBytes = 0;
            }
            this.broadcastProgress({
              modelId,
              state: 'downloading',
              bytesDownloaded: task.bytesDownloaded,
              totalBytes: task.totalBytes,
              speedBytesPerSec: speed,
              percent: Math.min(99, Math.round((task.bytesDownloaded / Math.max(1, task.totalBytes)) * 100)),
            });
          }
        }
      } finally {
        await new Promise<void>((resolve) => writeStream.end(resolve));
      }

      if (task.cancelled) {
        try {
          if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
        } catch {
          // ignore cleanup failure
        }
        this.downloadStates.delete(modelId);
        this.windowService.broadcast(Channels.Models.OnDownloadProgress, {
          modelId,
          state: 'not_installed',
          bytesDownloaded: 0,
          totalBytes: task.totalBytes,
          speedBytesPerSec: 0,
          percent: 0,
        } satisfies DownloadProgressInfo);
        return;
      }

      if (task.paused) {
        this.broadcastProgress({
          modelId,
          state: 'paused',
          bytesDownloaded: task.bytesDownloaded,
          totalBytes: task.totalBytes,
          speedBytesPerSec: 0,
          percent: Math.min(99, Math.round((task.bytesDownloaded / Math.max(1, task.totalBytes)) * 100)),
        });
        return;
      }

      this.broadcastProgress({
        modelId,
        state: 'verifying',
        bytesDownloaded: task.bytesDownloaded,
        totalBytes: task.totalBytes,
        speedBytesPerSec: 0,
        percent: 99,
      });

      const actualSize = fs.statSync(partPath).size;
      if (entry.downloadSizeBytes > 0 && actualSize !== entry.downloadSizeBytes) {
        throw new Error(
          `Downloaded size mismatch (expected ${entry.downloadSizeBytes} bytes, got ${actualSize} bytes).`
        );
      }

      if (entry.sha256) {
        const digest = await computeFileSha256(partPath);
        if (digest.toLowerCase() !== entry.sha256.toLowerCase()) {
          throw new Error('SHA-256 integrity verification failed for downloaded model file.');
        }
      }

      fs.renameSync(partPath, finalPath);
      this.manifest.installed[modelId] = {
        modelId,
        filePath: finalPath,
        fileSizeBytes: actualSize,
        sha256: entry.sha256,
        verifiedAt: Date.now(),
        installedAt: Date.now(),
      };
      if (!this.manifest.defaultModelId) {
        this.manifest.defaultModelId = modelId;
      }
      this.saveManifest();

      this.broadcastProgress({
        modelId,
        state: 'installed',
        bytesDownloaded: actualSize,
        totalBytes: actualSize,
        speedBytesPerSec: 0,
        percent: 100,
      });
    } catch (err: any) {
      if (task.paused || task.cancelled) return;
      this.broadcastProgress({
        modelId,
        state: 'error',
        bytesDownloaded: task.bytesDownloaded,
        totalBytes: task.totalBytes,
        speedBytesPerSec: 0,
        percent: Math.min(99, Math.round((task.bytesDownloaded / Math.max(1, task.totalBytes)) * 100)),
        error: err?.message || 'Model download failed.',
      });
    } finally {
      if (!task.paused) {
        this.activeDownloads.delete(modelId);
      }
    }
  }

  private async fetchWithTrustedRedirects(
    url: string,
    offsetBytes: number,
    signal: AbortSignal,
    maxRedirects: number = 6
  ): Promise<Response> {
    let currentUrl = url;
    for (let i = 0; i <= maxRedirects; i++) {
      if (!isTrustedDownloadUrl(currentUrl)) {
        throw new Error(`Blocked redirect to untrusted download host: ${new URL(currentUrl).hostname}`);
      }
      const headers: Record<string, string> = {
        'User-Agent': 'Gravitron-IDE/1.0.0',
      };
      if (offsetBytes > 0) {
        headers['Range'] = `bytes=${offsetBytes}-`;
      }
      const res = await fetch(currentUrl, {
        method: 'GET',
        headers,
        redirect: 'manual',
        signal,
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) throw new Error(`Redirect (${res.status}) missing Location header.`);
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }
      return res;
    }
    throw new Error('Too many HTTP redirects during model download.');
  }

  public pauseDownload(modelId: string): boolean {
    const task = this.activeDownloads.get(modelId);
    if (!task) return false;
    task.paused = true;
    task.abortController.abort();
    return true;
  }

  public async resumeDownload(modelId: string): Promise<{ started: boolean; error?: string }> {
    this.activeDownloads.delete(modelId);
    return await this.installModel(modelId);
  }

  public cancelDownload(modelId: string): boolean {
    const task = this.activeDownloads.get(modelId);
    if (task) {
      task.cancelled = true;
      task.paused = false;
      task.abortController.abort();
      this.activeDownloads.delete(modelId);
    }
    const entry = LOCAL_MODEL_CATALOG.find((m) => m.id === modelId);
    if (entry) {
      const partPath = `${this.resolveSafeModelPath(entry.ggufFilename)}.part`;
      try {
        if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
      } catch {
        // ignore cleanup failure
      }
    }
    this.downloadStates.delete(modelId);
    return true;
  }

  public async removeModel(modelId: string): Promise<{ removed: boolean; freedBytes: number; error?: string }> {
    const runtime = this.runtimeManager.getStatus();
    if (runtime.status === 'running' && runtime.loadedModelId === modelId) {
      return {
        removed: false,
        freedBytes: 0,
        error: 'Cannot remove a model that is currently loaded in the local runtime. Unload it first.',
      };
    }

    const rec = this.manifest.installed[modelId];
    let freedBytes = 0;
    if (rec?.filePath && fs.existsSync(rec.filePath)) {
      freedBytes = fs.statSync(rec.filePath).size;
      fs.unlinkSync(rec.filePath);
    }
    delete this.manifest.installed[modelId];
    if (this.manifest.defaultModelId === modelId) {
      this.manifest.defaultModelId = Object.keys(this.manifest.installed)[0];
    }
    this.downloadStates.delete(modelId);
    this.saveManifest();
    await this.refreshHardwareProfile().catch(() => {});
    return { removed: true, freedBytes };
  }

  public async verifyModel(modelId: string): Promise<{ valid: boolean; message: string }> {
    const entry = LOCAL_MODEL_CATALOG.find((m) => m.id === modelId);
    const rec = this.getInstalledRecord(modelId);
    if (!entry || !rec) {
      return { valid: false, message: 'Model is not installed.' };
    }
    const stat = fs.statSync(rec.filePath);
    if (entry.downloadSizeBytes > 0 && stat.size !== entry.downloadSizeBytes) {
      return { valid: false, message: `File size mismatch (${stat.size} vs ${entry.downloadSizeBytes}).` };
    }
    if (entry.sha256) {
      const digest = await computeFileSha256(rec.filePath);
      if (digest.toLowerCase() !== entry.sha256.toLowerCase()) {
        return { valid: false, message: 'SHA-256 checksum mismatch. Reinstall recommended.' };
      }
    }
    return { valid: true, message: 'Model integrity verified (size & SHA-256 match).' };
  }

  public async loadModel(modelId: string): Promise<any> {
    const entry = LOCAL_MODEL_CATALOG.find((m) => m.id === modelId);
    const rec = this.getInstalledRecord(modelId);
    if (!entry || !rec) {
      throw new Error(`Local model '${modelId}' is not installed.`);
    }
    const ctxSize = Math.min(entry.recommendedContextWindow || 8192, 16384);
    return await this.runtimeManager.loadModel(modelId, rec.filePath, ctxSize);
  }

  public registerHandlers(): IpcHandlerRegistration[] {
    return [
      {
        channel: Channels.Models.GetCatalogSnapshotRequest,
        handler: async () => await this.getCatalogSnapshot(),
      },
      {
        channel: Channels.Models.GetHardwareProfileRequest,
        handler: async () => await this.refreshHardwareProfile(),
      },
      {
        channel: Channels.Models.SetStorageDirRequest,
        handler: async (payload: { storageDir: string }) => {
          if (!payload?.storageDir?.trim()) {
            throw new Error('Storage directory path is required.');
          }
          const resolved = path.resolve(payload.storageDir.trim());
          if (!fs.existsSync(resolved)) {
            fs.mkdirSync(resolved, { recursive: true });
          }
          this.manifest.storageDir = resolved;
          this.saveManifest();
          await this.refreshHardwareProfile();
          return { storageDir: resolved };
        },
      },
      {
        channel: Channels.Models.SelectStorageFolderRequest,
        handler: async () => {
          const result = await dialog.showOpenDialog({
            properties: ['openDirectory', 'createDirectory'],
            defaultPath: this.manifest.storageDir,
          });
          if (result.canceled || result.filePaths.length === 0) return null;
          const selected = result.filePaths[0];
          this.manifest.storageDir = selected;
          this.saveManifest();
          await this.refreshHardwareProfile();
          return { storageDir: selected };
        },
      },
      {
        channel: Channels.Models.InstallModelRequest,
        handler: async (payload: { modelId: string }) => await this.installModel(payload.modelId),
      },
      {
        channel: Channels.Models.PauseDownloadRequest,
        handler: async (payload: { modelId: string }) => ({ paused: this.pauseDownload(payload.modelId) }),
      },
      {
        channel: Channels.Models.ResumeDownloadRequest,
        handler: async (payload: { modelId: string }) => await this.resumeDownload(payload.modelId),
      },
      {
        channel: Channels.Models.CancelDownloadRequest,
        handler: async (payload: { modelId: string }) => ({ cancelled: this.cancelDownload(payload.modelId) }),
      },
      {
        channel: Channels.Models.RemoveModelRequest,
        handler: async (payload: { modelId: string }) => await this.removeModel(payload.modelId),
      },
      {
        channel: Channels.Models.VerifyModelRequest,
        handler: async (payload: { modelId: string }) => await this.verifyModel(payload.modelId),
      },
      {
        channel: Channels.Models.SelectDefaultModelRequest,
        handler: async (payload: { modelId: string }) => {
          this.manifest.defaultModelId = payload.modelId;
          this.saveManifest();
          return { defaultModelId: this.manifest.defaultModelId };
        },
      },
      {
        channel: Channels.Models.LoadModelRequest,
        handler: async (payload: { modelId: string }) => await this.loadModel(payload.modelId),
      },
      {
        channel: Channels.Models.UnloadModelRequest,
        handler: async () => {
          await this.runtimeManager.unload();
          return this.runtimeManager.getStatus();
        },
      },
      {
        channel: Channels.Models.GetRuntimeStatusRequest,
        handler: async () => this.runtimeManager.getStatus(),
      },
      {
        channel: Channels.Models.CompleteSetupRequest,
        handler: async () => {
          this.manifest.setupCompleted = true;
          this.saveManifest();
          return { setupCompleted: true };
        },
      },
    ];
  }
}
