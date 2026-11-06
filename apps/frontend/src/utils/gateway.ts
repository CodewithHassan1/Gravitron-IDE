import { createPromiseClient, PromiseClient, Transport } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { AuthService } from '@ag/proto/gen/ts/auth/v1/auth_connect';

export class GatewayNotConfiguredError extends Error {
  constructor(
    message: string = 'Gateway URL is not configured. Please configure your server endpoint to continue.'
  ) {
    super(message);
    this.name = 'GatewayNotConfiguredError';
  }
}

export interface GatewayValidationResult {
  valid: boolean;
  normalizedUrl?: string;
  error?: string;
}

export function isProductionRuntime(): boolean {
  if (typeof window !== 'undefined') {
    if (window.location?.protocol === 'app:') {
      return true;
    }
    if ((window as any).agApi?.isPackaged) {
      return Boolean((window as any).agApi.isPackaged());
    }
  }
  return process.env.NODE_ENV === 'production';
}

export function validateGatewayUrl(
  input: string,
  isProduction: boolean = isProductionRuntime()
): GatewayValidationResult {
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

  // Strip credentials, search parameters, and hashes to avoid leaking sensitive information
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

let cachedGatewayUrl: string | null = null;
let cachedTransport: Transport | null = null;
let cachedAuthClient: PromiseClient<typeof AuthService> | null = null;

export function getGatewayUrl(): string | null {
  const isProd = isProductionRuntime();

  if (typeof window !== 'undefined') {
    // 1. Runtime override from Electron preload API (if running inside Electron)
    if ((window as any).agApi?.getGatewayUrl) {
      const electronGateway = (window as any).agApi.getGatewayUrl();
      if (
        electronGateway &&
        typeof electronGateway === 'string' &&
        electronGateway.trim().length > 0
      ) {
        const validated = validateGatewayUrl(electronGateway, isProd);
        if (validated.valid && validated.normalizedUrl) {
          return validated.normalizedUrl;
        }
      }
    }

    // 2. Runtime override from localStorage
    try {
      const stored =
        window.localStorage?.getItem('ag_gateway_url') ||
        window.localStorage?.getItem('GATEWAY_URL') ||
        window.localStorage?.getItem('NEXT_PUBLIC_GATEWAY_URL');
      if (stored && stored.trim().length > 0) {
        const validated = validateGatewayUrl(stored, isProd);
        if (validated.valid && validated.normalizedUrl) {
          return validated.normalizedUrl;
        }
      }
    } catch {
      // localStorage may be inaccessible in certain sandboxed environments
    }
  }

  // 3. Fallback to compile-time env in development mode only
  if (!isProd) {
    return process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:8080';
  }

  // 4. In production with no Gateway configured, return null (never silently fall back to localhost)
  return null;
}

export async function setGatewayUrl(urlInput: string): Promise<string> {
  const isProd = isProductionRuntime();
  const validation = validateGatewayUrl(urlInput, isProd);
  if (!validation.valid || !validation.normalizedUrl) {
    throw new Error(validation.error || 'Invalid Gateway URL');
  }

  const normalized = validation.normalizedUrl;

  // Update in Electron main process if available
  if (typeof window !== 'undefined' && (window as any).agApi?.config?.setGatewayUrl) {
    try {
      await (window as any).agApi.config.setGatewayUrl(normalized);
    } catch (err: any) {
      console.warn('[gateway] Failed to persist gateway URL in Electron config:', err.message);
    }
  }

  // Update in localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem('ag_gateway_url', normalized);
      window.localStorage.setItem('GATEWAY_URL', normalized);
    } catch {
      // ignore
    }
  }

  // Invalidate cache immediately so subsequent ConnectRPC calls use the new transport
  cachedGatewayUrl = null;
  cachedTransport = null;
  cachedAuthClient = null;

  return normalized;
}

export async function clearGatewayUrl(): Promise<void> {
  // Clear in Electron main process if available
  if (typeof window !== 'undefined' && (window as any).agApi?.config?.clearGatewayUrl) {
    try {
      await (window as any).agApi.config.clearGatewayUrl();
    } catch {
      // ignore
    }
  }

  // Clear in localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem('ag_gateway_url');
      window.localStorage.removeItem('GATEWAY_URL');
      window.localStorage.removeItem('NEXT_PUBLIC_GATEWAY_URL');
    } catch {
      // ignore
    }
  }

  // Invalidate cache
  cachedGatewayUrl = null;
  cachedTransport = null;
  cachedAuthClient = null;
}

export function getConnectTransport(): Transport {
  const url = getGatewayUrl();
  if (!url) {
    throw new GatewayNotConfiguredError();
  }

  if (cachedTransport && cachedGatewayUrl === url) {
    return cachedTransport;
  }

  cachedGatewayUrl = url;
  cachedTransport = createConnectTransport({
    baseUrl: url,
  });
  cachedAuthClient = null;

  return cachedTransport;
}

export function getAuthClient(): PromiseClient<typeof AuthService> {
  const transport = getConnectTransport();
  if (!cachedAuthClient) {
    cachedAuthClient = createPromiseClient(AuthService, transport);
  }
  return cachedAuthClient;
}

export const dynamicTransport: Transport = {
  unary: (service, method, signal, timeoutMs, header, input) => {
    return getConnectTransport().unary(service, method, signal, timeoutMs, header, input);
  },
  stream: (service, method, signal, timeoutMs, header, input) => {
    return getConnectTransport().stream(service, method, signal, timeoutMs, header, input);
  },
};
