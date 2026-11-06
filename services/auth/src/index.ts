import Fastify from 'fastify';
import { fastifyConnectPlugin } from '@connectrpc/connect-fastify';
import routes from './server';
import { initKeys } from './services/jwt';
import { validateConfig } from '@ag/config';
import { AGLogger } from '@ag/logger';

const config = validateConfig(process.env);
const logger = new AGLogger('auth-service', '1.0.0');

const fastify = Fastify({
  logger: false,
});

fastify.get('/health', async () => ({ status: 'ok' }));
fastify.get('/ready', async () => ({ status: 'ready' }));
fastify.get('/live', async () => ({ status: 'alive' }));
fastify.get('/metrics', async () => 'metrics');

import { getJWKS } from './services/jwt';
fastify.get('/.well-known/jwks.json', async (request, reply) => {
  reply.header('Cache-Control', 'public, max-age=3600');
  return getJWKS();
});

fastify.get('/api/v1/auth/.well-known/jwks.json', async (request, reply) => {
  reply.header('Cache-Control', 'public, max-age=3600');
  return getJWKS();
});

const start = async () => {
  try {
    // Initialize Crypto Keypairs before handling requests
    await initKeys();

    await fastify.register(fastifyConnectPlugin, {
      routes,
    });

    await fastify.listen({ port: config.PORT, host: '0.0.0.0' });
    console.log(`Auth Service listening on port ${config.PORT}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
