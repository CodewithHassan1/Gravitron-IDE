import { ChatMessage } from '@ag/ai-providers';
import { TokenBudget } from './TokenBudget';

export interface PromptContext {
  systemSafety: string;
  projectInstructions?: string;
  claudeMd?: string;
  currentTask: string;
  retrievedMemories: { role: string; content: string }[];
  episodicHistory: (ChatMessage | { role: string; content: string })[];
}

export class PromptBuilder {
  constructor(private readonly budget: TokenBudget) {}

  public build(context: PromptContext): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // 1. System Safety (Always included, high priority)
    let systemContent = context.systemSafety + '\n\n';
    this.budget.consume('system', context.systemSafety);

    // 2. Project Instructions
    if (
      context.projectInstructions &&
      this.budget.canFit('instructions', context.projectInstructions)
    ) {
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
    // Groups assistant tool-call messages and their corresponding tool responses as atomic coherent groups.
    // Retains the most recent complete groups that fit within the token budget.
    const groups = this.groupHistory(context.episodicHistory);
    const selectedGroups: ChatMessage[][] = [];

    for (let g = groups.length - 1; g >= 0; g--) {
      const group = groups[g];

      let groupSerialized = '';
      for (const m of group) {
        groupSerialized += m.content;
        if (m.toolCalls) {
          groupSerialized += JSON.stringify(m.toolCalls);
        }
        if (m.toolCallId) {
          groupSerialized += m.toolCallId;
        }
      }

      if (this.budget.canFit('history', groupSerialized)) {
        selectedGroups.unshift(group);
        this.budget.consume('history', groupSerialized);
      } else {
        // Truncate all older history when a group cannot fit
        break;
      }
    }

    for (const group of selectedGroups) {
      messages.push(...group);
    }

    return messages;
  }

  /**
   * Partitions messages into coherent atomic conversation groups so tool-calls
   * and tool-responses are never separated during history truncation.
   */
  private groupHistory(
    rawMessages: (ChatMessage | { role: string; content: string })[]
  ): ChatMessage[][] {
    const groups: ChatMessage[][] = [];
    let i = 0;

    while (i < rawMessages.length) {
      const msg = rawMessages[i];
      const role = msg.role;
      const toolCalls = 'toolCalls' in msg ? msg.toolCalls : undefined;
      const toolCallId = 'toolCallId' in msg ? (msg as any).toolCallId : undefined;

      const normalizedMsg: ChatMessage = {
        role: role as any,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        toolCalls,
        toolCallId,
      };

      if (role === 'tool') {
        // Orphaned tool result without preceding assistant tool call: drop
        i++;
        continue;
      }

      if (role === 'assistant' && toolCalls && toolCalls.length > 0) {
        const expectedIds = new Set(toolCalls.map((tc) => tc.id));
        const group: ChatMessage[] = [normalizedMsg];
        let j = i + 1;

        while (j < rawMessages.length && rawMessages[j].role === 'tool') {
          const toolMsg = rawMessages[j];
          const tId = 'toolCallId' in toolMsg ? (toolMsg as any).toolCallId : undefined;
          if (tId && expectedIds.has(tId)) {
            group.push({
              role: 'tool',
              content:
                typeof toolMsg.content === 'string'
                  ? toolMsg.content
                  : JSON.stringify(toolMsg.content),
              toolCallId: tId,
            });
            expectedIds.delete(tId);
          }
          j++;
        }

        // Only retain the group if all expected tool responses were present
        if (expectedIds.size === 0) {
          groups.push(group);
        }
        i = j;
        continue;
      }

      // Normal user, assistant (without tools), or system message
      groups.push([normalizedMsg]);
      i++;
    }

    return groups;
  }
}
