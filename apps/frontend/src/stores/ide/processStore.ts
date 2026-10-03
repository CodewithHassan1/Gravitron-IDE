import { create } from 'zustand';

export interface ProcessState {
  id: string; // Internal abstract process ID
  pid?: number;
  parentPid?: number;
  command: string;
  workspace: string;
  status: 'running' | 'exited' | 'terminated';
  cpu?: number;
  memory?: number;
  exitCode?: number;
  createdAt: number;
  endedAt?: number;
}

interface ProcessStoreState {
  processes: Map<string, ProcessState>;
}

interface ProcessStoreActions {
  addProcess: (process: ProcessState) => void;
  updateProcess: (id: string, updates: Partial<ProcessState>) => void;
  removeProcess: (id: string) => void;
}

export const useProcessStore = create<ProcessStoreState & ProcessStoreActions>((set) => ({
  processes: new Map(),
  
  addProcess: (process) => set((state) => {
    const newProcesses = new Map(state.processes);
    newProcesses.set(process.id, process);
    return { processes: newProcesses };
  }),

  updateProcess: (id, updates) => set((state) => {
    const newProcesses = new Map(state.processes);
    const existing = newProcesses.get(id);
    if (existing) {
      newProcesses.set(id, { ...existing, ...updates });
    }
    return { processes: newProcesses };
  }),

  removeProcess: (id) => set((state) => {
    const newProcesses = new Map(state.processes);
    newProcesses.delete(id);
    return { processes: newProcesses };
  }),
}));
