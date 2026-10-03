import { TimelineProvider } from './types';

class TimelineProviderRegistryImpl {
  private providers: Map<string, TimelineProvider> = new Map();

  register(provider: TimelineProvider) {
    if (!this.providers.has(provider.id)) {
      this.providers.set(provider.id, provider);
    }
  }

  unregister(providerId: string) {
    this.providers.delete(providerId);
  }

  getProvidersFor(uri: string): TimelineProvider[] {
    return Array.from(this.providers.values()).filter(p => p.canProvide(uri));
  }
}

export const TimelineProviderRegistry = new TimelineProviderRegistryImpl();
