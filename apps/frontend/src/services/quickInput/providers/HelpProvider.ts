// src/services/quickInput/providers/HelpProvider.ts
import {
  QuickInputProvider,
  QuickInputItem,
  QuickInputProviderMetadata,
} from '../../../types/quickInput';
import { QuickInputRegistry } from '../QuickInputRegistry';
import { QuickInputSession } from '../QuickInputSession';
import { HelpCircleIcon } from 'lucide-react';
import React from 'react';

export class HelpProvider implements QuickInputProvider {
  metadata: QuickInputProviderMetadata = {
    id: 'help',
    title: 'Help',
    prefixes: ['?'],
    priority: 1000,
    supportsEmptyQuery: true,
    supportsAsync: false,
    supportsCancellation: false,
    supportsPreview: false,
  };

  async initialize() {}
  async dispose() {}
  async refresh() {}

  async search(query: string, signal: AbortSignal): Promise<QuickInputItem[]> {
    const providers = QuickInputRegistry.getAllProviders().filter(
      (p) => p.metadata.prefixes.length > 0 && p.metadata.prefixes[0] !== ''
    );

    return providers.map((p) => {
      const prefix = p.metadata.prefixes[0];
      return {
        id: p.metadata.id,
        label: `${prefix} ${p.metadata.title}`,
        description: `Search via ${p.metadata.id} provider`,
        icon: React.createElement(HelpCircleIcon, { size: 16 }),
        metadata: { prefix },
      };
    });
  }

  async execute(item: QuickInputItem): Promise<void> {
    if (item.metadata?.prefix) {
      QuickInputSession.setOpen(true, item.metadata.prefix);
    }
  }
}
