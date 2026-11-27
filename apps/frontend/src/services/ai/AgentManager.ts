import { AgentProtocol } from '@ag/protocol';
import { getAuthClient } from '../../utils/gateway';
import { useAuthStore } from '../../stores/auth';

function isJwtExpired(token: string, skewMs: number = 30_000): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    const payload = JSON.parse(json);
    if (typeof payload.exp !== 'number') return false;
    return payload.exp * 1000 <= Date.now() + skewMs;
  } catch {
    return true;
  }
}

export class AgentManager {
  private subscription: { dispose: () => void } | null = null;
  private onEventCallback: ((event: AgentProtocol.AgentEventEnvelope) => void) | null = null;

  /**
   * Safe constructor: does not access `window` or any browser globals.
   * Can safely be instantiated in any environment without throwing.
   */
  constructor() {
    // Intentionally no window/DOM access during construction
  }

  /**
   * Helper to safely get the Electron Agent API if available in browser context.
   */
  private get agentApi(): any | null {
    if (typeof window === 'undefined') {
      return null;
    }
    return (window as any).agApi?.agent || null;
  }

  /**
   * Returns true if running in a browser window with the Electron agApi.agent bridge available.
   */
  public isAvailable(): boolean {
    return this.agentApi !== null;
  }

  /**
   * Initializes the event subscription from Electron IPC.
   * Safe to call in browser after mount. Idempotent: ensures only one subscription is active.
   */
  public initialize(): void {
    if (this.subscription) {
      return; // Already subscribed
    }

    const api = this.agentApi;
    if (api?.subscribe) {
      this.subscription = api.subscribe((event: AgentProtocol.AgentEventEnvelope) => {
        if (this.onEventCallback) {
          try {
            this.onEventCallback(event);
          } catch (err) {
            console.error('[AgentManager] Error in onEvent callback:', err);
          }
        }
      });
    }
  }

  /**
   * Registers an event callback for agent events and returns an unsubscribe function.
   */
  public onEvent(callback: ((event: AgentProtocol.AgentEventEnvelope) => void) | null): () => void {
    this.onEventCallback = callback;
    return () => {
      if (this.onEventCallback === callback) {
        this.onEventCallback = null;
      }
    };
  }

  private ensureAvailable(operationName: string): any {
    const api = this.agentApi;
    if (!api) {
      throw new Error(
        `Agent IPC operation "${operationName}" failed: Electron agent bridge (window.agApi.agent) is unavailable. Ensure you are running within the Gravitron IDE desktop application.`
      );
    }
    return api;
  }

  private getStoredTokens(): { accessToken?: string; refreshToken?: string } {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return {};
    }
    const authState = useAuthStore.getState();
    let accessToken = authState.accessToken || undefined;
    let refreshToken = authState.refreshToken || undefined;

    try {
      if (!accessToken) {
        accessToken = localStorage.getItem('ag_access_token') || undefined;
      }
      if (!refreshToken) {
        refreshToken = localStorage.getItem('ag_refresh_token') || undefined;
      }
      if (!accessToken || !refreshToken) {
        const sessionStr = localStorage.getItem('ag_auth_session');
        if (sessionStr) {
          const parsed = JSON.parse(sessionStr);
          if (!accessToken) accessToken = parsed?.state?.accessToken || undefined;
          if (!refreshToken) refreshToken = parsed?.state?.refreshToken || undefined;
        }
      }
    } catch {
      // Safe fallback if JSON parsing fails or localStorage is restricted
    }
    return { accessToken, refreshToken };
  }

  private async ensureValidAccessToken(forceRefresh: boolean = false): Promise<string> {
    const { accessToken, refreshToken } = this.getStoredTokens();

    if (!forceRefresh && accessToken && !isJwtExpired(accessToken)) {
      return accessToken;
    }

    if (refreshToken) {
      try {
        const client = getAuthClient();
        const refreshed = await client.refresh({ refreshToken });
        if (refreshed?.accessToken) {
          useAuthStore
            .getState()
            .updateTokens(refreshed.accessToken, refreshed.refreshToken || refreshToken);
          return refreshed.accessToken;
        }
      } catch (err: any) {
        console.warn('[AgentManager] Token refresh failed:', err?.message || err);
      }
    }

    useAuthStore.getState().setStatus('SESSION_EXPIRED');
    throw new Error('Your session has expired. Please sign in again to run the agent.');
  }

  async startAgent(
    workspaceId: string,
    conversationId: string,
    prompt: string,
    providerType?: any,
    providerConfig?: any,
    model?: string,
    options?: any
  ): Promise<string> {
    const api = this.ensureAvailable('startAgent');

    // The renderer's own access token authorizes the execution in the main
    // process. It is exchanged there for an ephemeral, execution-bound
    // delegation that is never returned to the renderer.
    const accessToken = await this.ensureValidAccessToken(false);

    try {
      return await api.start(
        workspaceId,
        conversationId,
        prompt,
        providerType,
        providerConfig,
        accessToken,
        model,
        options
      );
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (msg.includes('(401)')) {
        const refreshedToken = await this.ensureValidAccessToken(true);
        return await api.start(
          workspaceId,
          conversationId,
          prompt,
          providerType,
          providerConfig,
          refreshedToken,
          model,
          options
        );
      }
      throw err;
    }
  }

  async getProviderConfig(): Promise<AgentProtocol.GetProviderConfigResponsePayload> {
    const api = this.ensureAvailable('getProviderConfig');
    return await api.getProviderConfig();
  }

  async setProviderConfig(
    config: AgentProtocol.SetProviderConfigRequestPayload
  ): Promise<{ success: boolean; isConfigured: boolean; error?: string }> {
    const api = this.ensureAvailable('setProviderConfig');
    return await api.setProviderConfig(config);
  }

  async testProviderConfig(
    config: AgentProtocol.TestProviderConfigRequestPayload
  ): Promise<AgentProtocol.TestProviderConfigResponsePayload> {
    const api = this.ensureAvailable('testProviderConfig');
    return await api.testProviderConfig(config);
  }

  async snapshot(agentId: string): Promise<AgentProtocol.AgentSnapshot | null> {
    const api = this.ensureAvailable('snapshot');
    return await api.snapshot(agentId);
  }

  approveTool(agentId: string, approvalId: string, toolCallId: string, approved: boolean): void {
    const api = this.ensureAvailable('approveTool');
    api.approveTool(agentId, approvalId, toolCallId, approved);
  }

  cancelAgent(agentId: string): void {
    const api = this.ensureAvailable('cancelAgent');
    api.cancel(agentId);
  }

  dispose(): void {
    if (this.subscription) {
      try {
        this.subscription.dispose();
      } catch (err) {
        console.warn('[AgentManager] Error disposing subscription:', err);
      }
      this.subscription = null;
    }
    this.onEventCallback = null;
  }
}
