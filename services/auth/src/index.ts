import Fastify from 'fastify';
import { fastifyConnectPlugin } from '@connectrpc/connect-fastify';
import routes from './server';
import { initKeys, getJWKS } from './services/jwt';
import { validateConfig } from '@ag/config';
import { AGLogger } from '@ag/logger';
import { db } from '@ag/database';
import { createLocalJWKSet, importSPKI, jwtVerify } from 'jose';

const config = validateConfig(process.env);
const logger = new AGLogger('auth-service', '1.0.0');

const fastify = Fastify({
  logger: false,
});

fastify.get('/health', async () => ({ status: 'ok' }));
fastify.get('/ready', async () => ({ status: 'ready' }));
fastify.get('/live', async () => ({ status: 'alive' }));
fastify.get('/metrics', async () => 'metrics');

fastify.get('/.well-known/jwks.json', async (request, reply) => {
  reply.header('Cache-Control', 'public, max-age=3600');
  return getJWKS();
});

fastify.get('/api/v1/auth/.well-known/jwks.json', async (request, reply) => {
  reply.header('Cache-Control', 'public, max-age=3600');
  return getJWKS();
});

// Authoritative account subscription & quota lookup for Gateway
fastify.get('/api/v1/auth/entitlements', async (request, reply) => {
  const s2sHeader = request.headers.authorization;
  const userHeader = request.headers['x-external-authorization'] as string | undefined;

  let userId = '';
  let orgId = '';

  const internalPubPem = (process.env.INTERNAL_PUBLIC_KEY || '').replace(/\\n/g, '\n').trim();
  if (internalPubPem && s2sHeader?.startsWith('Bearer ')) {
    try {
      const pubKey = await importSPKI(internalPubPem, 'ES256');
      const { payload } = await jwtVerify(s2sHeader.slice(7), pubKey, {
        issuer: 'ag-internal-gateway',
        audience: 'internal-services',
      });
      if (payload.purpose !== 's2s') {
        return reply.status(401).send({ error: 'Invalid S2S credential purpose' });
      }
      userId = String(payload.user_id || '');
      orgId = String(payload.org_id || '');
    } catch {
      return reply.status(401).send({ error: 'Invalid S2S credential' });
    }
  } else if (userHeader?.startsWith('Bearer ')) {
    try {
      const jwks = createLocalJWKSet(getJWKS() as any);
      const { payload } = await jwtVerify(userHeader.slice(7), jwks, {
        issuer: process.env.AUTH_ISSUER || 'https://auth.ag-ide.local',
        audience: process.env.AUTH_AUDIENCE || 'ag-ide-platform',
      });
      userId = String(payload.sub || '');
      orgId = String(payload.org_id || '');
    } catch {
      return reply.status(401).send({ error: 'Invalid user credential' });
    }
  } else {
    return reply.status(401).send({ error: 'Missing authorization context' });
  }

  if (!userId) {
    return reply.status(401).send({ error: 'Missing subject identity' });
  }

  const user = await db
    .selectFrom('users')
    .where('id', '=', userId)
    .select(['id', 'email', 'status'])
    .executeTakeFirst();

  if (!user || user.status === 'DISABLED') {
    return reply.status(403).send({ error: 'Account not active' });
  }

  let effectiveOrgId = orgId;
  if (!effectiveOrgId || effectiveOrgId === '00000000-0000-0000-0000-000000000000') {
    const member = await db
      .selectFrom('organization_members')
      .where('user_id', '=', userId)
      .select(['organization_id'])
      .executeTakeFirst();
    if (member) effectiveOrgId = member.organization_id;
  }

  const quota = effectiveOrgId
    ? await db
        .selectFrom('quotas')
        .where('organization_id', '=', effectiveOrgId)
        .selectAll()
        .executeTakeFirst()
    : undefined;

  const billing = effectiveOrgId
    ? await db
        .selectFrom('billing_metadata')
        .where('organization_id', '=', effectiveOrgId)
        .selectAll()
        .executeTakeFirst()
    : undefined;

  return {
    accountId: user.id,
    orgId: effectiveOrgId,
    email: user.email,
    tier: quota?.tier || 'FREE',
    subscriptionStatus: billing?.subscription_status || 'INACTIVE',
    maxWorkspaces: Number(quota?.max_workspaces ?? 3),
    maxAgentTokens: Number(quota?.max_agent_tokens ?? 100000),
    tokensUsed: Number(quota?.tokens_used ?? 0),
    resetAt: quota?.reset_at ? new Date(quota.reset_at).toISOString() : undefined,
  };
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
