import { IService, IIpcService } from './IService';
import { ServiceIds } from './ServiceIds';
import { AgentRuntime } from '@ag/worker-ai';
import { Channels, AgentProtocol, RequestEnvelope, ResponseEnvelope, ProtocolVersion } from '@ag/protocol';
import { WindowService } from './WindowService';
import { IWorkspaceService } from './IWorkspaceService';
import { IWorkspaceExecutionService } from './execution/IWorkspaceExecutionService';
import { AgentCapabilityBridgeImpl } from './AgentCapabilityBridgeImpl';
import { IntelligenceManager } from './IntelligenceManager';

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

  public registerHandlers(): Array<{ channel: string; handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => Promise<any> }> {
    return [
      {
        channel: Channels.Agent.StartRequest,
        handler: async (event, request: RequestEnvelope<AgentProtocol.StartRequest & { prompt: string, providerType: any, providerConfig: any }>) => {
          const { workspaceId, conversationId, agentId, prompt, providerType, providerConfig } = request.payload;

          const createdAgentId = this.runtime.startAgent(
            workspaceId,
            conversationId,
            prompt,
            providerType,
            providerConfig,
            (agentEvent) => {
              // Broadcast to the frontend
              this.windowService.broadcast(Channels.Agent.OnEvent, agentEvent);
            },
            agentId
          );

          const response: ResponseEnvelope<AgentProtocol.StartResponse> = {
            version: ProtocolVersion.V1,
            requestId: request.requestId,
            payload: { agentId: createdAgentId }
          };
          return response;
        }
      },
      {
        channel: Channels.Agent.CancelRequest,
        handler: async (event, request: RequestEnvelope<AgentProtocol.CancelRequest>) => {
          this.runtime.cancelAgent(request.payload.agentId);

          const response: ResponseEnvelope<void> = {
            version: ProtocolVersion.V1,
            requestId: request.requestId,
            payload: undefined
          };
          return response;
        }
      },
      {
        channel: Channels.Agent.ApproveToolRequest,
        handler: async (event, request: RequestEnvelope<AgentProtocol.ApproveToolRequest>) => {
          this.runtime.approveTool(
            request.payload.agentId,
            request.payload.approvalId,
            request.payload.toolCallId,
            request.payload.approved
          );

          const response: ResponseEnvelope<void> = {
            version: ProtocolVersion.V1,
            requestId: request.requestId,
            payload: undefined
          };
          return response;
        }
      },
      {
        channel: Channels.Agent.SnapshotRequest,
        handler: async (event, request: RequestEnvelope<AgentProtocol.SnapshotRequest>) => {
          const snapshot = this.runtime.getSnapshot(request.payload.agentId);

          const response: ResponseEnvelope<AgentProtocol.AgentSnapshot | null> = {
            version: ProtocolVersion.V1,
            requestId: request.requestId,
            payload: snapshot
          };
          return response;
        }
      }
    ];
  }
}
