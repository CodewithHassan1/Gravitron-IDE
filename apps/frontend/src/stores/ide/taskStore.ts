import { create } from 'zustand';

export interface TaskState {
  id: string;
  name: string;
  type: 'build' | 'test' | 'npm';
  status: 'pending' | 'running' | 'completed' | 'failed';
  processId?: string;
  exitCode?: number;
  createdAt: number;
}

interface TaskStoreState {
  tasks: TaskState[];
}

interface TaskStoreActions {
  addTask: (task: TaskState) => void;
  updateTask: (id: string, updates: Partial<TaskState>) => void;
}

export const useTaskStore = create<TaskStoreState & TaskStoreActions>((set) => ({
  tasks: [],

  addTask: (task) =>
    set((state) => ({
      tasks: [...state.tasks, task],
    })),

  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
}));
