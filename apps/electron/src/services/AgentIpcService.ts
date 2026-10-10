import { IService, IIpcService } from './IService';
import { ServiceIds } from './ServiceIds';
import { AgentRuntime, verifyDelegationWithPublicKey } from '@ag/worker-ai';
import type { DelegationContext } from '@ag/worker-ai';
import { Channels, AgentProtocol, RequestEnvelope, ResponseEnvelope, ProtocolVersion } from '@ag/protocol';
import { IpcContext } from '../ipc/IpcContext';
import { WindowService } from './WindowService';
import { IWorkspaceService } from './IWorkspaceService';
import { IWorkspaceExecutionService } from './execution/IWorkspaceExecutionService';
import { AgentCapabilityBridgeImpl } from './AgentCapabilityBridgeImpl';
import { IntelligenceManager } from './IntelligenceManager';

const AGENT_GATEWAY_URL = process.env.AGENT_GATEWAY_URL || 'http://localhost:3001';
const AGENT_HOST_SECRET = process.env.AGENT_HOST_SECRET;
const INTERNAL_PUBLIC_KEY = process.env.INTERNAL_PUBLIC_KEY;

interface StartRequestPayload {
  workspaceId: string;
  conversationId: string;
  agentId?: string;
  prompt: string;
  providerType: any;
  providerConfig: any;
  // The renderer's own access token. Exchanged for an ephemeral, execution
  // bound agent delegation in the main process. The raw delegation token is
  // NEVER returned to the renderer and is NEVER persisted.
  accessToken?: string;
  orgId?: string;
}

export class AgentIpcService implements IService, IIpcService {
  public readonly id = ServiceIds.AgentIpc;
  public readonly dependencies = [ServiceIds.Window, ServiceIds.Workspace, ServiceIds.WorkspaceExecution, ServiceIds.Intelligence];
  private runtime: AgentRuntime;
  private windowService: WindowService;

  constructor(
    windowService: WindowService,
    workspaceService: IWorkspaceService,
    workspaceExecutionService: IWorkspaceExecutionService,
    intelligenceManager: IntelligenceManager
  ) {
    const capabilityBridge = new AgentCapabilityBridgeImpl(workspaceService, workspaceExecutionService, intelligenceManager);
    this.runtime = new AgentRuntime({ capabilityBridge });
    this.windowService = windowService;
  }

  /**
   * Exchanges the renderer's access token for an ephemeral, execution-bound
   * agent delegation at the Gateway (the sole trusted delegation issuer), then
   * cryptographically verifies it against the public key and the execution
   * binding. Only metadata (never the raw bearer token) is returned for the
   * session context. If the main process lacks the configured secrets, agent
   * execution fails closed rather than running unbound.
   */
  private async authorizeAgentExecution(workspaceId: string, accessToken: string, orgId?: string): Promise<DelegationContext> {
    if (!AGENT_HOST_SECRET) {
      throw new Error('AGENT_HOST_SECRET is not configured; agent execution host cannot exchange a delegation');
    }
    if (!INTERNAL_PUBLIC_KEY) {
      throw new Error('INTERNAL_PUBLIC_KEY is not configured; cannot verify the agent delegation');
    }

    const exchangeResponse = await fetch(`${AGENT_GATEWAY_URL}/api/v1/agent/delegations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'X-Agent-Host-Token': AGENT_HOST_SECRET,
      },
      body: JSON.stringify({ workspaceId, orgId }),
    });

    if (!exchangeResponse.ok) {
      throw new Error(`Delegation exchange failed (${exchangeResponse.status})`);
    }

    const exchanged = await exchangeResponse.json();

    // Verify before the runtime may start. The raw delegation token exists
    // only in this function's local scope and is never stored or forwarded.
    return verifyDelegationWithPublicKey(
      exchanged.delegation,
      INTERNAL_PUBLIC_KEY,
      exchanged.executionId
    );
  }

  public registerHandlers(): Array<{ channel: string; handler: (payload: any, ctx: IpcContext) => Promise<any> }> {
    return [
      {
        channel: Channels.Agent.StartRequest,
        handler: async (payload: StartRequestPayload, ctx: IpcContext) => {
          const { workspaceId, conversationId, agentId, prompt, providerType, providerConfig, accessToken, orgId } = payload;

          if (!workspaceId || !prompt) {
            throw new Error('workspaceId and prompt are required to start an agent');
          }
          if (!accessToken || typeof accessToken !== 'string') {
            throw new Error('A renderer access token is required to authorize agent execution');
          }

          // Execution host authorization: exchange the renderer token for an
          // ephemeral, execution-bound delegation and verify it. The raw
          // delegation never reaches the runtime; only metadata is used.
          const delegation = await this.authorizeAgentExecution(workspaceId, accessToken, orgId);

          const createdAgentId = this.runtime.startAgent(
            workspaceId,
            conversationId,
            prompt,
            providerType,
            providerConfig,
            (agentEvent) => {
              this.windowService.broadcast(Channels.Agent.OnEvent, agentEvent);
            },
            delegation,
            agentId
          );

          const response: ResponseEnvelope<AgentProtocol.StartResponse> = {
            version: ProtocolVersion.V1,
            requestId: ctx.requestId,
            payload: { agentId: createdAgentId }
          };
          return response;
        }
      },
      {
        channel: Channels.Agent.CancelRequest,
        handler: async (payload: { agentId: string }, ctx: IpcContext) => {
          this.runtime.cancelAgent(payload.agentId);

          const response: ResponseEnvelope<void> = {
            version: ProtocolVersion.V1,
            requestId: ctx.requestId,
            payload: undefined
          };
          return response;
        }
      },
      {
        channel: Channels.Agent.ApproveToolRequest,
        handler: async (payload: { agentId: string; approvalId: string; toolCallId: string; approved: boolean }, ctx: IpcContext) => {
          this.runtime.approveTool(
            payload.agentId,
            payload.approvalId,
            payload.toolCallId,
            payload.approved
          );

          const response: ResponseEnvelope<void> = {
            version: ProtocolVersion.V1,
            requestId: ctx.requestId,
            payload: undefined
          };
          return response;
        }
      },
      {
        channel: Channels.Agent.SnapshotRequest,
        handler: async (payload: { agentId: string }, ctx: IpcContext) => {
          const snapshot = this.runtime.getSnapshot(payload.agentId);

          const response: ResponseEnvelope<AgentProtocol.AgentSnapshot | null> = {
            version: ProtocolVersion.V1,
            requestId: ctx.requestId,
            payload: snapshot
          };
          return response;
        }
      }
    ];
  }
}