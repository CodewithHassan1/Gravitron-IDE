import { AgentProtocol } from '@ag/protocol';

export class AgentManager {
  private subscription: { dispose: () => void } | null = null;
  private onEventCallback: ((event: AgentProtocol.AgentEventEnvelope) => void) | null = null;

  constructor() {
    this.subscription = (window as any).agApi?.agent?.subscribe((event: AgentProtocol.AgentEventEnvelope) => {
      if (this.onEventCallback) {
        this.onEventCallback(event);
      }
    });
  }

  onEvent(callback: (event: AgentProtocol.AgentEventEnvelope) => void) {
    this.onEventCallback = callback;
  }

  async startAgent(workspaceId: string, conversationId: string, prompt: string, providerType: any, providerConfig: any): Promise<string> {
    // The renderer's own access token authorizes the execution in the main
    // process. It is exchanged there for an ephemeral, execution-bound
    // delegation that is never returned to the renderer.
    const accessToken = localStorage.getItem('ag_access_token') || undefined;
    return await (window as any).agApi.agent.start(workspaceId, conversationId, prompt, providerType, providerConfig, accessToken);
  }

  async snapshot(agentId: string): Promise<AgentProtocol.AgentSnapshot | null> {
    return await (window as any).agApi.agent.snapshot(agentId);
  }

  approveTool(agentId: string, approvalId: string, toolCallId: string, approved: boolean) {
    (window as any).agApi.agent.approveTool(agentId, approvalId, toolCallId, approved);
  }

  cancelAgent(agentId: string) {
    (window as any).agApi.agent.cancel(agentId);
  }

  dispose() {
    if (this.subscription) {
      this.subscription.dispose();
      this.subscription = null;
    }
  }
}
