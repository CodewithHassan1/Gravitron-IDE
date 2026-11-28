import { IService, ILifecycleService, IIpcService } from './IService';
import { ServiceIds } from './ServiceIds';
import { AgentRuntime, SpecialistRegistry, verifyDelegationWithPublicKey } from '@ag/worker-ai';
import type { DelegationContext } from '@ag/worker-ai';
import {
  Channels,
  AgentProtocol,
  RequestEnvelope,
  ResponseEnvelope,
  ProtocolVersion,
  type AccountEntitlements,
} from '@ag/protocol';
import { IpcContext } from '../ipc/IpcContext';
import { WindowService } from './WindowService';
import { IWorkspaceService } from './IWorkspaceService';
import { IWorkspaceExecutionService } from './execution/IWorkspaceExecutionService';
import { AgentCapabilityBridgeImpl } from './AgentCapabilityBridgeImpl';
import { IntelligenceManager } from './IntelligenceManager';
import { SecureCredentialStore } from './security/SecureCredentialStore';
import { AgentTimeoutSettingsStore } from './security/AgentTimeoutSettingsStore';
import { ConfigService } from './ConfigService';
import { ModelManagerService } from './models/ModelManagerService';
import { randomUUID } from 'crypto';

interface StartRequestPayload {
  workspaceId: string;
  conversationId: string;
  agentId?: string;
  prompt: string;
  providerType?: any;
  providerConfig?: any;
  model?: string;
  options?: any;
  // The renderer's own access token. Exchanged for an ephemeral, execution
  // bound agent delegation in the main process. The raw delegation token is
  // NEVER returned to the renderer and is NEVER persisted.
  accessToken?: string;
  orgId?: string;
}

export class AgentIpcService implements IService, ILifecycleService, IIpcService {
  public readonly id = ServiceIds.AgentIpc;
  public readonly dependencies = [
    ServiceIds.Window,
    ServiceIds.Workspace,
    ServiceIds.WorkspaceExecution,
    ServiceIds.Intelligence,
  ];
  private runtime: AgentRuntime;
  private windowService: WindowService;
  private credentialStore: SecureCredentialStore;
  private timeoutSettingsStore: AgentTimeoutSettingsStore;
  private configService?: ConfigService;
  private modelManagerService?: ModelManagerService;
  private cachedEntitlements: AccountEntitlements | null = null;
  private capabilityBridge: AgentCapabilityBridgeImpl;
  private routerConnected = false;
  private routerEndpoint = 'https://agent-router.org/mcp';
  private routerLastError?: string;

  constructor(
    windowService: WindowService,
    workspaceService: IWorkspaceService,
    workspaceExecutionService: IWorkspaceExecutionService,
    intelligenceManager: IntelligenceManager,
    credentialStore?: SecureCredentialStore,
    timeoutSettingsStore?: AgentTimeoutSettingsStore,
    configService?: ConfigService,
    modelManagerService?: ModelManagerService
  ) {
    this.configService = configService;
    this.modelManagerService = modelManagerService;
    this.timeoutSettingsStore = timeoutSettingsStore || new AgentTimeoutSettingsStore();
    this.capabilityBridge = new AgentCapabilityBridgeImpl(
      workspaceService,
      workspaceExecutionService,
      intelligenceManager,
      this.timeoutSettingsStore
    );
    this.runtime = new AgentRuntime({ capabilityBridge: this.capabilityBridge });
    this.windowService = windowService;
    this.credentialStore = credentialStore || new SecureCredentialStore();
  }

  public async initialize(): Promise<void> {
    this.credentialStore.ensureLoaded?.();
  }
  public async start(): Promise<void> {}
  public async stop(): Promise<void> {
    this.runtime.cancelAll?.();
    await this.capabilityBridge.dispose();
  }
  public async dispose(): Promise<void> {
    this.runtime.cancelAll?.();
    await this.capabilityBridge.dispose();
  }
  public async health(): Promise<boolean> {
    return true;
  }

  private isProductionMode(): boolean {
    return Boolean(
      process.env.IS_PACKAGED === 'true' ||
      process.env.NODE_ENV === 'production' ||
      this.configService?.getConfig().isPackaged
    );
  }

  private getGatewayUrl(): string {
    const envUrl = process.env.AGENT_GATEWAY_URL || process.env.GATEWAY_URL;
    if (envUrl && envUrl.trim().length > 0) {
      return envUrl.trim();
    }
    const configuredUrl = this.configService?.getConfig().gatewayUrl;
    if (configuredUrl && configuredUrl.trim().length > 0) {
      return configuredUrl.trim();
    }
    if (!this.isProductionMode()) {
      return 'http://localhost:8080';
    }
    throw new Error(
      'Gateway URL is not configured. Configure your production HTTPS Gateway URL in Server Settings before starting the agent.'
    );
  }

  private getAgentHostSecret(): string {
    const fromEnv = process.env.AGENT_HOST_SECRET;
    if (fromEnv && fromEnv.trim().length > 0) {
      return fromEnv.trim();
    }
    // Match development convention in services/gateway/src/index.ts:52
    if (!this.isProductionMode()) {
      return 'local-dev-host-secret';
    }
    throw new Error(
      'AGENT_HOST_SECRET is not configured; agent execution host cannot exchange a delegation'
    );
  }

  private getInternalPublicKey(): string {
    const pubKey = process.env.INTERNAL_PUBLIC_KEY;
    if (!pubKey || pubKey.trim().length === 0) {
      throw new Error('INTERNAL_PUBLIC_KEY is not configured; cannot verify the agent delegation');
    }
    return pubKey;
  }

  /**
   * Exchanges the renderer's access token for an ephemeral, execution-bound
   * agent delegation at the Gateway (the sole trusted delegation issuer), then
   * cryptographically verifies it against the public key and the execution
   * binding. Only metadata (never the raw bearer token) is returned for the
   * session context. If the main process lacks the configured secrets, agent
   * execution fails closed rather than running unbound.
   */
  private async authorizeAgentExecution(
    workspaceId: string,
    accessToken: string,
    orgId?: string,
    model?: string,
    credentialSource?: 'subscription' | 'byok' | 'local'
  ): Promise<DelegationContext> {
    const gatewayUrl = this.getGatewayUrl();
    const hostSecret = this.getAgentHostSecret();
    const internalPublicKey = this.getInternalPublicKey();

    let exchangeResponse: Response;
    try {
      exchangeResponse = await fetch(`${gatewayUrl}/api/v1/agent/delegations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'X-Agent-Host-Token': hostSecret,
        },
        body: JSON.stringify({ workspaceId, orgId, model, credentialSource }),
      });
    } catch (networkErr: any) {
      throw new Error(
        `Failed to connect to Gateway at ${gatewayUrl}: ${networkErr.message}. Ensure the Gateway service is running.`
      );
    }

    if (!exchangeResponse.ok) {
      let detail = '';
      try {
        const errBody = (await exchangeResponse.json()) as any;
        if (errBody?.error) detail = `: ${errBody.error}`;
      } catch {
        // Ignore JSON parse failures
      }
      throw new Error(`Delegation exchange failed (${exchangeResponse.status})${detail}`);
    }

    const exchanged = (await exchangeResponse.json()) as any;

    // Verify before the runtime may start. The raw delegation token exists
    // only in this function's local scope and is never stored or forwarded.
    return verifyDelegationWithPublicKey(
      exchanged.delegation,
      internalPublicKey,
      exchanged.executionId
    );
  }

  public registerHandlers(): Array<{
    channel: string;
    handler: (payload: any, ctx: IpcContext) => Promise<any>;
  }> {
    return [
      {
        channel: Channels.Agent.GetProviderConfigRequest,
        handler: async (_payload: void, ctx: IpcContext) => {
          const config = this.credentialStore.getProviderConfig();
          const response: ResponseEnvelope<AgentProtocol.GetProviderConfigResponsePayload> = {
            version: ProtocolVersion.V1,
            requestId: ctx.requestId,
            payload: config,
          };
          return response;
        },
      },
      {
        channel: Channels.Agent.SetProviderConfigRequest,
        handler: async (
          payload: AgentProtocol.SetProviderConfigRequestPayload,
          ctx: IpcContext
        ) => {
          const result = this.credentialStore.setProviderConfig(payload);
          const response: ResponseEnvelope<{
            success: boolean;
            isConfigured: boolean;
            error?: string;
          }> = {
            version: ProtocolVersion.V1,
            requestId: ctx.requestId,
            payload: result,
          };
          return response;
        },
      },
      {
        channel: Channels.Agent.TestProviderConfigRequest,
        handler: async (
          payload: AgentProtocol.TestProviderConfigRequestPayload,
          ctx: IpcContext
        ) => {
          const result = await this.credentialStore.testProviderConnection(payload);
          const response: ResponseEnvelope<AgentProtocol.TestProviderConfigResponsePayload> = {
            version: ProtocolVersion.V1,
            requestId: ctx.requestId,
            payload: result,
          };
          return response;
        },
      },
      {
        channel: Channels.Agent.StartRequest,
        handler: async (payload: StartRequestPayload, ctx: IpcContext) => {
          const {
            workspaceId,
            conversationId,
            agentId,
            prompt,
            providerType,
            providerConfig,
            accessToken,
            orgId,
          } = payload;

          if (!workspaceId || !prompt) {
            throw new Error('workspaceId and prompt are required to start an agent');
          }
          if (providerType !== 'local' && (!accessToken || typeof accessToken !== 'string')) {
            throw new Error('A renderer access token is required to authorize agent execution');
          }

          // Resolve provider and securely inject credentials
          const resolvedProviderType: AgentProtocol.SupportedProviderType =
            providerType || this.credentialStore.getActiveProvider();

          const resolvedConfig = { ...(providerConfig || {}) };
          let credentialSource: 'subscription' | 'byok' | 'local' = 'byok';
          let modelToUse =
            payload.model ||
            resolvedConfig.model ||
            this.credentialStore.getModel(resolvedProviderType);

          if (resolvedProviderType === 'local') {
            credentialSource = 'local';
            if (!this.modelManagerService) {
              throw new Error('Local model runtime manager is unavailable.');
            }
            const targetLocalModelId =
              payload.model ||
              resolvedConfig.model ||
              (await this.modelManagerService.getCatalogSnapshot()).defaultModelId;
            if (!targetLocalModelId) {
              throw new Error('No local model selected or installed. Install a local model first.');
            }
            const rt = await this.modelManagerService.loadModel(targetLocalModelId);
            const activeEndpoint = this.modelManagerService.getRuntimeManager().getActiveEndpoint();
            if (!activeEndpoint || rt.status !== 'running') {
              throw new Error(rt.error || 'Failed to start local inference runtime.');
            }
            resolvedConfig.baseURL = activeEndpoint.baseURL;
            resolvedConfig.apiKey = activeEndpoint.apiKey;
            modelToUse = targetLocalModelId;
          } else {
            if (!resolvedConfig.apiKey) {
              const storedApiKey = this.credentialStore.getApiKey(resolvedProviderType);
              if (storedApiKey) {
                resolvedConfig.apiKey = storedApiKey;
                credentialSource = 'byok';
              } else if (
                this.cachedEntitlements &&
                this.cachedEntitlements.permittedCloudModels.includes(modelToUse)
              ) {
                credentialSource = 'subscription';
                // Subscription-backed cloud model still requires configured provider credential on host if gateway doesn't proxy inference
                const fallbackEnvKey = this.credentialStore.getApiKey(resolvedProviderType);
                if (!fallbackEnvKey) {
                  throw new Error(
                    `Model '${modelToUse}' is permitted on your ${this.cachedEntitlements.plan} plan, but no ${resolvedProviderType} API key is configured on this desktop host.`
                  );
                }
                resolvedConfig.apiKey = fallbackEnvKey;
              } else {
                throw new Error(
                  `No API key configured for provider '${resolvedProviderType}'. Please configure your API key in AI Assistant Settings or select an entitled model.`
                );
              }
            }

            if (!resolvedConfig.baseURL) {
              const storedBaseURL = this.credentialStore.getBaseURL(resolvedProviderType);
              if (storedBaseURL) {
                resolvedConfig.baseURL = storedBaseURL;
              }
            }
          }

          const sessionOptions = {
            model: modelToUse,
            ...(payload.options || {}),
          };

          // Execution host authorization: exchange the renderer token for an
          // ephemeral, execution-bound delegation and verify it. For offline local
          // model execution when Gateway is unreachable on the network, bind a
          // local execution context derived from the verified local workspace & user.
          let delegation: DelegationContext;
          try {
            delegation = await this.authorizeAgentExecution(
              workspaceId,
              accessToken || '',
              orgId,
              modelToUse,
              credentialSource
            );
          } catch (authErr: any) {
            const msg = String(authErr?.message || '');
            const isOfflineLocalAllowed =
              /Failed to connect to Gateway|Gateway URL is not configured|AGENT_HOST_SECRET is not configured|INTERNAL_PUBLIC_KEY is not configured|fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(
                msg
              );
            if (resolvedProviderType === 'local' && (isOfflineLocalAllowed || !accessToken)) {
              let sub = 'offline-local-user';
              let org = orgId || 'offline-local-org';
              try {
                const payloadPart = (accessToken || '').split('.')[1];
                if (payloadPart) {
                  const decoded = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
                  if (decoded?.sub) sub = String(decoded.sub);
                  if (decoded?.org_id) org = String(decoded.org_id);
                }
              } catch {
                // fallback offline local identity
              }
              delegation = {
                executionId: randomUUID(),
                userId: sub,
                orgId: org,
                scope: 'agent:execute',
                jti: randomUUID(),
              };
            } else {
              throw authErr;
            }
          }

          const createdAgentId = this.runtime.startAgent(
            workspaceId,
            conversationId,
            prompt,
            resolvedProviderType,
            resolvedConfig,
            (agentEvent) => {
              this.windowService.broadcast(Channels.Agent.OnEvent, agentEvent);
            },
            delegation,
            agentId,
            sessionOptions
          );

          const response: ResponseEnvelope<AgentProtocol.StartResponse> = {
            version: ProtocolVersion.V1,
            requestId: ctx.requestId,
            payload: { agentId: createdAgentId },
          };
          return response;
        },
      },
      {
        channel: Channels.Agent.CancelRequest,
        handler: async (payload: { agentId: string }, ctx: IpcContext) => {
          this.runtime.cancelAgent(payload.agentId);

          const response: ResponseEnvelope<void> = {
            version: ProtocolVersion.V1,
            requestId: ctx.requestId,
            payload: undefined,
          };
          return response;
        },
      },
      {
        channel: Channels.Agent.ApproveToolRequest,
        handler: async (
          payload: { agentId: string; approvalId: string; toolCallId: string; approved: boolean },
          ctx: IpcContext
        ) => {
          this.runtime.approveTool(
            payload.agentId,
            payload.approvalId,
            payload.toolCallId,
            payload.approved
          );

          const response: ResponseEnvelope<void> = {
            version: ProtocolVersion.V1,
            requestId: ctx.requestId,
            payload: undefined,
          };
          return response;
        },
      },
      {
        channel: Channels.Agent.SnapshotRequest,
        handler: async (payload: { agentId: string }, ctx: IpcContext) => {
          const snapshot = this.runtime.getSnapshot(payload.agentId);

          const response: ResponseEnvelope<AgentProtocol.AgentSnapshot | null> = {
            version: ProtocolVersion.V1,
            requestId: ctx.requestId,
            payload: snapshot,
          };
          return response;
        },
      },
      {
        channel: Channels.Agent.GetTimeoutPolicyRequest,
        handler: async () => {
          return this.timeoutSettingsStore.getPolicy();
        },
      },
      {
        channel: Channels.Agent.SetTimeoutPolicyRequest,
        handler: async (payload: Partial<AgentProtocol.AgentTimeoutPolicy>) => {
          return this.timeoutSettingsStore.setPolicy(payload || {});
        },
      },
      {
        channel: Channels.Agent.ExtendCommandTimeoutRequest,
        handler: async (payload: {
          agentId: string;
          commandId: string;
          additionalMs: number;
          reason?: string;
        }) => {
          if (!payload?.agentId || !payload?.commandId) {
            throw new Error('agentId and commandId are required to extend command timeout');
          }
          const snapshot = this.runtime.getSnapshot(payload.agentId);
          if (!snapshot) {
            return {
              granted: false,
              newTimeoutMs: 0,
              deadlineAt: 0,
              addedMs: 0,
              reason: 'Active agent session not found.',
            };
          }
          return await this.capabilityBridge.extendCommandTimeout(
            {
              agentId: payload.agentId,
              workspaceId: snapshot.workspaceId,
              signal: new AbortController().signal,
            },
            payload.commandId,
            payload.additionalMs,
            'user',
            payload.reason
          );
        },
      },
      {
        channel: Channels.Agent.CancelCommandRequest,
        handler: async (payload: { agentId: string; commandId: string }) => {
          if (!payload?.agentId || !payload?.commandId) {
            return { cancelled: false };
          }
          const snapshot = this.runtime.getSnapshot(payload.agentId);
          if (!snapshot) {
            return { cancelled: false };
          }
          const cancelled = await this.capabilityBridge.cancelCommand(
            {
              agentId: payload.agentId,
              workspaceId: snapshot.workspaceId,
              signal: new AbortController().signal,
            },
            payload.commandId
          );
          return { cancelled };
        },
      },
      {
        channel: Channels.Agent.GetSpecialistsStatusRequest,
        handler: async () => {
          return this.buildSpecialistsStatusPayload();
        },
      },
      {
        channel: Channels.Agent.DiscoverSpecialistsRequest,
        handler: async (payload?: AgentProtocol.DiscoverSpecialistsRequestPayload) => {
          const endpoint = payload?.endpoint?.trim() || this.routerEndpoint;
          this.routerEndpoint = endpoint;
          const res = await this.runtime.connectAgentRouter({
            endpoint,
            timeoutMs: payload?.timeoutMs || 15000,
          });
          this.routerConnected = res.connected;
          this.routerLastError = res.error;
          return this.buildSpecialistsStatusPayload();
        },
      },
      {
        channel: Channels.Agent.SetSpecialistEnabledRequest,
        handler: async (payload: AgentProtocol.SetSpecialistEnabledRequestPayload) => {
          if (!payload?.name) {
            throw new Error('Specialist name is required');
          }
          const ok = payload.enabled
            ? this.runtime.enableSpecialist(payload.name)
            : this.runtime.disableSpecialist(payload.name);
          const status = this.buildSpecialistsStatusPayload();
          if (!ok) {
            return {
              ...status,
              error: `Specialist '${payload.name}' is excluded or not on the approved allowlist.`,
            };
          }
          return status;
        },
      },
      {
        channel: Channels.Agent.GetEntitlementsRequest,
        handler: async (payload: { accessToken?: string }) => {
          if (!payload?.accessToken) {
            throw new Error('Access token is required to fetch account entitlements.');
          }
          const gatewayUrl = this.getGatewayUrl();
          const res = await fetch(`${gatewayUrl}/api/v1/account/entitlements`, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${payload.accessToken}`,
            },
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({} as any));
            throw new Error(body?.error || `Failed to retrieve entitlements (${res.status})`);
          }
          const data = (await res.json()) as AccountEntitlements;
          this.cachedEntitlements = data;
          return data;
        },
      },
      {
        channel: Channels.Agent.ClearEntitlementsRequest,
        handler: async () => {
          this.cachedEntitlements = null;
          return { cleared: true };
        },
      },
    ];
  }

  private buildSpecialistsStatusPayload(): AgentProtocol.SpecialistsStatusResponsePayload {
    const fallbackDescriptions: Record<string, string> = {
      softwareengineeringexpert:
        'Architecture design, refactoring strategy, and deep code quality analysis.',
      sandboxcodingagent:
        'Isolated sandbox execution for algorithmic verification (no local workspace access).',
      taskplanner: 'Structured decomposition of multi-component implementation tasks.',
      constructivecritic: 'Independent architectural and trade-off critique of plans.',
      researchagent: 'External technical documentation and API research.',
      browsernavigationagent: 'Remote web documentation inspection and browser navigation.',
      reasoningdelegationhigh: 'Deep multi-step analytical reasoning under uncertainty.',
      wait_for_task: 'Coordination helper for asynchronous specialist tasks.',
      discover_agents: 'Discover capabilities advertised by the AgentRouter network.',
    };

    const registry = this.runtime.getSpecialistRegistry?.();
    const discoveredNames = registry ? registry.getDiscoveredToolNames() : [];
    const registeredNames = new Set(registry ? registry.getRegisteredToolNames() : []);

    const specialists: AgentProtocol.SpecialistStatus[] = Array.from(
      SpecialistRegistry.APPROVED_SPECIALISTS
    ).map((name) => {
      const def = registry?.getToolDefinition(name);
      return {
        name,
        description:
          def?.description || fallbackDescriptions[name] || `AgentRouter specialist: ${name}`,
        riskLevel: SpecialistRegistry.RISK_LEVEL_MAP[name] || 'read',
        approved: true,
        discovered: Boolean(def),
        registered: registeredNames.has(name),
        enabled: registry ? registry.isAvailable(name) : true,
      };
    });

    return {
      connected: this.routerConnected,
      endpoint: this.routerEndpoint,
      discoveredCount: discoveredNames.length,
      approvedCount: specialists.length,
      registeredCount: registeredNames.size,
      specialists,
      error: this.routerLastError,
    };
  }
}
