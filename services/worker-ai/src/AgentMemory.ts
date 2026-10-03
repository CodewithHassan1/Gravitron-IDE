import { ChatMessage } from '@ag/ai-providers';
import { AgentProtocol } from '@ag/protocol';

export class AgentMemory {
  private _messages: ChatMessage[] = [];
  
  constructor(
    private readonly bridge: AgentProtocol.IAgentCapabilityBridge,
    private readonly workspaceId: string,
    private readonly sessionId: string
  ) {}

  get messages(): ReadonlyArray<ChatMessage> {
    return this._messages;
  }

  public async load(): Promise<void> {
    try {
      const context: AgentProtocol.AgentCapabilityContext = {
        agentId: this.sessionId,
        workspaceId: this.workspaceId,
        signal: new AbortController().signal
      };

      const pastMemories = await this.bridge.getEpisodicMemory(context, this.sessionId, 100);
      this._messages = pastMemories.map((m: any) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.parse(m.content)
      }));
    } catch (e) {
      console.warn('AgentMemory: Failed to load existing episodic memory', e);
    }
  }

  public async addMessage(message: ChatMessage): Promise<void> {
    // If it's a huge output, do basic substring but much larger
    if (message.role === 'tool' && typeof message.content === 'string' && message.content.length > 50_000) {
      message.content = message.content.substring(0, 50_000) + '\n...[TRUNCATED TOOL OUTPUT]';
    }
    
    this._messages.push(message);

    try {
      const context: AgentProtocol.AgentCapabilityContext = {
        agentId: this.sessionId,
        workspaceId: this.workspaceId,
        signal: new AbortController().signal
      };

      await this.bridge.addEpisodicMemory(context, this.sessionId, {
        role: message.role,
        content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
        timestamp: Date.now()
      });
    } catch (e) {
      console.error('AgentMemory: Failed to save episodic memory', e);
    }
  }

  public clear(): void {
    this._messages = [];
  }
}
