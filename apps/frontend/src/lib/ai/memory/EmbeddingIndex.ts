import { IVectorStore } from '../interfaces/Extensibility';

export class EmbeddingIndex implements IVectorStore {
  async addDocuments(docs: any[]): Promise<void> {
    // Stub
  }

  async similaritySearch(query: number[], k: number): Promise<any[]> {
    return []; // Stub
  }
}
