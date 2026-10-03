import { ConversationMemory } from '../../lib/ai/memory/ConversationMemory';
import { WorkspaceMemory } from '../../lib/ai/memory/WorkspaceMemory';
import { SemanticMemory } from '../../lib/ai/memory/SemanticMemory';

export class MemoryManager {
  // Provides centralized access to individual memory stores if needed by outside systems,
  // though primarily composed by AgentPlanner.
  public conversationMemory = new ConversationMemory();
  public workspaceMemory = new WorkspaceMemory();
  public semanticMemory = new SemanticMemory();
}
