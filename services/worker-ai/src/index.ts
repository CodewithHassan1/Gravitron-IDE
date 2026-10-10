import Fastify, { FastifyRequest, FastifyReply, FastifyInstance } from "fastify";
import { AGLogger } from "@ag/logger";
import { requireAgentDelegation } from "@ag/auth";
import { importSPKI, KeyLike } from "jose";

export { AgentRuntime } from './AgentRuntime';
export { verifyDelegationWithPublicKey, isDelegationContext } from './DelegationContext';
export type { DelegationContext } from './DelegationContext';

const logger = new AGLogger("worker-ai", "1.0.0");

interface ExecuteBody {
  executionId?: string;
  workspaceId?: string;
  prompt?: string;
  command?: string;
  // Client-supplied identity fields are NEVER authoritative. If present they
  // must match the claims derived from the verified delegation token.
  orgId?: string;
  userId?: string;
}

/**
 * Builds the Worker-AI HTTP boundary without binding a port, enabling direct
 * injection tests. The application fails closed at startup if the public
 * verification key is unavailable.
 */
export async function buildWorkerApp(): Promise<FastifyInstance> {
  const publicKeyStr = process.env.INTERNAL_PUBLIC_KEY;
  if (!publicKeyStr) {
    logger.error({ trace_id: "none", span_id: "none", request_id: "none" }, "INTERNAL_PUBLIC_KEY is missing from environment. Cannot verify delegation.");
    throw new Error("INTERNAL_PUBLIC_KEY is missing from environment. Cannot verify delegation.");
  }
  const publicKey: KeyLike = await importSPKI(publicKeyStr, "ES256");

  const fastify = Fastify({ logger: false });

  /**
   * Worker-AI delegation boundary.
   *
   * The delegation token is cryptographically verified (signature, issuer,
   * audience, expiration, purpose, execution binding) before any execution
   * is permitted or forwarded. The worker holds NO signing private key.
   * Identity is derived exclusively from the verified token.
   */
  fastify.post("/api/v1/worker/execute", async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return reply.status(401).send({ error: "Missing Agent Delegation Token" });
    }

    const token = authHeader.split(" ")[1];
    const body = (request.body || {}) as ExecuteBody;
    const logCtx = {
      trace_id: (request.headers["x-trace-id"] as string) || "none",
      span_id: "none",
      request_id: request.id,
    };

    let executionId = "";
    let userId = "";
    let orgId = "";
    try {
      // Execution binding is mandatory: the token's execution_id must equal
      // the execution identity carried in the request.
      if (!body.executionId || typeof body.executionId !== "string" || body.executionId.length === 0) {
        return reply.status(400).send({ error: "executionId is required and must match the delegation binding" });
      }

      const claims = await requireAgentDelegation(token, publicKey, "worker-ai", body.executionId);
      executionId = claims.execution_id;
      userId = claims.user_id;
      orgId = claims.org_id;

      // Tenant/identity enforcement: any client-supplied identity must match
      // the verified token claims. Client identity is never authoritative.
      if (body.orgId && body.orgId !== orgId) {
        return reply.status(403).send({ error: "Requested organization does not match the delegation" });
      }
      if (body.userId && body.userId !== userId) {
        return reply.status(403).send({ error: "Requested user does not match the delegation" });
      }
    } catch (err: any) {
      logger.error({ ...logCtx }, `Failed Delegation validation: ${err.message}`);
      return reply.status(401).send({ error: "Invalid Delegation Token" });
    }

    // Forward the execution-bound delegation to the Execution-Service, which
    // performs its own independent cryptographic verification.
    const executionServiceUrl = process.env.EXECUTION_SERVICE_URL || "http://localhost:8083";

    try {
      const response = await fetch(`${executionServiceUrl}/api/v1/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          executionId,
          orgId,
          userId,
          workspaceId: body.workspaceId || "",
          command: body.command || "",
          prompt: body.prompt || "",
        }),
      });

      if (!response.ok) {
        throw new Error(`Execution-Service returned ${response.status}`);
      }

      const execData = await response.json();
      logger.info({ ...logCtx, user_id: userId }, "Delegation verified and execution forwarded to Execution-Service.", { execution_id: executionId });
      return reply.send({ success: true, executionId, orgId, execData });
    } catch (err: any) {
      logger.error({ ...logCtx }, `Execution-Service call failed: ${err.message}`, undefined, { execution_id: executionId });
      return reply.status(502).send({ error: "Execution-Service call failed" });
    }
  });

  return fastify;
}

const start = async () => {
  const fastify = await buildWorkerApp();
  const port = parseInt(process.env.PORT || "3005", 10);
  await fastify.listen({ port, host: "0.0.0.0" });
  logger.info({ trace_id: "none", span_id: "none", request_id: "none" }, `Worker-AI listening on port ${port}`);
};

if (process.env.NODE_ENV !== "test") {
  start();
}