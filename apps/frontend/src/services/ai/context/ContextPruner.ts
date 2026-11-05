import { ContextItem } from './ContextCollector';
import { TokenCounter } from '../../../lib/ai/TokenCounter';

export class ContextPruner {
  static prune(items: ContextItem[], budget: number): ContextItem[] {
    const result: ContextItem[] = [];
    let currentTokens = 0;

    for (const item of items) {
      const tokens = TokenCounter.estimateTokens(item.content);
      if (currentTokens + tokens > budget) {
        // Budget exhausted, stop adding full items
        break;
      }
      result.push(item);
      currentTokens += tokens;
    }

    return result;
  }
}
