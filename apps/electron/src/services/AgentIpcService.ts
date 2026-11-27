import { IService, ILifecycleService, IIpcService } from './IService';
import { ServiceIds } from './ServiceIds';
import { AgentRuntime, verifyDelegationWithPublicKey } from '@ag/worker-ai';
import type { DelegationContext } from '@ag/worker-ai';
import {
  Channels,
  AgentProtocol,
  RequestEnvelope,
  ResponseEnvelope,
  ProtocolVersion,
} from '@ag/protocol';
import { IpcContext } from '../ipc/IpcContext';
import { WindowService } from './WindowService';
import { IWorkspaceService } from './IWorkspaceService';
import { IWorkspaceExecutionService } from './execution/IWorkspaceExecutionService';
import { AgentCapabilityBridgeImpl } from './AgentCapabilityBridgeImpl';
import { IntelligenceManager } from './IntelligenceManager';
import { SecureCredentialStore } from './security/SecureCredentialStore';
import { AgentTimeoutSettingsStore } from './security/AgentTimeoutSettingsStore';

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
  private capabilityBridge: AgentCapabilityBridgeImpl;

  constructor(
    windowService: WindowService,
    workspaceService: IWorkspaceService,
    workspaceExecutionService: IWorkspaceExecutionService,
    intelligenceManager: IntelligenceManager,
    credentialStore?: SecureCredentialStore,
    timeoutSettingsStore?: AgentTimeoutSettingsStore
  ) {
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

  public async initialize(): Promise<void> {}
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

  private getGatewayUrl(): string {
    return (
      process.env.AGENT_GATEWAY_URL ||
      process.env.GATEWAY_URL ||
      'http://localhost:8080'
    );
  }

  private getAgentHostSecret(): string {
    const fromEnv = process.env.AGENT_HOST_SECRET;
    if (fromEnv && fromEnv.trim().length > 0) {
      return fromEnv.trim();
    }
    // Match development convention in services/gateway/src/index.ts:52
    const isPackaged = process.env.IS_PACKAGED === 'true';
    if (!isPackaged && process.env.NODE_ENV !== 'production') {
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
    orgId?: string
  ): Promise<DelegationContext> {
    const hostSecret = this.getAgentHostSecret();
    const internalPublicKey = this.getInternalPublicKey();
    const gatewayUrl = this.getGatewayUrl();

    let exchangeResponse: Response;
    try {
      exchangeResponse = await fetch(`${gatewayUrl}/api/v1/agent/delegations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'X-Agent-Host-Token': hostSecret,
        },
        body: JSON.stringify({ workspaceId, orgId }),
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
          if (!accessToken || typeof accessToken !== 'string') {
            throw new Error('A renderer access token is required to authorize agent execution');
          }

          // Resolve provider and securely inject credentials
          const resolvedProviderType: AgentProtocol.SupportedProviderType =
            providerType || this.credentialStore.getActiveProvider();

          const resolvedConfig = { ...(providerConfig || {}) };
          if (!resolvedConfig.apiKey) {
            const storedApiKey = this.credentialStore.getApiKey(resolvedProviderType);
            if (!storedApiKey) {
              throw new Error(
                `No API key configured for provider '${resolvedProviderType}'. Please configure your API key in AI Assistant Settings.`
              );
            }
            resolvedConfig.apiKey = storedApiKey;
          }

          if (!resolvedConfig.baseURL) {
            const storedBaseURL = this.credentialStore.getBaseURL(resolvedProviderType);
            if (storedBaseURL) {
              resolvedConfig.baseURL = storedBaseURL;
            }
          }

          const modelToUse =
            payload.model ||
            resolvedConfig.model ||
            this.credentialStore.getModel(resolvedProviderType);

          const sessionOptions = {
            model: modelToUse,
            ...(payload.options || {}),
          };

          // Execution host authorization: exchange the renderer token for an
          // ephemeral, execution-bound delegation and verify it. The raw
          // delegation never reaches the runtime; only metadata is used.
          const delegation = await this.authorizeAgentExecution(workspaceId, accessToken, orgId);

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
    ];
  }
}
