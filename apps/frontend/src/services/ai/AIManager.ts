import { ConversationManager } from './ConversationManager';
import { ProviderManager } from './ProviderManager';
import { AgentManager } from './AgentManager';
import { PromptManager } from './PromptManager';
import { MemoryManager } from './MemoryManager';
import { StreamingManager } from './StreamingManager';
import { ToolManager } from './ToolManager';

export class AIManagerImpl {
  public conversation = new ConversationManager();
  public provider = new ProviderManager();
  public agent = new AgentManager();
  public prompt = new PromptManager();
  public memory = new MemoryManager();
  public streaming = new StreamingManager();
  public tool = new ToolManager();
  
  initialize() {
    // Orchestrate setup
  }
}

export const AIManager = new AIManagerImpl();
