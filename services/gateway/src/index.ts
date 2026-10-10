import Fastify, { FastifyRequest, FastifyReply } from "fastify";
import cors from "@fastify/cors";
import { validateConfig } from "@ag/config";
import { AGError } from "@ag/errors";
import { AGLogger } from "@ag/logger";
import { jwtVerify, createRemoteJWKSet, importPKCS8 } from "jose";
import httpProxy from "@fastify/http-proxy";
import { S2SIssuer } from "@ag/auth";

const config = validateConfig(process.env);
const logger = new AGLogger("gateway", "1.0.0");

const fastify = Fastify({
  logger: false, // We use our custom logger middleware
});

let gatewayIssuer: S2SIssuer;
let externalJWKS: ReturnType<typeof createRemoteJWKSet>;
let authIssuer = "https://auth.ag-ide.local";
let authAudience = "ag-ide-platform";
const agentHostSecret = process.env.AGENT_HOST_SECRET || "local-dev-host-secret";

// Register CORS plugin
fastify.register(cors, {
  origin: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Connect-Protocol-Version",
    "Connect-Timeout-Ms",
    "X-User-Agent",
    "X-Grpc-Web",
  ],
  credentials: true,
});

// Request logging setup
fastify.addHook("onRequest", async (request: FastifyRequest, _reply: FastifyReply) => {
  request.id = (request.headers["x-request-id"] as string) || crypto.randomUUID();
  const trace_id = (request.headers["x-trace-id"] as string) || crypto.randomUUID();
  const span_id = crypto.randomUUID();
  
  (request as any).logCtx = {
    request_id: request.id,
    trace_id,
    span_id,
    route: request.url,
    method: request.method,
  };
  logger.info((request as any).logCtx, "Incoming request");
});

fastify.addHook("onResponse", async (request: FastifyRequest, reply: FastifyReply) => {
  const duration = reply.elapsedTime;
  const logCtx = (request as any).logCtx || { request_id: request.id, trace_id: "unknown", span_id: "unknown" };
  logger.info({ ...logCtx, duration_ms: duration }, "Request completed");
});

// Health Endpoints
fastify.get("/health", async () => ({ status: "ok" }));
fastify.get("/live", async () => ({ status: "alive" }));
fastify.get("/ready", async () => ({ status: "ready" }));
fastify.get("/metrics", async () => "metrics");

const PUBLIC_AUTH_ROUTES = [
  "/api/v1/auth/register",
  "/api/v1/auth/passwordLogin",
  "/api/v1/auth/refresh",
  "/api/v1/auth/forgotPassword",
  "/api/v1/auth/resetPassword",
  "/api/v1/auth/verifyEmail",
  "/api/v1/auth/.well-known/jwks.json",
  "/auth.v1.AuthService/Register",
  "/auth.v1.AuthService/Login",
  "/auth.v1.AuthService/PasswordLogin",
];

// Pre-handler hook to authenticate specific routes and inject S2S token
const authenticateAndInjectS2S = async (request: FastifyRequest, reply: FastifyReply) => {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    reply.status(401).send({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const { payload } = await jwtVerify(token, externalJWKS, {
      issuer: authIssuer,
      audience: authAudience,
    });

    delete request.headers["x-user-id"];
    delete request.headers["x-organization-id"];
    delete request.headers["x-internal-identity"];
    delete request.headers["x-agent-delegation"];
    delete request.headers["authorization"];

    const userId = payload.sub as string;
    const orgId = (payload.org_id as string) || "";

    // Stash the externally-verified identity for downstream handlers. Identity
    // is never taken from client-provided identity headers.
    (request as any).externalContext = { userId, orgId };

    const s2sToken = await gatewayIssuer.mintS2S({ userId, orgId }, "internal-services");
    request.headers["authorization"] = `Bearer ${s2sToken}`;
  } catch (_err) {
    reply.status(401).send({ error: "Invalid external token" });
    return;
  }
};

// Connect-RPC Route Proxy for Auth Service (e.g. /auth.v1.AuthService/Register)
fastify.register(httpProxy, {
  upstream: process.env.AUTH_SERVICE_URL || "http://localhost:3001",
  prefix: "/auth.v1.AuthService",
  rewritePrefix: "/auth.v1.AuthService",
  preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
    const isPublic = PUBLIC_AUTH_ROUTES.some((r) => request.url.startsWith(r));
    if (!isPublic) {
      await authenticateAndInjectS2S(request, reply);
    }
  },
});

// REST Route Proxy for Auth Service
fastify.register(httpProxy, {
  upstream: process.env.AUTH_SERVICE_URL || "http://localhost:3001",
  prefix: "/api/v1/auth",
  rewritePrefix: "/api/v1/auth",
  preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
    const isPublic = PUBLIC_AUTH_ROUTES.some((r) => request.url.startsWith(r));
    if (!isPublic) {
      await authenticateAndInjectS2S(request, reply);
    }
  },
});

fastify.register(httpProxy, {
  upstream: process.env.ORGANIZATION_SERVICE_URL || "http://localhost:3002",
  prefix: "/organization.v1.OrganizationService",
  rewritePrefix: "/organization.v1.OrganizationService",
  preHandler: authenticateAndInjectS2S,
});

fastify.register(httpProxy, {
  upstream: process.env.WORKSPACE_SERVICE_URL || "http://localhost:3003",
  prefix: "/workspace.v1.WorkspaceService",
  rewritePrefix: "/workspace.v1.WorkspaceService",
  preHandler: authenticateAndInjectS2S,
});

fastify.register(httpProxy, {
  upstream: process.env.ORGANIZATION_SERVICE_URL || "http://localhost:3002",
  prefix: "/api/v1/organization",
  rewritePrefix: "/api/v1/organization",
  preHandler: authenticateAndInjectS2S,
});

fastify.register(httpProxy, {
  upstream: process.env.WORKSPACE_SERVICE_URL || "http://localhost:3003",
  prefix: "/api/v1/workspace",
  rewritePrefix: "/api/v1/workspace",
  preHandler: authenticateAndInjectS2S,
});

fastify.register(httpProxy, {
  upstream: process.env.ORCHESTRATOR_SERVICE_URL || "http://localhost:3004",
  prefix: "/orchestrator.v1.OrchestratorService",
  rewritePrefix: "/orchestrator.v1.OrchestratorService",
  preHandler: authenticateAndInjectS2S,
});

fastify.register(httpProxy, {
  upstream: process.env.ORCHESTRATOR_SERVICE_URL || "http://localhost:3004",
  prefix: "/api/v1/orchestrator",
  rewritePrefix: "/api/v1/orchestrator",
  preHandler: authenticateAndInjectS2S,
});

// ---------------------------------------------------------------------------
// Agent delegation issuance (Gateway = sole trusted issuer).
//
// The Gateway is the ONLY service that possesses GATEWAY_PRIVATE_KEY. The
// Orchestrator authorizes executions; the Gateway mints the execution-bound
// delegation token. No downstream worker, execution service, or intelligence
// worker ever holds a signing private key.
// ---------------------------------------------------------------------------

const orchestratorUrl = () => process.env.ORCHESTRATOR_SERVICE_URL || "http://localhost:3004";
const workerUrl = () => process.env.WORKER_AI_URL || "http://localhost:3005";

interface ExecutionAuthorization {
  executionId: string;
  userId: string;
  orgId: string;
  scope: string;
}

async function authorizeExecution(
  s2sToken: string,
  body: { workspaceId: string; orgId?: string; prompt?: string; command?: string }
): Promise<ExecutionAuthorization> {
  const res = await fetch(`${orchestratorUrl()}/api/v1/orchestrator/authorize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${s2sToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Orchestrator authorization failed (${res.status})`);
  }
  return res.json() as Promise<ExecutionAuthorization>;
}

async function mintAgentDelegation(authz: ExecutionAuthorization): Promise<string> {
  return gatewayIssuer.mintDelegation(
    {
      userId: authz.userId,
      orgId: authz.orgId,
      executionId: authz.executionId,
      scope: authz.scope,
    },
    "worker-ai",
    "15m"
  );
}

// Server-side execution entry point. The delegation token is consumed
// internally and is NEVER returned to the client.
fastify.post(
  "/api/v1/agent/executions",
  { preHandler: authenticateAndInjectS2S },
  async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body || {}) as any;
    const workspaceId = body.workspaceId;
    if (!workspaceId || typeof workspaceId !== "string") {
      return reply.status(400).send({ error: "workspaceId is required" });
    }

    const s2sToken = (request.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const logCtx = (request as any).logCtx || { trace_id: "none", span_id: "none", request_id: request.id };

    try {
      const authz = await authorizeExecution(s2sToken, {
        workspaceId,
        orgId: body.orgId,
        prompt: body.prompt,
        command: body.command,
      });

      const delegation = await mintAgentDelegation(authz);

      const workerRes = await fetch(`${workerUrl()}/api/v1/worker/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${delegation}`,
        },
        body: JSON.stringify({
          executionId: authz.executionId,
          workspaceId,
          prompt: body.prompt,
          command: body.command,
        }),
      });

      const workerText = await workerRes.text();
      if (!workerRes.ok) {
        throw new Error(`Worker execution failed (${workerRes.status})`);
      }

      let workerResponse: unknown;
      try {
        workerResponse = workerText ? JSON.parse(workerText) : {};
      } catch {
        workerResponse = { message: workerText };
      }

      return reply.send({ executionId: authz.executionId, workerResponse });
    } catch (err: any) {
      logger.error(logCtx, `Agent execution failed: ${err.message}`);
      return reply.status(502).send({ error: "Agent execution failed" });
    }
  }
);

// Trusted execution-host exchange. Returns the raw delegation ONLY to a
// host that proves possession of the agent host secret (e.g. the Electron
// main process). The renderer/frontend must never receive or forward a raw
// delegation token. The token is ephemeral and is never persisted.
fastify.post(
  "/api/v1/agent/delegations",
  { preHandler: authenticateAndInjectS2S },
  async (request: FastifyRequest, reply: FastifyReply) => {
    const hostToken = request.headers["x-agent-host-token"];
    if (!hostToken || hostToken !== agentHostSecret) {
      return reply.status(403).send({ error: "Not an authorized agent execution host" });
    }

    const body = (request.body || {}) as any;
    const workspaceId = body.workspaceId;
    if (!workspaceId || typeof workspaceId !== "string") {
      return reply.status(400).send({ error: "workspaceId is required" });
    }

    const s2sToken = (request.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const logCtx = (request as any).logCtx || { trace_id: "none", span_id: "none", request_id: request.id };

    try {
      const authz = await authorizeExecution(s2sToken, { workspaceId, orgId: body.orgId });
      const delegation = await mintAgentDelegation(authz);

      return reply.send({
        delegation,
        executionId: authz.executionId,
        userId: authz.userId,
        orgId: authz.orgId,
        scope: authz.scope,
      });
    } catch (err: any) {
      logger.error(logCtx, `Delegation issuance failed: ${err.message}`);
      return reply.status(502).send({ error: "Delegation issuance failed" });
    }
  }
);

// Error Handler mapping to RFC 7807
fastify.setErrorHandler((error, request: FastifyRequest, reply: FastifyReply) => {
  const logCtx = (request as any).logCtx || { request_id: request.id, trace_id: "unknown", span_id: "unknown" };

  if (error instanceof AGError) {
    logger.error({ ...logCtx, error_code: error.code }, error.message, error);
    reply.status(error.httpStatus).send(error.toRFC7807(request.url));
    return;
  }

  logger.error(logCtx, "Unhandled Internal Error", error);
  reply.status(500).send({
    type: "https://ag-ide.local/errors/INTERNAL",
    title: "INTERNAL",
    status: 500,
    detail: "Internal Server Error",
    instance: request.url,
  });
});

/**
 * Initializes the Gateway's trust material: the sole issuer private key and
 * the external auth JWKS. Exported for testability.
 */
async function initializeTrustMaterial(): Promise<{ issuer: S2SIssuer; jwks: ReturnType<typeof createRemoteJWKSet>; authIssuer: string; authAudience: string }> {
  const gatewayPrivateKeyStr = process.env.GATEWAY_PRIVATE_KEY;
  if (!gatewayPrivateKeyStr) {
    throw new Error("GATEWAY_PRIVATE_KEY is missing from environment. Cannot instantiate S2SIssuer.");
  }
  const privateKey = await importPKCS8(gatewayPrivateKeyStr, "ES256");
  const issuer = new S2SIssuer(privateKey);

  const authJwksUrl = process.env.AUTH_JWKS_URL || "http://localhost:3001/.well-known/jwks.json";
  const jwks = createRemoteJWKSet(new URL(authJwksUrl), {
    cacheMaxAge: 3600000,
  });

  let configuredAuthIssuer = "https://auth.ag-ide.local";
  let configuredAuthAudience = "ag-ide-platform";
  if (process.env.AUTH_ISSUER) configuredAuthIssuer = process.env.AUTH_ISSUER;
  if (process.env.AUTH_AUDIENCE) configuredAuthAudience = process.env.AUTH_AUDIENCE;

  return { issuer, jwks, authIssuer: configuredAuthIssuer, authAudience: configuredAuthAudience };
}

const start = async () => {
  try {
    const trust = await initializeTrustMaterial();
    gatewayIssuer = trust.issuer;
    externalJWKS = trust.jwks;
    authIssuer = trust.authIssuer;
    authAudience = trust.authAudience;

    await fastify.listen({ port: config.PORT, host: "0.0.0.0" });
    console.log(`Gateway listening on port ${config.PORT}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

/**
 * Testable entry point: constructs the Gateway app with trust material
 * WITHOUT binding a port, enabling direct injection tests.
 */
export async function buildGateway(): Promise<typeof fastify> {
  const trust = await initializeTrustMaterial();
  gatewayIssuer = trust.issuer;
  externalJWKS = trust.jwks;
  authIssuer = trust.authIssuer;
  authAudience = trust.authAudience;
  await fastify.ready();
  return fastify;
}

if (process.env.NODE_ENV !== "test") {
  start();
}