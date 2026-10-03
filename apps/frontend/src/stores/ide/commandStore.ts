import { create } from 'zustand';
import { Command } from '../../types/ide';

interface CommandStore {
  commands: Record<string, Command>;
  registerCommand: (command: Command) => void;
  executeCommand: (id: string) => void | Promise<void>;
  getCommandsByCategory: (category: string) => Command[];
}

export const useCommandStore = create<CommandStore>((set, get) => ({
  commands: {},
  
  registerCommand: (command: Command) => {
    set((state) => ({
      commands: {
        ...state.commands,
        [command.id]: command
      }
    }));
  },
  
  executeCommand: async (id: string) => {
    const command = get().commands[id];
    if (command) {
      await command.execute();
    } else {
      console.warn(`Command not found: ${id}`);
    }
  },
  
  getCommandsByCategory: (category: string) => {
    return Object.values(get().commands).filter(cmd => cmd.category === category);
  }
}));
