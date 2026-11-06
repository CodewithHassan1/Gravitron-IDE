import { describe, it, expect, vi } from 'vitest';
import { ExtractionPipeline } from '../pipeline/ExtractionPipeline';
import { MemoryStore } from '../MemoryStore';
import { IEmbeddingProvider } from '../domain/IEmbeddingProvider';

describe('ExtractionPipeline', () => {
  it('should extract durable facts and save to MemoryStore', async () => {
    const mockMemoryStore = {
      addLongTerm: vi.fn(),
      getLongTerm: vi.fn().mockResolvedValue([]),
    } as unknown as MemoryStore;

    const mockEmbedding = {
      embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      embedBatch: vi.fn(),
    } as unknown as IEmbeddingProvider;

    // Mock AI provider used for extraction
    const mockAiProvider = {
      chat: vi.fn().mockResolvedValue({
        content: JSON.stringify({ facts: ['The user prefers TypeScript over JavaScript.'] }),
        role: 'assistant',
      }),
    };

    const pipeline = new ExtractionPipeline(mockMemoryStore, mockEmbedding, mockAiProvider as any);

    const episodicHistory = [
      { role: 'user', content: 'I want to write this in TypeScript, I hate JS.', timestamp: 1000 },
    ];

    await pipeline.extract('workspace-1', episodicHistory);

    expect(mockAiProvider.chat).toHaveBeenCalled();
    expect(mockEmbedding.embed).toHaveBeenCalledWith(
      'The user prefers TypeScript over JavaScript.'
    );
    expect(mockMemoryStore.addLongTerm).toHaveBeenCalledWith(
      'workspace-1',
      expect.objectContaining({
        content: 'The user prefers TypeScript over JavaScript.',
        confidence: expect.any(Number),
      })
    );
  });

  it('should gracefully degrade on embedding failure', async () => {
    const mockMemoryStore = {
      addLongTerm: vi.fn(),
    } as unknown as MemoryStore;

    const mockEmbedding = {
      embed: vi.fn().mockRejectedValue(new Error('API Down')),
    } as unknown as IEmbeddingProvider;

    const mockAiProvider = {
      chat: vi.fn().mockResolvedValue({
        content: JSON.stringify({ facts: ['Some fact'] }),
        role: 'assistant',
      }),
    };

    const pipeline = new ExtractionPipeline(mockMemoryStore, mockEmbedding, mockAiProvider as any);

    const episodicHistory = [{ role: 'user', content: 'hello', timestamp: 1000 }];

    // Should not throw
    await expect(pipeline.extract('workspace-1', episodicHistory)).resolves.not.toThrow();

    // Fallback: It may save without embedding or skip. If skipped, addLongTerm isn't called.
    // Both are acceptable gracefully degraded behaviors.
  });
});
