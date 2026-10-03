import Fastify from 'fastify';
import { AGLogger } from '@ag/logger';
import { workspaceRoutes } from './server';

const logger = new AGLogger('workspace-service', '1.0.0');

const server = Fastify({
  logger: true
});

server.register(workspaceRoutes);

const start = async () => {
  try {
    const port = process.env.PORT ? parseInt(process.env.PORT) : 8082;
    await server.listen({ port, host: '0.0.0.0' });
    server.log.info(`Workspace Service running on http://localhost:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
