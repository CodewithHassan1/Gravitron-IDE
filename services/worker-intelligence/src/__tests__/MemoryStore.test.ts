import { describe, it, expect, beforeEach } from 'vitest';
import * as sqlite3 from 'sqlite3';
import { MemoryStore, EpisodicMemory, LongTermMemory } from '../MemoryStore';

describe('MemoryStore', () => {
  let db: sqlite3.Database;
  let memoryStore: MemoryStore;
  const workspaceA = 'ws-A';
  const workspaceB = 'ws-B';
  const session1 = 'session-1';

  beforeEach(async () => {
    db = new sqlite3.Database(':memory:');
    memoryStore = new MemoryStore(db);
    await memoryStore.initialize();
  });

  it('should save and retrieve episodic memory with workspace isolation', async () => {
    await memoryStore.addEpisodic(workspaceA, session1, {
      role: 'user',
      content: 'Hello A',
      timestamp: 1000,
    });

    await memoryStore.addEpisodic(workspaceB, session1, {
      role: 'user',
      content: 'Hello B',
      timestamp: 1000,
    });

    const memoriesA = await memoryStore.getEpisodic(workspaceA, session1);
    expect(memoriesA.length).toBe(1);
    expect(memoriesA[0].content).toBe('Hello A');

    const memoriesB = await memoryStore.getEpisodic(workspaceB, session1);
    expect(memoriesB.length).toBe(1);
    expect(memoriesB[0].content).toBe('Hello B');
  });

  it('should save and retrieve long-term memory with workspace isolation', async () => {
    await memoryStore.addLongTerm(workspaceA, {
      content: 'Fact A',
      embedding: [0.1, 0.2, 0.3],
      confidence: 0.9,
      timestamp: 1000,
    });

    await memoryStore.addLongTerm(workspaceB, {
      content: 'Fact B',
      embedding: [0.4, 0.5, 0.6],
      confidence: 0.9,
      timestamp: 1000,
    });

    const memoriesA = await memoryStore.getLongTerm(workspaceA);
    expect(memoriesA.length).toBe(1);
    expect(memoriesA[0].content).toBe('Fact A');

    const memoriesB = await memoryStore.getLongTerm(workspaceB);
    expect(memoriesB.length).toBe(1);
    expect(memoriesB[0].content).toBe('Fact B');
  });

  it('should deduplicate long term memories', async () => {
    await memoryStore.addLongTerm(workspaceA, {
      content: 'Fact A',
      embedding: [0.1, 0.2, 0.3],
      confidence: 0.9,
      timestamp: 1000,
    });
    // A highly similar fact should update or ignore based on deduplication
    await memoryStore.addLongTerm(workspaceA, {
      content: 'Fact A', // identical content
      embedding: [0.1, 0.2, 0.31],
      confidence: 0.95,
      timestamp: 1001,
    });

    const memories = await memoryStore.getLongTerm(workspaceA);
    // Depending on implementation, it might update confidence or keep one
    expect(memories.length).toBe(1);
    expect(memories[0].confidence).toBe(0.95);
  });
});
