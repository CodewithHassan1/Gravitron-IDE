import { AGLogger } from '@ag/logger';
import { AIProvider, ProviderFactory, ProviderConfig, CompletionRequest, CompletionResponse, AIStreamEvent } from '@ag/ai-providers';

const logger = new AGLogger('ai-gateway', '1.0.0');

export * from '@ag/ai-providers';

logger.info({ trace_id: 'init', span_id: 'init', request_id: 'init' }, 'Starting AI Gateway Service');
