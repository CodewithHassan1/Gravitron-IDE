import { ChatMessage } from '@ag/ai-providers';
import { TokenBudget } from './TokenBudget';

export interface PromptContext {
  systemSafety: string;
  projectInstructions?: string;
  claudeMd?: string;
  currentTask: string;
  retrievedMemories: { role: string; content: string }[];
  episodicHistory: { role: string; content: string }[];
}

export class PromptBuilder {
  constructor(private readonly budget: TokenBudget) {}

  public build(context: PromptContext): ChatMessage[] {
    const messages: ChatMessage[] = [];
    
    // 1. System Safety (Always included, high priority)
    let systemContent = context.systemSafety + '\n\n';
    this.budget.consume('system', context.systemSafety);

    // 2. Project Instructions
    if (context.projectInstructions && this.budget.canFit('instructions', context.projectInstructions)) {
      systemContent += `--- PROJECT INSTRUCTIONS ---\n${context.projectInstructions}\n\n`;
      this.budget.consume('instructions', context.projectInstructions);
    }

    // 3. CLAUDE.md / Rules
    if (context.claudeMd && this.budget.canFit('rules', context.claudeMd)) {
      systemContent += `--- WORKSPACE RULES ---\n${context.claudeMd}\n\n`;
      this.budget.consume('rules', context.claudeMd);
    }

    // 4. Current Task (Usually mapped as the final user message or injected into system, we inject into system here for ReAct loop instructions)
    if (this.budget.canFit('task', context.currentTask)) {
      systemContent += `--- CURRENT TASK ---\n${context.currentTask}\n\n`;
      this.budget.consume('task', context.currentTask);
    }

    // 5. Retrieved Memory / Repo Context
    let memoryContent = '';
    for (const mem of context.retrievedMemories) {
      const entry = `[Memory] ${mem.content}\n`;
      if (this.budget.canFit('retrieval', entry)) {
        memoryContent += entry;
        this.budget.consume('retrieval', entry);
      }
    }
    
    if (memoryContent) {
      systemContent += `--- RELEVANT MEMORY ---\n${memoryContent}\n`;
    }

    messages.push({ role: 'system', content: systemContent });

    // 6. Episodic History
    // We add from oldest to newest, but we must ensure we only take the most recent history that fits in the budget.
    // So we iterate backwards to select, then unshift into the final array.
    const historyMessages: ChatMessage[] = [];
    for (let i = context.episodicHistory.length - 1; i >= 0; i--) {
      const msg = context.episodicHistory[i];
      if (this.budget.canFit('history', msg.content)) {
        historyMessages.unshift({ role: msg.role as any, content: msg.content });
        this.budget.consume('history', msg.content);
      } else {
        // If we can't fit the next newest message, we truncate the rest of the history
        break;
      }
    }

    messages.push(...historyMessages);

    return messages;
  }
}
