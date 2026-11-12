import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import { validateConfig } from '@ag/config';
import { AGError } from '@ag/errors';
import { AGLogger } from '@ag/logger';
import { jwtVerify, createRemoteJWKSet, importPKCS8 } from 'jose';
import httpProxy from '@fastify/http-proxy';
import { S2SIssuer } from '@ag/auth';
import { RateLimiter, createRateLimitingPreHandler } from './rateLimiter';

const config = validateConfig(process.env);
const logger = new AGLogger('gateway', '1.0.0');

// Configured trusted proxy list.
// In production, Gateway runs on the private Docker network behind Caddy (which strictly overwrites X-Forwarded-For).
// Untrusted direct connections cannot spoof client IP.
// DEF-05: Default strictly to loopback interfaces. Never trust broad RFC 1918 subnets by default.
export const getTrustedProxies = (): string[] => {
  if (process.env.TRUSTED_PROXIES) {
    return process.env.TRUSTED_PROXIES.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return ['127.0.0.1', '::1'];
};

const fastify = Fastify({
  logger: false, // We use our custom logger middleware
  trustProxy: getTrustedProxies(),
});

let rateLimiter = new RateLimiter({
  logger,
  keyPrefix: process.env.RATE_LIMIT_KEY_PREFIX,
});
export function setRateLimiter(limiter: RateLimiter): void {
  rateLimiter = limiter;
}

const authRateLimitPreHandler = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<boolean> => {
  const handler = createRateLimitingPreHandler(rateLimiter, logger);
  return handler(request, reply);
};

let gatewayIssuer: S2SIssuer;
let externalJWKS: ReturnType<typeof createRemoteJWKSet>;
let authIssuer = 'https://auth.ag-ide.local';
let authAudience = 'ag-ide-platform';
const agentHostSecret = process.env.AGENT_HOST_SECRET || 'local-dev-host-secret';

// Register CORS plugin
fastify.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Connect-Protocol-Version',
    'Connect-Timeout-Ms',
    'X-User-Agent',
    'X-Grpc-Web',
  ],
  credentials: true,
});

// Request logging setup
fastify.addHook('onRequest', async (request: FastifyRequest, _reply: FastifyReply) => {
  request.id = (request.headers['x-request-id'] as string) || crypto.randomUUID();
  const trace_id = (request.headers['x-trace-id'] as string) || crypto.randomUUID();
  const span_id = crypto.randomUUID();

  (request as any).logCtx = {
    request_id: request.id,
    trace_id,
    span_id,
    route: request.url,
    method: request.method,
  };
  logger.info((request as any).logCtx, 'Incoming request');
});

fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
  const duration = reply.elapsedTime;
  const logCtx = (request as any).logCtx || {
    request_id: request.id,
    trace_id: 'unknown',
    span_id: 'unknown',
  };
  logger.info({ ...logCtx, duration_ms: duration }, 'Request completed');
});

// Health & Discovery Endpoints
fastify.get('/health', async () => ({ status: 'ok' }));
fastify.get('/live', async () => ({ status: 'alive' }));
fastify.get('/ready', async () => ({ status: 'ready' }));
fastify.get('/metrics', async () => 'metrics');

// JWKS endpoint proxy for standard OIDC discovery
fastify.get('/.well-known/jwks.json', async (request: FastifyRequest, reply: FastifyReply) => {
  const authUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
  try {
    const res = await fetch(`${authUrl}/.well-known/jwks.json`);
    if (!res.ok) {
      return reply.status(res.status).send({ error: 'Failed to retrieve JWKS' });
    }
    const data = await res.json();
    reply.header('Cache-Control', 'public, max-age=3600');
    return reply.send(data);
  } catch (err: any) {
    logger.error((request as any).logCtx || {}, `Failed to proxy JWKS: ${err.message}`);
    return reply.status(502).send({ error: 'Auth JWKS endpoint unavailable' });
  }
});

const PUBLIC_AUTH_ROUTES = [
  '/.well-known/jwks.json',
  '/verify-email',
  '/api/v1/auth/register',
  '/api/v1/auth/passwordLogin',
  '/api/v1/auth/refresh',
  '/api/v1/auth/forgotPassword',
  '/api/v1/auth/resetPassword',
  '/api/v1/auth/verifyEmail',
  '/api/v1/auth/resendVerification',
  '/api/v1/auth/.well-known/jwks.json',
  '/auth.v1.AuthService/Register',
  '/auth.v1.AuthService/Login',
  '/auth.v1.AuthService/PasswordLogin',
  '/auth.v1.AuthService/Refresh',
  '/auth.v1.AuthService/ForgotPassword',
  '/auth.v1.AuthService/ResetPassword',
  '/auth.v1.AuthService/VerifyEmail',
  '/auth.v1.AuthService/ResendVerification',
];

// Pre-handler hook to authenticate specific routes and inject S2S token
const authenticateAndInjectS2S = async (request: FastifyRequest, reply: FastifyReply) => {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const { payload } = await jwtVerify(token, externalJWKS, {
      issuer: authIssuer,
      audience: authAudience,
    });

    delete request.headers['x-user-id'];
    delete request.headers['x-organization-id'];
    delete request.headers['x-internal-identity'];
    delete request.headers['x-agent-delegation'];
    delete request.headers['authorization'];

    const userId = payload.sub as string;
    const orgId = (payload.org_id as string) || '';

    // Stash the externally-verified identity for downstream handlers. Identity
    // is never taken from client-provided identity headers.
    (request as any).externalContext = { userId, orgId };

    const s2sToken = await gatewayIssuer.mintS2S({ userId, orgId }, 'internal-services');
    request.headers['authorization'] = `Bearer ${s2sToken}`;
  } catch (_err) {
    reply.status(401).send({ error: 'Invalid external token' });
    return;
  }
};

// Connect-RPC Route Proxy for Auth Service (e.g. /auth.v1.AuthService/Register)
fastify.register(httpProxy, {
  upstream: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  prefix: '/auth.v1.AuthService',
  rewritePrefix: '/auth.v1.AuthService',
  preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
    const blocked = await authRateLimitPreHandler(request, reply);
    if (blocked) return;

    const path = request.url.split('?')[0];
    const isPublic = PUBLIC_AUTH_ROUTES.some((r) => path === r || path === `${r}/`);
    if (!isPublic) {
      await authenticateAndInjectS2S(request, reply);
    }
  },
});

// REST Route Proxy for Auth Service
fastify.register(httpProxy, {
  upstream: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  prefix: '/api/v1/auth',
  rewritePrefix: '/api/v1/auth',
  preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
    const blocked = await authRateLimitPreHandler(request, reply);
    if (blocked) return;

    const path = request.url.split('?')[0];
    const isPublic = PUBLIC_AUTH_ROUTES.some((r) => path === r || path === `${r}/`);
    if (!isPublic) {
      await authenticateAndInjectS2S(request, reply);
    }
  },
});

// Web Browser Link for Email Verification (clicked directly from user's email client)
fastify.get('/verify-email', async (request: FastifyRequest, reply: FastifyReply) => {
  const query = (request.query || {}) as Record<string, string | undefined>;
  const token = query?.token;

  const renderHtml = (title: string, message: string, isSuccess: boolean, currentToken?: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Gravitron IDE</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: #06080e;
      color: #f1f5f9;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      position: relative;
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
    }
    /* Ambient radiant backdrop glows */
    .glow-top {
      position: absolute;
      top: -150px;
      left: 50%;
      transform: translateX(-50%);
      width: 700px;
      height: 400px;
      background: radial-gradient(ellipse at center, rgba(99, 102, 241, 0.22) 0%, rgba(168, 85, 247, 0.12) 40%, rgba(6, 8, 14, 0) 70%);
      pointer-events: none;
      z-index: 0;
    }
    .glow-bottom {
      position: absolute;
      bottom: -150px;
      left: 50%;
      transform: translateX(-50%);
      width: 600px;
      height: 350px;
      background: radial-gradient(ellipse at center, rgba(6, 182, 212, 0.12) 0%, rgba(6, 8, 14, 0) 70%);
      pointer-events: none;
      z-index: 0;
    }
    /* Glassmorphism card */
    .auth-card {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 460px;
      background: rgba(13, 17, 28, 0.78);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-top: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 20px;
      padding: 2.75rem 2.25rem;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 40px rgba(99, 102, 241, 0.08);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      text-align: center;
      animation: cardAppear 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    @keyframes cardAppear {
      from { opacity: 0; transform: translateY(16px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    /* Antigravity floating logo */
    .logo-container {
      margin: 0 auto 1.75rem;
      width: 76px;
      height: 76px;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .logo-glow {
      position: absolute;
      inset: -6px;
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.5), rgba(168, 85, 247, 0.4), rgba(6, 182, 212, 0.5));
      border-radius: 22px;
      filter: blur(14px);
      opacity: 0.75;
      animation: pulseGlow 3s ease-in-out infinite alternate;
    }
    @keyframes pulseGlow {
      from { opacity: 0.5; filter: blur(12px); transform: scale(0.96); }
      to { opacity: 0.85; filter: blur(18px); transform: scale(1.04); }
    }
    .logo-icon {
      position: relative;
      width: 68px;
      height: 68px;
      border-radius: 18px;
      background: linear-gradient(145deg, #182032, #0d121f);
      border: 1px solid rgba(255, 255, 255, 0.14);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 10px 20px rgba(0, 0, 0, 0.4);
    }
    .logo-svg {
      width: 40px;
      height: 40px;
    }
    /* Status pill badge */
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.35rem 0.85rem;
      border-radius: 9999px;
      font-size: 0.78rem;
      font-weight: 600;
      letter-spacing: 0.02em;
      margin-bottom: 1.25rem;
      background: ${isSuccess ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)'};
      border: 1px solid ${isSuccess ? 'rgba(34, 197, 94, 0.28)' : 'rgba(239, 68, 68, 0.28)'};
      color: ${isSuccess ? '#4ade80' : '#f87171'};
    }
    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background-color: ${isSuccess ? '#22c55e' : '#ef4444'};
      box-shadow: 0 0 8px ${isSuccess ? '#22c55e' : '#ef4444'};
      animation: pulseDot 2s infinite;
    }
    @keyframes pulseDot {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }
    h1 {
      font-size: 1.6rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #ffffff;
      margin-bottom: 0.6rem;
    }
    .subtitle {
      color: #94a3b8;
      font-size: 0.92rem;
      line-height: 1.55;
      margin-bottom: 2rem;
    }
    /* Action Button */
    .btn-launch {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.6rem;
      width: 100%;
      padding: 0.85rem 1.25rem;
      background: linear-gradient(135deg, #4f46e5 0%, #6366f1 50%, #7c3aed 100%);
      color: #ffffff;
      border: none;
      border-radius: 12px;
      font-size: 0.92rem;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      box-shadow: 0 4px 16px rgba(79, 70, 229, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.1) inset;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .btn-launch:hover {
      background: linear-gradient(135deg, #4338ca 0%, #4f46e5 50%, #6d28d9 100%);
      box-shadow: 0 6px 22px rgba(79, 70, 229, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.15) inset;
      transform: translateY(-1px);
    }
    .btn-launch:active {
      transform: translateY(1px);
      box-shadow: 0 2px 8px rgba(79, 70, 229, 0.3);
    }
    /* Helper information */
    .helper-box {
      margin-top: 1.75rem;
      padding-top: 1.5rem;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      text-align: center;
    }
    .helper-text {
      color: #64748b;
      font-size: 0.82rem;
      line-height: 1.55;
    }
    .helper-text strong {
      color: #cbd5e1;
      font-weight: 600;
    }
    .footer-note {
      margin-top: 1.25rem;
      font-size: 0.78rem;
      color: #475569;
    }
  </style>
</head>
<body>
  <div class="glow-top"></div>
  <div class="glow-bottom"></div>

  <div class="auth-card">
    <div class="logo-container">
      <div class="logo-glow"></div>
      <div class="logo-icon">
        <svg class="logo-svg" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="g1" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
              <stop stop-color="#38bdf8"/>
              <stop offset="0.5" stop-color="#818cf8"/>
              <stop offset="1" stop-color="#c084fc"/>
            </linearGradient>
            <linearGradient id="g2" x1="10" y1="12" x2="30" y2="28" gradientUnits="userSpaceOnUse">
              <stop stop-color="#60a5fa"/>
              <stop offset="1" stop-color="#a855f7"/>
            </linearGradient>
          </defs>
          <path d="M20 4L34 12V28L20 36L6 28V12L20 4Z" stroke="url(#g1)" stroke-width="2.5" stroke-linejoin="round"/>
          <path d="M20 12L28 17V27L20 32L12 27V17L20 12Z" fill="url(#g2)" fill-opacity="0.35" stroke="url(#g1)" stroke-width="2"/>
          <circle cx="20" cy="22" r="3.5" fill="#ffffff" filter="drop-shadow(0 0 6px #818cf8)"/>
        </svg>
      </div>
    </div>

    <div class="status-badge">
      <span class="status-dot"></span>
      <span>${isSuccess ? 'Email Verified Successfully' : 'Verification Notice'}</span>
    </div>

    <h1>${title}</h1>
    <p class="subtitle">${message}</p>

    ${isSuccess ? `
    <button id="launchBtn" class="btn-launch" onclick="launchApp()">
      <span>Open Gravitron IDE</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
        <polyline points="15 3 21 3 21 9"></polyline>
        <line x1="10" y1="14" x2="21" y2="3"></line>
      </svg>
    </button>

    <div class="helper-box">
      <p class="helper-text">
        A browser pop-up prompt should appear asking to open <strong>Gravitron IDE</strong>.<br>
        Click <strong>Open</strong> in the prompt to continue directly to your workspace.
      </p>
      <p class="footer-note">You can safely close this browser window once the application launches.</p>
    </div>

    <script>
      const deepLink = 'gravitron://auth/callback?token=' + encodeURIComponent('${currentToken || ''}') + '&verified=true';
      function launchApp() {
        window.location.href = deepLink;
      }
      // Auto-trigger browser launch prompt
      setTimeout(launchApp, 500);
    </script>
    ` : `
    <div class="helper-box">
      <p class="helper-text">
        If you have already verified this account, return to the <strong>Gravitron IDE</strong> desktop application and sign in with your email and password.
      </p>
    </div>
    `}
  </div>
</body>
</html>`;

  if (!token) {
    reply.type('text/html').status(400);
    return renderHtml(
      'Verification Link Invalid',
      'No verification token was provided in the link. Please check your email and try again.',
      false
    );
  }

  try {
    const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
    const verifyRes = await fetch(`${authServiceUrl}/auth.v1.AuthService/VerifyEmail`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Connect-Protocol-Version': '1',
      },
      body: JSON.stringify({ token }),
    });

    if (verifyRes.ok) {
      reply.type('text/html').status(200);
      return renderHtml(
        'Welcome to Gravitron IDE',
        'Your email has been verified. Launching the desktop application...',
        true,
        token
      );
    }

    const errJson = await verifyRes.json().catch(() => ({}));
    const message = (errJson as any)?.message || 'Invalid or expired verification link.';
    reply.type('text/html').status(400);
    return renderHtml(
      'Verification Notice',
      message.includes('expired') || message.includes('Invalid')
        ? 'This verification link is invalid or has already been used. If your account is active, please sign in via Gravitron IDE.'
        : message,
      false
    );
  } catch (err) {
    reply.type('text/html').status(500);
    return renderHtml(
      'Verification Error',
      'The authentication service is temporarily unavailable. Please try again shortly.',
      false
    );
  }
});

fastify.register(httpProxy, {
  upstream: process.env.ORGANIZATION_SERVICE_URL || 'http://localhost:3002',
  prefix: '/organization.v1.OrganizationService',
  rewritePrefix: '/organization.v1.OrganizationService',
  preHandler: authenticateAndInjectS2S,
});

fastify.register(httpProxy, {
  upstream: process.env.WORKSPACE_SERVICE_URL || 'http://localhost:3003',
  prefix: '/workspace.v1.WorkspaceService',
  rewritePrefix: '/workspace.v1.WorkspaceService',
  preHandler: authenticateAndInjectS2S,
});

fastify.register(httpProxy, {
  upstream: process.env.ORGANIZATION_SERVICE_URL || 'http://localhost:3002',
  prefix: '/api/v1/organization',
  rewritePrefix: '/api/v1/organization',
  preHandler: authenticateAndInjectS2S,
});

fastify.register(httpProxy, {
  upstream: process.env.WORKSPACE_SERVICE_URL || 'http://localhost:3003',
  prefix: '/api/v1/workspace',
  rewritePrefix: '/api/v1/workspace',
  preHandler: authenticateAndInjectS2S,
});

fastify.register(httpProxy, {
  upstream: process.env.ORCHESTRATOR_SERVICE_URL || 'http://localhost:3004',
  prefix: '/orchestrator.v1.OrchestratorService',
  rewritePrefix: '/orchestrator.v1.OrchestratorService',
  preHandler: authenticateAndInjectS2S,
});

fastify.register(httpProxy, {
  upstream: process.env.ORCHESTRATOR_SERVICE_URL || 'http://localhost:3004',
  prefix: '/api/v1/orchestrator',
  rewritePrefix: '/api/v1/orchestrator',
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

const orchestratorUrl = () => process.env.ORCHESTRATOR_SERVICE_URL || 'http://localhost:3004';
const workerUrl = () => process.env.WORKER_AI_URL || 'http://localhost:3005';

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
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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
    'worker-ai',
    '15m'
  );
}

// Server-side execution entry point. The delegation token is consumed
// internally and is NEVER returned to the client.
fastify.post(
  '/api/v1/agent/executions',
  { preHandler: authenticateAndInjectS2S },
  async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body || {}) as any;
    const workspaceId = body.workspaceId;
    if (!workspaceId || typeof workspaceId !== 'string') {
      return reply.status(400).send({ error: 'workspaceId is required' });
    }

    const s2sToken = (request.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const logCtx = (request as any).logCtx || {
      trace_id: 'none',
      span_id: 'none',
      request_id: request.id,
    };

    try {
      const authz = await authorizeExecution(s2sToken, {
        workspaceId,
        orgId: body.orgId,
        prompt: body.prompt,
        command: body.command,
      });

      const delegation = await mintAgentDelegation(authz);

      const workerRes = await fetch(`${workerUrl()}/api/v1/worker/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
      return reply.status(502).send({ error: 'Agent execution failed' });
    }
  }
);

// Trusted execution-host exchange. Returns the raw delegation ONLY to a
// host that proves possession of the agent host secret (e.g. the Electron
// main process). The renderer/frontend must never receive or forward a raw
// delegation token. The token is ephemeral and is never persisted.
fastify.post(
  '/api/v1/agent/delegations',
  { preHandler: authenticateAndInjectS2S },
  async (request: FastifyRequest, reply: FastifyReply) => {
    const hostToken = request.headers['x-agent-host-token'];
    if (!hostToken || hostToken !== agentHostSecret) {
      return reply.status(403).send({ error: 'Not an authorized agent execution host' });
    }

    const body = (request.body || {}) as any;
    const workspaceId = body.workspaceId;
    if (!workspaceId || typeof workspaceId !== 'string') {
      return reply.status(400).send({ error: 'workspaceId is required' });
    }

    const s2sToken = (request.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const logCtx = (request as any).logCtx || {
      trace_id: 'none',
      span_id: 'none',
      request_id: request.id,
    };

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
      return reply.status(502).send({ error: 'Delegation issuance failed' });
    }
  }
);

// Error Handler mapping to RFC 7807
fastify.setErrorHandler((error, request: FastifyRequest, reply: FastifyReply) => {
  const logCtx = (request as any).logCtx || {
    request_id: request.id,
    trace_id: 'unknown',
    span_id: 'unknown',
  };

  if (error instanceof AGError) {
    logger.error({ ...logCtx, error_code: error.code }, error.message, error);
    reply.status(error.httpStatus).send(error.toRFC7807(request.url));
    return;
  }

  logger.error(logCtx, 'Unhandled Internal Error', error);
  reply.status(500).send({
    type: 'https://ag-ide.local/errors/INTERNAL',
    title: 'INTERNAL',
    status: 500,
    detail: 'Internal Server Error',
    instance: request.url,
  });
});

/**
 * Initializes the Gateway's trust material: the sole issuer private key and
 * the external auth JWKS. Exported for testability.
 */
async function initializeTrustMaterial(): Promise<{
  issuer: S2SIssuer;
  jwks: ReturnType<typeof createRemoteJWKSet>;
  authIssuer: string;
  authAudience: string;
}> {
  const gatewayPrivateKeyStr = process.env.GATEWAY_PRIVATE_KEY;
  if (!gatewayPrivateKeyStr) {
    throw new Error(
      'GATEWAY_PRIVATE_KEY is missing from environment. Cannot instantiate S2SIssuer.'
    );
  }
  const privateKey = await importPKCS8(gatewayPrivateKeyStr, 'ES256');
  const issuer = new S2SIssuer(privateKey);

  const authJwksUrl =
    process.env.AUTH_JWKS_URL ||
    (process.env.AUTH_SERVICE_URL
      ? `${process.env.AUTH_SERVICE_URL.replace(/\/+$/, '')}/.well-known/jwks.json`
      : 'http://localhost:3001/.well-known/jwks.json');
  const jwks = createRemoteJWKSet(new URL(authJwksUrl), {
    cacheMaxAge: 3600000,
  });

  let configuredAuthIssuer = 'https://auth.ag-ide.local';
  let configuredAuthAudience = 'ag-ide-platform';
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

    await fastify.listen({ port: config.PORT, host: '0.0.0.0' });
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
export async function buildGateway(options?: {
  rateLimiter?: RateLimiter;
}): Promise<typeof fastify> {
  if (options?.rateLimiter) {
    rateLimiter = options.rateLimiter;
  }
  const trust = await initializeTrustMaterial();
  gatewayIssuer = trust.issuer;
  externalJWKS = trust.jwks;
  authIssuer = trust.authIssuer;
  authAudience = trust.authAudience;
  await fastify.ready();
  return fastify;
}

if (process.env.NODE_ENV !== 'test') {
  start();
}
