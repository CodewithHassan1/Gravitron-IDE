import { AGLogger } from '@ag/logger';
const logger = new AGLogger('worker-notification', '1.0.0');
logger.info({ trace_id: 'init', span_id: 'init', request_id: 'init' }, 'Starting worker-notification');
