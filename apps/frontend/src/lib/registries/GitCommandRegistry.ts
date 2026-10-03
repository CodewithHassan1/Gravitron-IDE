export interface GitCommand {
  id: string;
  title: string;
  execute: (...args: any[]) => Promise<void>;
}

class GitCommandRegistryImpl {
  private commands = new Map<string, GitCommand>();

  register(command: GitCommand) {
    this.commands.set(command.id, command);
  }

  get(id: string): GitCommand | undefined {
    return this.commands.get(id);
  }

  getAll(): GitCommand[] {
    return Array.from(this.commands.values());
  }

  async execute(id: string, ...args: any[]): Promise<void> {
    const cmd = this.commands.get(id);
    if (cmd) {
      await cmd.execute(...args);
    } else {
      console.warn(`Git command ${id} not found.`);
    }
  }
}

export const GitCommandRegistry = new GitCommandRegistryImpl();
