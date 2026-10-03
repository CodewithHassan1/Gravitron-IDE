import { IAIProvider } from './AIProvider';

class AIProviderRegistryImpl {
  private providers = new Map<string, IAIProvider>();
  private defaultProviderId: string | null = null;

  register(provider: IAIProvider) {
    this.providers.set(provider.id, provider);
    if (!this.defaultProviderId) {
      this.defaultProviderId = provider.id;
    }
  }

  get(id: string): IAIProvider | undefined {
    return this.providers.get(id);
  }

  getAll(): IAIProvider[] {
    return Array.from(this.providers.values());
  }

  getDefault(): IAIProvider {
    if (!this.defaultProviderId) throw new Error('No default AI Provider registered');
    const provider = this.providers.get(this.defaultProviderId);
    if (!provider) throw new Error('Default AI Provider not found');
    return provider;
  }

  setDefault(id: string) {
    if (!this.providers.has(id)) throw new Error(`Provider ${id} not registered`);
    this.defaultProviderId = id;
  }
}

export const AIProviderRegistry = new AIProviderRegistryImpl();
