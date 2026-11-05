import { IProcess } from './types';
import { randomUUID } from 'crypto';

export type ProcessState = 'starting' | 'running' | 'exited' | 'killed';

export interface ProcessRecord {
  id: string; // The backend ProcessId
  process: IProcess;
  state: ProcessState;
  createdAt: number;
  exitCode?: number;
}

export class ProcessRegistry {
  private processes = new Map<string, ProcessRecord>();

  public register(process: IProcess): string {
    const id = randomUUID();
    const record: ProcessRecord = {
      id,
      process,
      state: 'starting',
      createdAt: Date.now(),
    };

    this.processes.set(id, record);

    // Automatically manage state
    process.onExit((code) => {
      const rec = this.processes.get(id);
      if (rec) {
        rec.state = 'exited';
        rec.exitCode = code;
      }
    });

    return id;
  }

  public get(id: string): ProcessRecord | undefined {
    return this.processes.get(id);
  }

  public updateState(id: string, state: ProcessState): void {
    const rec = this.processes.get(id);
    if (rec) rec.state = state;
  }

  public remove(id: string): void {
    const rec = this.processes.get(id);
    if (rec) {
      if (rec.state !== 'exited' && rec.state !== 'killed') {
        rec.process.kill();
      }
      this.processes.delete(id);
    }
  }

  public list(): ProcessRecord[] {
    return Array.from(this.processes.values());
  }

  public dispose(): void {
    for (const rec of this.processes.values()) {
      if (rec.state !== 'exited' && rec.state !== 'killed') {
        rec.process.kill();
      }
    }
    this.processes.clear();
  }
}
