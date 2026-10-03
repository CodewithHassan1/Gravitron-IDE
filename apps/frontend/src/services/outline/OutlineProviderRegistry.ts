import { OutlineProvider } from './types';

class OutlineProviderRegistryImpl {
  private providers: OutlineProvider[] = [];

  register(provider: OutlineProvider) {
    if (!this.providers.includes(provider)) {
      this.providers.push(provider);
    }
  }

  unregister(provider: OutlineProvider) {
    this.providers = this.providers.filter(p => p !== provider);
  }

  getProviderFor(uri: string, languageId: string): OutlineProvider | null {
    // Return the first provider that can handle the URI and language.
    // In the future, we could have priority or weight here.
    return this.providers.find(p => p.canHandle(uri, languageId)) || null;
  }
}

export const OutlineProviderRegistry = new OutlineProviderRegistryImpl();
