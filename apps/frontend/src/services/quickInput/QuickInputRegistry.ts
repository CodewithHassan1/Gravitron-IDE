// src/services/quickInput/QuickInputRegistry.ts
import { QuickInputProvider } from '../../types/quickInput';
import { QuickInputEventBus, QuickInputEventType } from './QuickInputEventBus';

class QuickInputRegistryImpl {
  private providers: Map<string, QuickInputProvider> = new Map();

  registerProvider(provider: QuickInputProvider) {
    if (this.providers.has(provider.metadata.id)) {
      console.log(`[QuickInputRegistry] Provider ${provider.metadata.id} is already registered. Ignoring.`);
      return;
    }
    this.providers.set(provider.metadata.id, provider);
    provider.initialize();
  }

  unregisterProvider(id: string) {
    const provider = this.providers.get(id);
    if (provider) {
      provider.dispose();
      this.providers.delete(id);
    }
  }

  getProvider(id: string): QuickInputProvider | undefined {
    return this.providers.get(id);
  }

  getAllProviders(): QuickInputProvider[] {
    return Array.from(this.providers.values()).sort((a, b) => b.metadata.priority - a.metadata.priority);
  }
}

export const QuickInputRegistry = new QuickInputRegistryImpl();
