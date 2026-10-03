import { ConversationTree } from '../../lib/ai/Conversation';
import { GlobalAIEvents, AIEventType } from '../../lib/ai/AIEvents';

export class ConversationManager {
  private conversations = new Map<string, ConversationTree>();

  createConversation(): string {
    const id = crypto.randomUUID();
    const tree = new ConversationTree(id);
    this.conversations.set(id, tree);
    GlobalAIEvents.emit(AIEventType.ConversationStarted, { id });
    return id;
  }

  getConversation(id: string): ConversationTree | undefined {
    return this.conversations.get(id);
  }

  deleteConversation(id: string) {
    this.conversations.delete(id);
    GlobalAIEvents.emit(AIEventType.ConversationEnded, { id });
  }
}
