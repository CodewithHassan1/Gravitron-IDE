import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getGatewayUrl,
  setGatewayUrl,
  clearGatewayUrl,
  validateGatewayUrl,
  isProductionRuntime,
  getConnectTransport,
  getAuthClient,
  GatewayNotConfiguredError,
  dynamicTransport
} from './gateway';
import { getErrorMessage } from './errors';

describe('Gateway Configuration and Transport Suite', () => {
  const originalWindow = global.window;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalGatewayUrl = process.env.GATEWAY_URL;
  const originalNextPublic = process.env.NEXT_PUBLIC_GATEWAY_URL;

  beforeEach(() => {
    delete process.env.GATEWAY_URL;
    delete process.env.NEXT_PUBLIC_GATEWAY_URL;
    process.env.NODE_ENV = 'test';
    // Clear in-memory caches
    clearGatewayUrl();
  });

  afterEach(() => {
    global.window = originalWindow;
    process.env.NODE_ENV = originalNodeEnv;
    if (originalGatewayUrl) process.env.GATEWAY_URL = originalGatewayUrl;
    if (originalNextPublic) process.env.NEXT_PUBLIC_GATEWAY_URL = originalNextPublic;
    vi.restoreAllMocks();
  });

  describe('isProductionRuntime', () => {
    it('detects production from window.agApi.isPackaged', () => {
      (global as any).window = {
        agApi: { isPackaged: () => true }
      };
      expect(isProductionRuntime()).toBe(true);

      (global as any).window = {
        agApi: { isPackaged: () => false }
      };
      expect(isProductionRuntime()).toBe(false);
    });

    it('falls back to NODE_ENV when window.agApi is absent', () => {
      (global as any).window = undefined;
      process.env.NODE_ENV = 'production';
      expect(isProductionRuntime()).toBe(true);

      process.env.NODE_ENV = 'development';
      expect(isProductionRuntime()).toBe(false);
    });
  });

  describe('validateGatewayUrl', () => {
    it('allows valid HTTPS URLs in production', () => {
      const res = validateGatewayUrl('https://gateway.example.com', true);
      expect(res.valid).toBe(true);
      expect(res.normalizedUrl).toBe('https://gateway.example.com');
    });

    it('strips trailing slashes, search params, and hash fragments', () => {
      const res = validateGatewayUrl('https://gateway.example.com:8443/api/?token=secret#section', true);
      expect(res.valid).toBe(true);
      expect(res.normalizedUrl).toBe('https://gateway.example.com:8443/api');
    });

    it('strips user credentials from URL to prevent credential leaking', () => {
      const res = validateGatewayUrl('https://admin:password123@gateway.example.com', true);
      expect(res.valid).toBe(true);
      expect(res.normalizedUrl).toBe('https://gateway.example.com');
      expect(res.normalizedUrl).not.toContain('password123');
    });

    it('rejects non-local HTTP endpoints in production mode', () => {
      const res = validateGatewayUrl('http://192.168.1.50:8080', true);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Production Gateway endpoints must use HTTPS');
    });

    it('allows HTTP for localhost in production mode (local debug scenario)', () => {
      const res1 = validateGatewayUrl('http://localhost:8080', true);
      expect(res1.valid).toBe(true);
      expect(res1.normalizedUrl).toBe('http://localhost:8080');

      const res2 = validateGatewayUrl('http://127.0.0.1:8080', true);
      expect(res2.valid).toBe(true);
      expect(res2.normalizedUrl).toBe('http://127.0.0.1:8080');
    });

    it('allows HTTP in development mode', () => {
      const res = validateGatewayUrl('http://custom-dev-server:8080', false);
      expect(res.valid).toBe(true);
      expect(res.normalizedUrl).toBe('http://custom-dev-server:8080');
    });

    it('rejects empty, null or invalid input', () => {
      expect(validateGatewayUrl('', false).valid).toBe(false);
      expect(validateGatewayUrl('   ', false).valid).toBe(false);
      expect(validateGatewayUrl('not-a-url', false).valid).toBe(false);
      expect(validateGatewayUrl('ftp://example.com', false).valid).toBe(false);
    });
  });

  describe('getGatewayUrl', () => {
    it('defaults to http://localhost:8080 in development when unconfigured', () => {
      process.env.NODE_ENV = 'development';
      expect(getGatewayUrl()).toBe('http://localhost:8080');
    });

    it('returns null in production when unconfigured (never silently falls back to localhost)', () => {
      (global as any).window = {
        agApi: { isPackaged: () => true, getGatewayUrl: () => null },
        localStorage: { getItem: () => null }
      };
      expect(getGatewayUrl()).toBeNull();
    });

    it('prioritizes window.agApi.getGatewayUrl when configured in Electron', () => {
      (global as any).window = {
        agApi: {
          isPackaged: () => true,
          getGatewayUrl: () => 'https://electron-gateway.company.com'
        },
        localStorage: {
          getItem: () => 'https://localstorage-gateway.company.com'
        }
      };
      expect(getGatewayUrl()).toBe('https://electron-gateway.company.com');
    });

    it('uses localStorage when agApi returns null or is absent', () => {
      const store: Record<string, string> = {
        ag_gateway_url: 'https://stored-gateway.company.com'
      };
      (global as any).window = {
        agApi: { isPackaged: () => true, getGatewayUrl: () => null },
        localStorage: {
          getItem: (key: string) => store[key] || null
        }
      };
      expect(getGatewayUrl()).toBe('https://stored-gateway.company.com');
    });
  });

  describe('setGatewayUrl and clearGatewayUrl persistence and cache invalidation', () => {
    it('persists through Electron config and localStorage and normalizes input', async () => {
      let electronSaved = '';
      const localStore: Record<string, string> = {};

      (global as any).window = {
        agApi: {
          isPackaged: () => true,
          getGatewayUrl: () => electronSaved,
          config: {
            setGatewayUrl: vi.fn(async (url: string) => {
              electronSaved = url;
            }),
            clearGatewayUrl: vi.fn(async () => {
              electronSaved = '';
            })
          }
        },
        localStorage: {
          setItem: (k: string, v: string) => { localStore[k] = v; },
          getItem: (k: string) => localStore[k] || null,
          removeItem: (k: string) => { delete localStore[k]; }
        }
      };

      const result = await setGatewayUrl('https://api.gateway.org:8443/');
      expect(result).toBe('https://api.gateway.org:8443');
      expect((global as any).window.agApi.config.setGatewayUrl).toHaveBeenCalledWith('https://api.gateway.org:8443');
      expect(localStore['ag_gateway_url']).toBe('https://api.gateway.org:8443');

      // Now clear
      await clearGatewayUrl();
      expect((global as any).window.agApi.config.clearGatewayUrl).toHaveBeenCalled();
      expect(localStore['ag_gateway_url']).toBeUndefined();
    });
  });

  describe('ConnectRPC transport lifecycle and client updates', () => {
    it('throws GatewayNotConfiguredError if transport is requested in unconfigured production', () => {
      (global as any).window = {
        agApi: { isPackaged: () => true, getGatewayUrl: () => null },
        localStorage: { getItem: () => null }
      };

      expect(() => getConnectTransport()).toThrow(GatewayNotConfiguredError);
      expect(() => getAuthClient()).toThrow(GatewayNotConfiguredError);
    });

    it('creates transport when configured and invalidates on setGatewayUrl', async () => {
      let activeUrl = 'https://initial.gateway.org';
      (global as any).window = {
        agApi: {
          isPackaged: () => true,
          getGatewayUrl: () => activeUrl,
          config: {
            setGatewayUrl: async (u: string) => { activeUrl = u; }
          }
        },
        localStorage: {
          setItem: () => {},
          getItem: () => null,
          removeItem: () => {}
        }
      };

      const transport1 = getConnectTransport();
      expect(transport1).toBeDefined();

      const client1 = getAuthClient();
      expect(client1).toBeDefined();

      // Setting a new URL must invalidate cache
      await setGatewayUrl('https://updated.gateway.org');
      activeUrl = 'https://updated.gateway.org';

      const transport2 = getConnectTransport();
      expect(transport2).toBeDefined();
      expect(transport2).not.toBe(transport1);

      const client2 = getAuthClient();
      expect(client2).toBeDefined();
      expect(client2).not.toBe(client1);
    });
  });

  describe('Error handling (getErrorMessage)', () => {
    it('returns clear message for GatewayNotConfiguredError', () => {
      const err = new GatewayNotConfiguredError();
      expect(getErrorMessage(err)).toBe('Gateway URL is not configured. Please configure your server endpoint to continue.');
    });

    it('returns user-friendly message for network failure / connection refused', () => {
      const err1 = new Error('fetch failed');
      expect(getErrorMessage(err1)).toBe('Authentication service unavailable or network failure. Please try again.');

      const err2 = new Error('TypeError: Failed to fetch');
      expect(getErrorMessage(err2)).toBe('Authentication service unavailable or network failure. Please try again.');
    });

    it('strips Connect error code brackets', () => {
      const err = new Error('[invalid_argument] Email and password required');
      expect(getErrorMessage(err)).toBe('Email and password required');
    });
  });
});
