import { SettingsRegistry } from '../../../lib/registries/SettingsRegistry';
import { ConfigurationScope } from '../../../lib/config/ConfigurationScopes';

export function registerAISettings() {
  SettingsRegistry.register({
    id: 'ai',
    title: 'AI Assistant',
    properties: [
      { id: 'ai.provider', title: 'AI Provider', description: 'Select the active AI provider (e.g., openai, anthropic, ollama).', type: 'string', defaultValue: 'openai', category: 'AI Assistant', scope: ConfigurationScope.Machine },
      { id: 'ai.context.maxTokens', title: 'Max Context Tokens', description: 'Maximum tokens to allocate to the active prompt context.', type: 'number', defaultValue: 32000, category: 'AI Assistant', scope: ConfigurationScope.Machine },
      { id: 'ai.context.reserveTokens', title: 'Reserve Tokens', description: 'Safety margin tokens to reserve for the model output.', type: 'number', defaultValue: 20000, category: 'AI Assistant', scope: ConfigurationScope.Machine },
      { id: 'ai.telemetry.enabled', title: 'Enable AI Telemetry', description: 'Collect performance and latency metrics locally.', type: 'boolean', defaultValue: true, category: 'AI Assistant', scope: ConfigurationScope.Machine },
      { id: 'ai.approval.batchMode', title: 'Batch Approval Mode', description: 'Group tool executions together into a single approval review.', type: 'boolean', defaultValue: true, category: 'AI Assistant', scope: ConfigurationScope.Machine }
    ]
  });
}
