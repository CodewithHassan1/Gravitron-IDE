import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import { AGLogger } from '@ag/logger';
import { requireS2S, AGENT_EXECUTE_SCOPE } from '@ag/auth';
import { importSPKI } from 'jose';
import { randomUUID } from 'crypto';

const logger = new AGLogger('orchestrator', '1.0.0');
const fastify = Fastify({ logger: false });

interface AuthorizeBody {
  workspaceId?: string;
  orgId?: string;
  prompt?: string;
  command?: string;
}

const start = async () => {
  const internalPublicKeyStr = process.env.INTERNAL_PUBLIC_KEY;
  const internalJwksUrl =
    process.env.AUTH_JWKS_URL || 'http://localhost:3001/.well-known/jwks.json';
  if (!internalPublicKeyStr) {
    logger.error(
      { trace_id: 'none', span_id: 'none', request_id: 'none' },
      'INTERNAL_PUBLIC_KEY is missing from environment. Cannot verify internal credentials.'
    );
    process.exit(1);
  }
  // Verification capability only. The Orchestrator never holds a signing
  // private key; all delegation minting happens at the Gateway (sole issuer).
  const internalPublicKey = await importSPKI(internalPublicKeyStr, 'ES256');
  void internalJwksUrl;

  fastify.get('/health', async () => ({ status: 'ok' }));

  /**
   * Execution authorization boundary.
   *
   * Verifies the trusted S2S credential (Gateway-issued), binds the request
   * to the verified user/org identity, and creates the execution identity
   * that the delegation token will be bound to. Returns safe metadata only
   * (executionId/userId/orgId/scope). Never returns or logs raw tokens.
   */
  fastify.post(
    '/api/v1/orchestrator/authorize',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({ error: 'Missing S2S Token' });
      }

      const token = authHeader.split(' ')[1];
      const logCtx = {
        trace_id: (request.headers['x-trace-id'] as string) || 'none',
        span_id: 'none',
        request_id: request.id,
      };

      let s2s;
      try {
        s2s = await requireS2S(token, internalPublicKey, 'internal-services');
      } catch (err: any) {
        logger.error({ ...logCtx }, `Failed S2S validation: ${err.message}`);
        return reply.status(401).send({ error: 'Invalid S2S Token' });
      }

      // Identity is derived exclusively from the verified credential.
      const userId = s2s.user_id as string;
      const orgId = s2s.org_id as string;

      const body = (request.body || {}) as AuthorizeBody;
      if (
        !body.workspaceId ||
        typeof body.workspaceId !== 'string' ||
        body.workspaceId.length === 0
      ) {
        return reply.status(400).send({ error: 'workspaceId is required' });
      }

      // Cross-tenant guard: a caller may never target an organization other
      // than the one bound to its verified credential.
      if (body.orgId && body.orgId !== orgId) {
        logger.error(logCtx, 'Cross-tenant execution authorization rejected', undefined, { orgId });
        return reply
          .status(403)
          .send({ error: 'Requested organization does not match the authenticated organization' });
      }

      // Fresh execution identity. JWT.execution_id will equal this value for the
      // entire execution lifecycle.
      const executionId = randomUUID();

      const authorization = {
        executionId,
        userId,
        orgId,
        scope: AGENT_EXECUTE_SCOPE,
      };

      logger.info(
        { ...logCtx, user_id: userId, organization_id: orgId },
        'Execution authorized; delegation will be bound by the trusted issuer.',
        { executionId, scope: authorization.scope }
      );

      return reply.send(authorization);
    }
  );

  const port = parseInt(process.env.PORT || '3004', 10);
  await fastify.listen({ port, host: '0.0.0.0' });
  logger.info(
    { trace_id: 'none', span_id: 'none', request_id: 'none' },
    `Orchestrator listening on port ${port}`
  );
};

start();
