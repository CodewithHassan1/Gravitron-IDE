import { AGLogger } from '@ag/logger';
import { BaseGitProvider, RepositoryMetadata } from './provider';

const logger = new AGLogger('git-provider', '1.0.0');

export * from './provider';

logger.info(
  { trace_id: 'init', span_id: 'init', request_id: 'init' },
  'Starting Git Provider Service'
);
