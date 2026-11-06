import { CommandRegistry } from '../../../lib/registries/CommandRegistry';
import { useAIStore } from '../../../stores/ide/aiStore';

export function registerAICommands() {
  const commands = [
    'AI Chat',
    'Ask AI',
    'Explain Code',
    'Generate Code',
    'Refactor',
    'Fix Errors',
    'Review File',
    'Review Workspace',
    'Generate Tests',
    'Explain Terminal',
    'Commit with AI',
    'Rename Symbol',
    'Generate Docs',
  ];

  commands.forEach((cmd) => {
    CommandRegistry.registerCommand({
      id: `ai.${cmd.replace(/\s+/g, '').toLowerCase()}`,
      title: `AI: ${cmd}`,
      handler: () => {
        useAIStore.getState().setChatOpen(true);
      },
    });
  });
}
