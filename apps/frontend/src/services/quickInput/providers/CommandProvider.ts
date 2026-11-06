// src/services/quickInput/providers/CommandProvider.ts
import {
  QuickInputProvider,
  QuickInputItem,
  QuickInputProviderMetadata,
} from '../../../types/quickInput';
import { CommandRegistry } from '../../../lib/registries/CommandRegistry';
import { Ranker } from '../search/Ranker';
import { TerminalIcon } from 'lucide-react';
import React from 'react';

export class CommandProvider implements QuickInputProvider {
  metadata: QuickInputProviderMetadata = {
    id: 'command',
    title: 'Show All Commands',
    prefixes: ['>'],
    priority: 100,
    supportsEmptyQuery: true, // when typing '>', it shows all commands
    supportsAsync: true,
    supportsCancellation: false,
    supportsPreview: false,
  };

  async initialize() {}
  async dispose() {}
  async refresh() {}

  async search(query: string, signal: AbortSignal): Promise<QuickInputItem[]> {
    const commands = CommandRegistry.getCommands();

    // Note: We'll filter by ContextEngine in Commit 6.
    // For now, map everything
    const items: QuickInputItem[] = commands.map((c) => ({
      id: c.id,
      label: c.title,
      description: c.category,
      icon: React.createElement(TerminalIcon, { size: 16 }),
      // @ts-ignore - 'shortcut' will be added to Command interface in Commit 6
      shortcut: c.shortcut,
      metadata: { commandId: c.id },
    }));

    return Ranker.rank(query, items, this.metadata.id);
  }

  async execute(item: QuickInputItem): Promise<void> {
    if (item.metadata?.commandId) {
      CommandRegistry.executeCommand(item.metadata.commandId);
    }
  }
}
