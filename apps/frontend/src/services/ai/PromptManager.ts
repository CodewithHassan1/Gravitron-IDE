import { PromptBuilder } from '../../lib/ai/PromptBuilder';
import { GlobalAIEvents, AIEventType } from '../../lib/ai/AIEvents';

export class PromptManager {
  async buildPrompt(context: any) {
    const prompt = await PromptBuilder.build(context);
    GlobalAIEvents.emit(AIEventType.PromptBuilt, { prompt });
    return prompt;
  }
}
