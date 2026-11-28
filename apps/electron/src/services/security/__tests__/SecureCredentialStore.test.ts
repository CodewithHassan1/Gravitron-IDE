import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SecureCredentialStore } from '../SecureCredentialStore';

describe('SecureCredentialStore', () => {
  let tmpDir: string;
  let customConfigPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secure-cred-test-'));
    customConfigPath = path.join(tmpDir, 'ai-credentials.json');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  it('initializes with default supported providers and no configured keys', () => {
    const store = new SecureCredentialStore(customConfigPath);
    const config = store.getProviderConfig();

    expect(config.activeProvider).toBe('gemini');
    expect(config.providers.length).toBe(3);

    const anthropic = config.providers.find((p) => p.type === 'anthropic');
    expect(anthropic).toBeDefined();
    expect(anthropic?.isConfigured).toBe(false);
    expect(anthropic?.defaultModel).toBe('claude-3-5-sonnet-20241022');

    const gemini = config.providers.find((p) => p.type === 'gemini');
    expect(gemini).toBeDefined();
    expect(gemini?.isConfigured).toBe(false);
  });

  it('securely stores, persists, and retrieves API keys without leaking in getProviderConfig', () => {
    const store1 = new SecureCredentialStore(customConfigPath);

    const setResult = store1.setProviderConfig({
      providerType: 'openai',
      apiKey: 'sk-test-secret-key-12345',
      model: 'gpt-4o-mini',
    });

    expect(setResult.success).toBe(true);
    expect(setResult.isConfigured).toBe(true);

    // API key should be retrievable internally for worker execution
    expect(store1.getApiKey('openai')).toBe('sk-test-secret-key-12345');
    expect(store1.getModel('openai')).toBe('gpt-4o-mini');
    expect(store1.getActiveProvider()).toBe('openai');

    // Public renderer config MUST NOT leak the raw API key
    const config = store1.getProviderConfig();
    expect(config.activeProvider).toBe('openai');
    const openai = config.providers.find((p) => p.type === 'openai');
    expect(openai?.isConfigured).toBe(true);
    expect((openai as any).apiKey).toBeUndefined();
    expect(JSON.stringify(config)).not.toContain('sk-test-secret-key-12345');

    // Reload in a fresh store instance from disk
    const store2 = new SecureCredentialStore(customConfigPath);
    expect(store2.getActiveProvider()).toBe('openai');
    expect(store2.getApiKey('openai')).toBe('sk-test-secret-key-12345');
    expect(store2.getModel('openai')).toBe('gpt-4o-mini');
  });

  it('falls back to environment variables when no key is explicitly stored in file', () => {
    process.env.GEMINI_API_KEY = 'gemini-env-secret-key';
    const store = new SecureCredentialStore(customConfigPath);

    const config = store.getProviderConfig();
    const gemini = config.providers.find((p) => p.type === 'gemini');
    expect(gemini?.isConfigured).toBe(true);
    expect(store.getApiKey('gemini')).toBe('gemini-env-secret-key');
  });

  it('handles clearing of API keys by setting empty string', () => {
    const store = new SecureCredentialStore(customConfigPath);
    store.setProviderConfig({
      providerType: 'anthropic',
      apiKey: 'sk-ant-test-key',
    });
    expect(store.getApiKey('anthropic')).toBe('sk-ant-test-key');

    store.setProviderConfig({
      providerType: 'anthropic',
      apiKey: '',
    });
    expect(store.getApiKey('anthropic')).toBeUndefined();
    expect(store.getProviderConfig().providers.find((p) => p.type === 'anthropic')?.isConfigured).toBe(
      false
    );
  });

  it('fails closed in production when safeStorage encryption is unavailable and never persists plaintext secrets', () => {
    const prevProd = process.env.IS_PACKAGED;
    try {
      process.env.IS_PACKAGED = 'true';
      const store = new SecureCredentialStore(customConfigPath);
      expect(() =>
        (store as any).encryptString('sk-should-fail-in-prod-without-safeStorage')
      ).toThrow('Electron safeStorage');
      expect(fs.existsSync(customConfigPath)).toBe(false);
    } finally {
      if (prevProd !== undefined) process.env.IS_PACKAGED = prevProd;
      else delete process.env.IS_PACKAGED;
    }
  });
});
