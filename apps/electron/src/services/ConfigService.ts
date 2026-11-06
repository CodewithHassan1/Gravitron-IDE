import { app, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { IService, IIpcService, IpcHandlerRegistration } from './IService';
import { ServiceIds, ServiceId } from './ServiceIds';
import { Channels } from '@ag/protocol';
import { IpcContext } from '../ipc/IpcContext';

export interface GatewayValidationResult {
  valid: boolean;
  normalizedUrl?: string;
  error?: string;
}

export function validateGatewayUrl(input: string, isProduction: boolean): GatewayValidationResult {
  if (!input || typeof input !== 'string' || input.trim().length === 0) {
    return { valid: false, error: 'Gateway URL cannot be empty.' };
  }

  let raw = input.trim();
  if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
    raw = isProduction ? `https://${raw}` : `http://${raw}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return {
      valid: false,
      error: 'Invalid URL format. Please enter a valid URL (e.g. https://gateway.domain.com).',
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: 'Protocol must be HTTP or HTTPS.' };
  }

  // Strip credentials, search parameters, and hashes to prevent leaking sensitive material
  parsed.username = '';
  parsed.password = '';
  parsed.search = '';
  parsed.hash = '';

  const isLocalHost =
    parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';
  const hasValidHostname =
    isLocalHost || parsed.hostname.includes('.') || (!isProduction && Boolean(parsed.port));
  if (!hasValidHostname) {
    return {
      valid: false,
      error:
        'Invalid hostname. Please enter a valid host or domain name (e.g. https://gateway.domain.com).',
    };
  }

  if (isProduction && !isLocalHost && parsed.protocol !== 'https:') {
    return {
      valid: false,
      error:
        'Production Gateway endpoints must use HTTPS. Plain HTTP is only permitted for local development (localhost).',
    };
  }

  const normalized =
    parsed.origin + (parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, ''));
  return { valid: true, normalizedUrl: normalized };
}

export class ConfigService implements IService, IIpcService {
  public readonly id: ServiceId = ServiceIds.Settings;
  public readonly dependencies: readonly ServiceId[] = [];

  private configFilePath: string;

  constructor(customConfigPath?: string) {
    if (customConfigPath) {
      this.configFilePath = customConfigPath;
    } else {
      try {
        const userData = app?.getPath ? app.getPath('userData') : '';
        this.configFilePath = userData ? path.join(userData, 'gateway-config.json') : '';
      } catch {
        this.configFilePath = '';
      }
    }

    this.initializeFromStorage();

    if (ipcMain?.on) {
      try {
        ipcMain.removeAllListeners(Channels.App.GetConfigSync);
        ipcMain.on(Channels.App.GetConfigSync, (event) => {
          event.returnValue = this.getConfig();
        });
      } catch {
        // Safe for non-Electron test harnesses
      }
    }
  }

  private initializeFromStorage(): void {
    const isPackaged = app?.isPackaged ?? false;
    process.env.IS_PACKAGED = isPackaged ? 'true' : 'false';

    // 1. Environment variable preconfiguration has highest priority (e.g. for enterprise MDM or launch scripts)
    const envUrl = process.env.GATEWAY_URL || process.env.NEXT_PUBLIC_GATEWAY_URL;
    if (envUrl && envUrl.trim().length > 0) {
      const validation = validateGatewayUrl(envUrl, isPackaged);
      if (validation.valid && validation.normalizedUrl) {
        process.env.GATEWAY_URL = validation.normalizedUrl;
        return;
      }
    }

    // 2. Read from persistent gateway-config.json in user-data directory
    if (this.configFilePath && fs.existsSync(this.configFilePath)) {
      try {
        const raw = fs.readFileSync(this.configFilePath, 'utf8');
        const data = JSON.parse(raw);
        if (data.gatewayUrl && typeof data.gatewayUrl === 'string') {
          const validation = validateGatewayUrl(data.gatewayUrl, isPackaged);
          if (validation.valid && validation.normalizedUrl) {
            process.env.GATEWAY_URL = validation.normalizedUrl;
            return;
          }
        }
      } catch (err) {
        console.warn('[ConfigService] Failed to parse gateway-config.json:', err);
      }
    }

    // 3. In development mode only, default to http://localhost:8080 if unconfigured
    if (!isPackaged) {
      if (!process.env.GATEWAY_URL) {
        process.env.GATEWAY_URL = 'http://localhost:8080';
      }
    } else {
      // In production mode with no configuration, do NOT set localhost fallback
      if (!process.env.GATEWAY_URL) {
        process.env.GATEWAY_URL = '';
      }
    }
  }

  public getConfig(): { gatewayUrl: string | null; isPackaged: boolean; source: string } {
    const isPackaged = app?.isPackaged ?? false;
    const current = process.env.GATEWAY_URL?.trim();

    let source = 'none';
    if (process.env.NEXT_PUBLIC_GATEWAY_URL) {
      source = 'env';
    } else if (this.configFilePath && fs.existsSync(this.configFilePath)) {
      source = 'file';
    } else if (!isPackaged && current === 'http://localhost:8080') {
      source = 'default_dev';
    } else if (current) {
      source = 'runtime';
    }

    return {
      gatewayUrl: current && current.length > 0 ? current : null,
      isPackaged,
      source,
    };
  }

  public setGatewayUrl(urlInput: string): {
    success: boolean;
    gatewayUrl?: string;
    error?: string;
  } {
    const isPackaged = app?.isPackaged ?? false;
    const validation = validateGatewayUrl(urlInput, isPackaged);

    if (!validation.valid || !validation.normalizedUrl) {
      return { success: false, error: validation.error || 'Invalid URL' };
    }

    const normalized = validation.normalizedUrl;
    process.env.GATEWAY_URL = normalized;

    if (this.configFilePath) {
      try {
        const dir = path.dirname(this.configFilePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        const payload = {
          gatewayUrl: normalized,
          updatedAt: new Date().toISOString(),
        };
        fs.writeFileSync(this.configFilePath, JSON.stringify(payload, null, 2), 'utf8');
      } catch (err: any) {
        console.error('[ConfigService] Failed to persist gateway configuration:', err.message);
        return { success: false, error: 'Failed to write configuration to disk' };
      }
    }

    return { success: true, gatewayUrl: normalized };
  }

  public clearGatewayUrl(): { success: boolean } {
    const isPackaged = app?.isPackaged ?? false;
    process.env.GATEWAY_URL = !isPackaged ? 'http://localhost:8080' : '';

    if (this.configFilePath && fs.existsSync(this.configFilePath)) {
      try {
        fs.unlinkSync(this.configFilePath);
      } catch (err: any) {
        console.warn('[ConfigService] Failed to remove configuration file:', err.message);
      }
    }

    return { success: true };
  }

  public registerHandlers(): IpcHandlerRegistration[] {
    return [
      {
        channel: Channels.App.GetConfigRequest,
        handler: async (_payload: void, _ctx: IpcContext) => {
          return this.getConfig();
        },
      },
      {
        channel: Channels.App.SetGatewayUrlRequest,
        handler: async (payload: { url: string }, _ctx: IpcContext) => {
          if (!payload?.url) {
            throw new Error('URL is required');
          }
          const result = this.setGatewayUrl(payload.url);
          if (!result.success) {
            throw new Error(result.error || 'Failed to update Gateway URL');
          }
          return result;
        },
      },
      {
        channel: Channels.App.ClearGatewayUrlRequest,
        handler: async (_payload: void, _ctx: IpcContext) => {
          return this.clearGatewayUrl();
        },
      },
    ];
  }
}
