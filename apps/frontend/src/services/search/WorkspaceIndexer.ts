import { IndexService } from './IndexService';
import { CommandRegistry } from '../../lib/registries/CommandRegistry';

export class WorkspaceIndexerImpl {
  // Mock index for 100k items test
  async buildMockIndex() {
    const items = [];

    // Add commands
    const commands = CommandRegistry.getCommands();
    for (const cmd of commands) {
      items.push({
        id: `cmd_${cmd.id}`,
        type: 'command',
        title: cmd.title,
        description: cmd.category,
        metadata: { commandId: cmd.id },
      });
    }

    // No fake files / symbols injected.
    IndexService.buildIndex(items as any);
  }
}

export const WorkspaceIndexer = new WorkspaceIndexerImpl();
