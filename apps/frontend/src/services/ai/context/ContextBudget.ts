import { AIProviderRegistry } from '../../../platform/ai/AIProviderRegistry';
// import { SettingsManager } from '../../settings/SettingsManager';

export class ContextBudget {
  static getEffectiveBudget(providerId: string): number {
    // In a real implementation, providerMax comes from provider metadata
    const providerMax = 128000;

    // These would be fetched from SettingsManager:
    // SettingsManager.get('ai.context.reserveTokens')
    const safetyMargin = 20000;

    // SettingsManager.get('ai.context.maxTokens')
    const userLimit = 32000;

    return Math.min(userLimit, providerMax - safetyMargin);
  }
}
