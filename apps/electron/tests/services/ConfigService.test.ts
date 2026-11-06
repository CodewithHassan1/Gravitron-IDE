import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConfigService, validateGatewayUrl } from '../../src/services/ConfigService';
import { Channels } from '@ag/protocol';

describe('ConfigService and Electron Gateway Configuration', () => {
  const originalGatewayUrl = process.env.GATEWAY_URL;
  const originalNextPublic = process.env.NEXT_PUBLIC_GATEWAY_URL;
  let tempDir: string;
  let tempConfigFile: string;

  beforeEach(() => {
    delete process.env.GATEWAY_URL;
    delete process.env.NEXT_PUBLIC_GATEWAY_URL;
    delete process.env.IS_PACKAGED;

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-config-test-'));
    tempConfigFile = path.join(tempDir, 'gateway-config.json');
  });

  afterEach(() => {
    if (originalGatewayUrl) process.env.GATEWAY_URL = originalGatewayUrl;
    else delete process.env.GATEWAY_URL;

    if (originalNextPublic) process.env.NEXT_PUBLIC_GATEWAY_URL = originalNextPublic;
    else delete process.env.NEXT_PUBLIC_GATEWAY_URL;

    try {
      if (fs.existsSync(tempConfigFile)) fs.unlinkSync(tempConfigFile);
      if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
    } catch {
      // ignore cleanup errors
    }
    vi.restoreAllMocks();
  });

  describe('validateGatewayUrl', () => {
    it('accepts HTTPS URLs in production mode', () => {
      const res = validateGatewayUrl('https://api.hosted-backend.com:8443', true);
      expect(res.valid).toBe(true);
      expect(res.normalizedUrl).toBe('https://api.hosted-backend.com:8443');
    });

    it('rejects plain HTTP endpoints for non-local addresses in production', () => {
      const res = validateGatewayUrl('http://api.hosted-backend.com:8080', true);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Production Gateway endpoints must use HTTPS');
    });

    it('permits HTTP for localhost in production mode', () => {
      const res = validateGatewayUrl('http://localhost:8080', true);
      expect(res.valid).toBe(true);
      expect(res.normalizedUrl).toBe('http://localhost:8080');

      const resIp = validateGatewayUrl('http://127.0.0.1:8080', true);
      expect(resIp.valid).toBe(true);
      expect(resIp.normalizedUrl).toBe('http://127.0.0.1:8080');
    });

    it('strips credentials and query strings to avoid leaking secrets', () => {
      const res = validateGatewayUrl(
        'https://user:secret123@api.hosted-backend.com/?auth=leak#top',
        true
      );
      expect(res.valid).toBe(true);
      expect(res.normalizedUrl).toBe('https://api.hosted-backend.com');
      expect(res.normalizedUrl).not.toContain('secret123');
      expect(res.normalizedUrl).not.toContain('auth=leak');
    });

    it('rejects malformed URLs', () => {
      expect(validateGatewayUrl('not a url', true).valid).toBe(false);
      expect(validateGatewayUrl('', true).valid).toBe(false);
      expect(validateGatewayUrl('ssh://api.hosted-backend.com', true).valid).toBe(false);
    });
  });

  describe('Storage, Precedence and Persistence', () => {
    it('defaults to http://localhost:8080 in development when unconfigured', () => {
      const service = new ConfigService(tempConfigFile);
      const config = service.getConfig();
      expect(config.gatewayUrl).toBe('http://localhost:8080');
      expect(config.source).toBe('default_dev');
    });

    it('prioritizes environment variable preconfiguration over file config', () => {
      fs.writeFileSync(
        tempConfigFile,
        JSON.stringify({ gatewayUrl: 'https://file-config.org' }),
        'utf8'
      );
      process.env.GATEWAY_URL = 'https://env-config.org';

      const service = new ConfigService(tempConfigFile);
      const config = service.getConfig();
      expect(config.gatewayUrl).toBe('https://env-config.org');
    });

    it('reads configuration from persistent file if env var is absent', () => {
      fs.writeFileSync(
        tempConfigFile,
        JSON.stringify({ gatewayUrl: 'https://saved-gateway.org' }),
        'utf8'
      );

      const service = new ConfigService(tempConfigFile);
      const config = service.getConfig();
      expect(config.gatewayUrl).toBe('https://saved-gateway.org');
      expect(config.source).toBe('file');
    });

    it('persists updated URL to file on setGatewayUrl', () => {
      const service = new ConfigService(tempConfigFile);
      const res = service.setGatewayUrl('https://new-gateway.production.com');
      expect(res.success).toBe(true);
      expect(res.gatewayUrl).toBe('https://new-gateway.production.com');

      expect(fs.existsSync(tempConfigFile)).toBe(true);
      const savedData = JSON.parse(fs.readFileSync(tempConfigFile, 'utf8'));
      expect(savedData.gatewayUrl).toBe('https://new-gateway.production.com');
      expect(process.env.GATEWAY_URL).toBe('https://new-gateway.production.com');
    });

    it('clears configuration file on clearGatewayUrl', () => {
      const service = new ConfigService(tempConfigFile);
      service.setGatewayUrl('https://temporary-gateway.com');
      expect(fs.existsSync(tempConfigFile)).toBe(true);

      const clearRes = service.clearGatewayUrl();
      expect(clearRes.success).toBe(true);
      expect(fs.existsSync(tempConfigFile)).toBe(false);
    });
  });

  describe('IPC handler registration', () => {
    it('registers handlers for App IPC channels', async () => {
      const service = new ConfigService(tempConfigFile);
      const handlers = service.registerHandlers();

      const getHandler = handlers.find((h) => h.channel === Channels.App.GetConfigRequest);
      expect(getHandler).toBeDefined();

      const setHandler = handlers.find((h) => h.channel === Channels.App.SetGatewayUrlRequest);
      expect(setHandler).toBeDefined();

      const clearHandler = handlers.find((h) => h.channel === Channels.App.ClearGatewayUrlRequest);
      expect(clearHandler).toBeDefined();

      // Test handler execution
      const setRes = await setHandler!.handler({ url: 'https://ipc-gateway.org' }, {} as any);
      expect(setRes.success).toBe(true);
      expect(service.getConfig().gatewayUrl).toBe('https://ipc-gateway.org');
    });
  });
});
