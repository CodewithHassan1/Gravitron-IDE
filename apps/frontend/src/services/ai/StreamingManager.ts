import { GlobalAIEvents, AIEventType } from '../../lib/ai/AIEvents';
import { IAIProvider, AIMessagePayload } from '../../platform/ai/AIProvider';

export class StreamingManager {
  async handleStream(provider: IAIProvider, messages: AIMessagePayload[], streamId: string) {
    GlobalAIEvents.emit(AIEventType.StreamingStarted, { streamId });
    try {
      const stream = provider.stream(messages);
      let content = '';
      for await (const chunk of stream) {
        content += chunk;
        GlobalAIEvents.emit(AIEventType.StreamingChunk, { streamId, chunk, fullContent: content });
      }
      GlobalAIEvents.emit(AIEventType.StreamingFinished, { streamId, fullContent: content });
      return content;
    } catch (err) {
      GlobalAIEvents.emit(AIEventType.StreamingFinished, { streamId, error: err });
      throw err;
    }
  }
}
