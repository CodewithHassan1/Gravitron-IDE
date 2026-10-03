import { AIProviderRegistry } from '../../platform/ai/AIProviderRegistry';
import { GlobalAIEvents, AIEventType } from '../../lib/ai/AIEvents';

export class ProviderManager {
  setActiveProvider(id: string) {
    AIProviderRegistry.setDefault(id);
    GlobalAIEvents.emit(AIEventType.ProviderChanged, { providerId: id });
  }

  getActiveProvider() {
    return AIProviderRegistry.getDefault();
  }

  getAvailableProviders() {
    return AIProviderRegistry.getAll();
  }
}
