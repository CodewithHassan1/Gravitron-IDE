export interface IAgent {
  id: string;
  name: string;
  execute(context: any): Promise<void>;
}

export interface IAgentCapability {
  id: string;
  description: string;
}

export interface IMemoryProvider {
  store(key: string, value: any): Promise<void>;
  retrieve(key: string): Promise<any>;
}

export interface IVectorStore {
  addDocuments(docs: any[]): Promise<void>;
  similaritySearch(query: number[], k: number): Promise<any[]>;
}

export interface IReranker {
  rerank(query: string, documents: any[]): Promise<any[]>;
}

export interface IReasoningEngine {
  reason(context: any): Promise<any>;
}

export interface IPlanningStrategy {
  plan(goal: string, context: any): Promise<any[]>;
}

export interface IRetriever {
  retrieve(query: string): Promise<any[]>;
}
