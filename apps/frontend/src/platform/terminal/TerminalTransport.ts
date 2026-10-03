export interface ITransport {
  connect(): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;
  send(message: string): void;
  
  onMessage(listener: (message: string) => void): () => void;
  onClose(listener: () => void): () => void;
  onError(listener: (error: Error) => void): () => void;
}
