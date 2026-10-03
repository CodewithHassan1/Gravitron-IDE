import { IMemoryProvider } from '../interfaces/Extensibility';

export class WorkspaceMemory implements IMemoryProvider {
  private memory = new Map<string, any>();

  async store(key: string, value: any): Promise<void> {
    this.memory.set(key, value);
  }

  async retrieve(key: string): Promise<any> {
    return this.memory.get(key);
  }
}
