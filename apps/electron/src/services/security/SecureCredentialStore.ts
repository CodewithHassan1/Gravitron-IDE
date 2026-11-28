import { safeStorage, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { AgentProtocol } from '@ag/protocol';
import { ProviderFactory } from '@ag/ai-providers';

export type CloudProviderType = 'anthropic' | 'openai' | 'gemini';

export const SUPPORTED_PROVIDERS: Record<
  CloudProviderType,
  {
    name: string;
    defaultModel: string;
    supportedModels: string[];
    envVar: string;
  }
> = {
  anthropic: {
    name: 'Anthropic Claude',
    defaultModel: 'claude-3-5-sonnet-20241022',
    supportedModels: [
      'claude-3-5-sonnet-20241022',
      'claude-3-7-sonnet-20250219',
      'claude-3-5-haiku-20241022',
    ],
    envVar: 'ANTHROPIC_API_KEY',
  },
  openai: {
    name: 'OpenAI',
    defaultModel: 'gpt-4o',
    supportedModels: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini'],
    envVar: 'OPENAI_API_KEY',
  },
  gemini: {
    name: 'Google Gemini',
    defaultModel: 'gemini-3.5-flash',
    supportedModels: [
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
      'gemini-3.1-pro-preview',
    ],
    envVar: 'GEMINI_API_KEY',
  },
};

interface StoredConfigFile {
  activeProvider?: AgentProtocol.SupportedProviderType;
  providers?: Partial<
    Record<
      AgentProtocol.SupportedProviderType,
      {
        model?: string;
        baseURL?: string;
        encryptedKey?: string; // base64
        fallbackEncryptedKey?: string; // base64 fallback when safeStorage is unavailable
      }
    >
  >;
}

export class SecureCredentialStore {
  private configFilePath: string;
  private inMemoryKeys = new Map<AgentProtocol.SupportedProviderType, string>();
  private activeProvider: AgentProtocol.SupportedProviderType = 'gemini';
  private providerModels = new Map<AgentProtocol.SupportedProviderType, string>();
  private providerBaseUrls = new Map<AgentProtocol.SupportedProviderType, string>();
  private pendingEncryptedReload = false;

  constructor(customPath?: string) {
    if (customPath) {
      this.configFilePath = customPath;
    } else {
      try {
        const userData = app?.getPath ? app.getPath('userData') : '';
        this.configFilePath = userData ? path.join(userData, 'ai-credentials.json') : '';
      } catch {
        this.configFilePath = '';
      }
    }

    this.loadFromDisk();
  }

  public ensureLoaded(): void {
    if (!this.pendingEncryptedReload) return;
    if (app?.isReady && !app.isReady()) return;
    if (safeStorage?.isEncryptionAvailable && !safeStorage.isEncryptionAvailable()) return;
    this.loadFromDisk();
  }

  private isProduction(): boolean {
    return Boolean(
      (app && app.isPackaged) ||
      process.env.NODE_ENV === 'production' ||
      process.env.IS_PACKAGED === 'true'
    );
  }

  private getFallbackKey(): Buffer {
    if (this.isProduction()) {
      throw new Error(
        'SecureCredentialStore: Electron safeStorage is unavailable in production. Refusing fallback encryption.'
      );
    }
    const explicitDevKey = process.env.GRAVITRON_DEV_CREDENTIAL_KEY;
    if (explicitDevKey && explicitDevKey.trim().length > 0) {
      return crypto.createHash('sha256').update(explicitDevKey).digest();
    }
    const seed = this.configFilePath || 'gravitron-dev-fallback-seed';
    return crypto.createHash('sha256').update(seed).digest();
  }

  private encryptString(plainText: string): { ciphertext: string; isSafeStorage: boolean } {
    if (safeStorage?.isEncryptionAvailable && safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(plainText);
      return { ciphertext: encrypted.toString('base64'), isSafeStorage: true };
    }

    if (this.isProduction()) {
      throw new Error(
        'Secure storage (Electron safeStorage) is unavailable on this system. Refusing to store credentials in production.'
      );
    }

    // Fallback AES-256-GCM ONLY for test runners or dev environments where safeStorage is unavailable
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.getFallbackKey(), iv);
    let encrypted = cipher.update(plainText, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();
    const payload = JSON.stringify({
      iv: iv.toString('base64'),
      tag: authTag.toString('base64'),
      data: encrypted,
    });
    return { ciphertext: Buffer.from(payload).toString('base64'), isSafeStorage: false };
  }

  private decryptString(ciphertext: string, isSafeStorage: boolean): string | null {
    try {
      if (isSafeStorage && safeStorage?.decryptString) {
        const buffer = Buffer.from(ciphertext, 'base64');
        return safeStorage.decryptString(buffer);
      }

      const raw = Buffer.from(ciphertext, 'base64').toString('utf8');
      const { iv, tag, data } = JSON.parse(raw);
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        this.getFallbackKey(),
        Buffer.from(iv, 'base64')
      );
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      let decrypted = decipher.update(data, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch {
      return null;
    }
  }

  private loadFromDisk(): void {
    if (!this.configFilePath || !fs.existsSync(this.configFilePath)) return;
    this.pendingEncryptedReload = false;

    try {
      const raw = fs.readFileSync(this.configFilePath, 'utf8');
      const config: StoredConfigFile = JSON.parse(raw);

      if (config.activeProvider && config.activeProvider in SUPPORTED_PROVIDERS) {
        this.activeProvider = config.activeProvider;
      }

      if (config.providers) {
        for (const [key, data] of Object.entries(config.providers)) {
          const p = key as AgentProtocol.SupportedProviderType;
          if (data?.model) {
            this.providerModels.set(p, data.model);
          }
          if (data?.baseURL) {
            this.providerBaseUrls.set(p, data.baseURL);
          }
          if (data?.encryptedKey) {
            const appNotReady = Boolean(app?.isReady && !app.isReady());
            const safeStorageReady = Boolean(
              safeStorage?.isEncryptionAvailable && safeStorage.isEncryptionAvailable()
            );
            if (appNotReady || !safeStorageReady) {
              // Chromium OSCrypt / DPAPI initializes at app.whenReady(); defer decryption until ready
              this.pendingEncryptedReload = true;
            } else {
              const decrypted = this.decryptString(data.encryptedKey, true);
              if (decrypted) this.inMemoryKeys.set(p, decrypted);
            }
          } else if (data?.fallbackEncryptedKey) {
            const decrypted = this.decryptString(data.fallbackEncryptedKey, false);
            if (decrypted) this.inMemoryKeys.set(p, decrypted);
          }
        }
      }
    } catch (err: any) {
      console.warn('[SecureCredentialStore] Failed to load configuration from disk:', err.message);
    }
  }

  private saveToDisk(): void {
    if (!this.configFilePath) return;

    try {
      const dir = path.dirname(this.configFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const providersData: StoredConfigFile['providers'] = {};
      for (const key of Object.keys(SUPPORTED_PROVIDERS) as AgentProtocol.SupportedProviderType[]) {
        const keyVal = this.inMemoryKeys.get(key);
        const modelVal = this.providerModels.get(key);
        const baseUrlVal = this.providerBaseUrls.get(key);

        if (keyVal || modelVal || baseUrlVal) {
          providersData[key] = {
            model: modelVal,
            baseURL: baseUrlVal,
          };
          if (keyVal) {
            const { ciphertext, isSafeStorage } = this.encryptString(keyVal);
            if (isSafeStorage) {
              providersData[key]!.encryptedKey = ciphertext;
            } else {
              providersData[key]!.fallbackEncryptedKey = ciphertext;
            }
          }
        }
      }

      const payload: StoredConfigFile = {
        activeProvider: this.activeProvider,
        providers: providersData,
      };

      fs.writeFileSync(this.configFilePath, JSON.stringify(payload, null, 2), {
        encoding: 'utf8',
        mode: 0o600, // Restricted file permissions
      });
    } catch (err: any) {
      console.error('[SecureCredentialStore] Failed to persist credentials to disk:', err.message);
    }
  }

  public getApiKey(providerType: AgentProtocol.SupportedProviderType): string | undefined {
    if (providerType === 'local') return undefined;
    this.ensureLoaded();
    // 1. In-memory / decrypted secure store
    const stored = this.inMemoryKeys.get(providerType);
    if (stored && stored.trim().length > 0) {
      return stored.trim();
    }

    // 2. Fallback to process.env (e.g. ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY)
    const envVar = SUPPORTED_PROVIDERS[providerType as CloudProviderType]?.envVar;
    if (envVar && process.env[envVar]) {
      return process.env[envVar]!.trim();
    }

    return undefined;
  }

  public getModel(providerType: AgentProtocol.SupportedProviderType): string {
    this.ensureLoaded();
    if (providerType === 'local') {
      return this.providerModels.get('local') || 'qwen3-4b-instruct-2507';
    }
    return (
      this.providerModels.get(providerType) ||
      SUPPORTED_PROVIDERS[providerType as CloudProviderType]?.defaultModel ||
      'claude-3-5-sonnet-20241022'
    );
  }

  public getBaseURL(providerType: AgentProtocol.SupportedProviderType): string | undefined {
    this.ensureLoaded();
    return this.providerBaseUrls.get(providerType);
  }

  public getActiveProvider(): AgentProtocol.SupportedProviderType {
    this.ensureLoaded();
    return this.activeProvider;
  }

  public getProviderConfig(): AgentProtocol.GetProviderConfigResponsePayload {
    this.ensureLoaded();
    const providers: AgentProtocol.ProviderInfo[] = (
      Object.keys(SUPPORTED_PROVIDERS) as CloudProviderType[]
    ).map((type) => {
      const def = SUPPORTED_PROVIDERS[type];
      const hasKey = Boolean(this.getApiKey(type));
      return {
        type,
        name: def.name,
        defaultModel: def.defaultModel,
        supportedModels: def.supportedModels,
        isConfigured: hasKey,
      };
    });

    return {
      providers,
      activeProvider: this.activeProvider,
      activeModel: this.getModel(this.activeProvider),
    };
  }

  public setProviderConfig(
    payload: AgentProtocol.SetProviderConfigRequestPayload
  ): { success: boolean; isConfigured: boolean; error?: string } {
    this.ensureLoaded();
    const { providerType, apiKey, model, baseURL } = payload;
    if (!providerType || !(providerType in SUPPORTED_PROVIDERS)) {
      return { success: false, isConfigured: false, error: `Invalid provider type: ${providerType}` };
    }

    this.activeProvider = providerType;

    if (model) {
      this.providerModels.set(providerType, model);
    }

    if (baseURL !== undefined) {
      if (baseURL.trim().length > 0) {
        this.providerBaseUrls.set(providerType, baseURL.trim());
      } else {
        this.providerBaseUrls.delete(providerType);
      }
    }

    if (apiKey !== undefined) {
      const cleanKey = apiKey.trim();
      if (cleanKey.length > 0) {
        this.inMemoryKeys.set(providerType, cleanKey);
      } else {
        this.inMemoryKeys.delete(providerType);
      }
    }

    this.saveToDisk();

    return {
      success: true,
      isConfigured: Boolean(this.getApiKey(providerType)),
    };
  }

  public async testProviderConnection(
    payload: AgentProtocol.TestProviderConfigRequestPayload
  ): Promise<AgentProtocol.TestProviderConfigResponsePayload> {
    const { providerType, apiKey, model, baseURL } = payload;
    const keyToUse = (apiKey && apiKey.trim()) || this.getApiKey(providerType);
    const modelToUse = model || this.getModel(providerType);
    const baseUrlToUse = (baseURL && baseURL.trim()) || this.getBaseURL(providerType);

    if (!keyToUse) {
      return {
        success: false,
        providerType,
        model: modelToUse,
        latencyMs: 0,
        error: `No API key provided or configured for ${providerType}.`,
      };
    }

    const startTime = Date.now();
    try {
      const provider = ProviderFactory.createProvider(providerType, {
        apiKey: keyToUse,
        baseURL: baseUrlToUse,
        timeoutMs: 15000,
        maxRetries: 1,
      });

      const response = await provider.completeChat({
        model: modelToUse,
        messages: [{ role: 'user', content: 'Ping' }],
        maxTokens: 5,
        temperature: 0,
      });

      const latencyMs = Date.now() - startTime;
      const snippet = response.content ? response.content.trim().slice(0, 80) : 'OK';
      return {
        success: true,
        providerType,
        model: modelToUse,
        latencyMs,
        message: `Connection verified (${latencyMs}ms). Model response: ${snippet}`,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      return {
        success: false,
        providerType,
        model: modelToUse,
        latencyMs,
        error: err.message || `Connection to ${providerType} failed.`,
      };
    }
  }
}
