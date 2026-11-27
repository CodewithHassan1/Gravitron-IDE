import { CommandRegistry } from '../../../lib/registries/CommandRegistry';
import { useAIStore } from '../../../stores/ide/aiStore';
import { useLayoutStore } from '../../../stores/ide/layoutStore';

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
        useLayoutStore.getState().openAgentWorkspace();
        useAIStore.getState().setChatOpen(true);
      },
    });
  });

  // Dedicated Agent Workspace toggle command
  CommandRegistry.registerCommand({
    id: 'workbench.action.toggleAgentWorkspace',
    title: 'AI: Toggle Agent Workspace',
    category: 'AI',
    handler: () => {
      useLayoutStore.getState().toggleAgentWorkspace();
    },
  });
}
