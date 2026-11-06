import { MemoryStore, EpisodicMemory } from '../MemoryStore';
import { IEmbeddingProvider } from '../domain/IEmbeddingProvider';

export class ExtractionPipeline {
  constructor(
    private readonly store: MemoryStore,
    private readonly embeddingProvider: IEmbeddingProvider,
    private readonly aiProvider: any // Simplified for this milestone
  ) {}

  public async extract(workspaceId: string, history: EpisodicMemory[]): Promise<void> {
    try {
      // 1. Analyze history using AI provider
      const prompt = `Analyze this conversation history and extract durable facts, user preferences, or learned conventions. Return ONLY a JSON object with a 'facts' array of strings:\n\n${JSON.stringify(history)}`;

      const response = await this.aiProvider.chat({
        model: 'claude-3-5-sonnet',
        messages: [{ role: 'user', content: prompt }],
      });

      const extracted = JSON.parse(response.content);
      if (!extracted.facts || !Array.isArray(extracted.facts)) return;

      // 2. Process and save each fact
      for (const fact of extracted.facts) {
        let embedding: number[] | undefined;
        try {
          embedding = await this.embeddingProvider.embed(fact);
        } catch (embedError) {
          console.warn(
            `ExtractionPipeline: Failed to embed fact "${fact}". Gracefully saving without embedding.`,
            embedError
          );
          // Graceful degradation: save without embedding
        }

        await this.store.addLongTerm(workspaceId, {
          content: fact,
          embedding,
          confidence: 0.8, // Initial confidence
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      console.error('ExtractionPipeline: Failed to extract memories', err);
      // Graceful degradation: Extraction failure should not crash the agent or IDE
    }
  }
}
