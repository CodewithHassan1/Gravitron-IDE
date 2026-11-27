import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { generateKeyPair, exportSPKI, SignJWT } from 'jose';
import { ProtocolVersion, Channels } from '@ag/protocol';

const runtimeMock = {
  startAgent: vi.fn().mockReturnValue('agent-abc'),
  cancelAgent: vi.fn(),
  approveTool: vi.fn(),
  getSnapshot: vi.fn().mockReturnValue(null),
};

vi.mock('@ag/worker-ai', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    AgentRuntime: vi.fn().mockImplementation(() => runtimeMock),
  };
});

const MOCK_WINDOW: any = { broadcast: vi.fn() };
const MOCK_WORKSPACE: any = {
  registerHandlers: vi.fn().mockReturnValue([
    { channel: Channels.Workspace.ReadFile, handler: vi.fn().mockResolvedValue('') },
    { channel: Channels.Workspace.WriteFile, handler: vi.fn().mockResolvedValue(undefined) },
  ]),
};
const MOCK_EXECUTION: any = {};
const MOCK_INTELLIGENCE: any = {};

let delegationToken = '';
let gatewayPublicPem = '';
let exchangeRequest: any = null;

async function mintDelegation(execId: string): Promise<string> {
  const pair = await generateKeyPair('ES256', { extractable: true });
  gatewayPublicPem = await exportSPKI(pair.publicKey);
  return new SignJWT({
    purpose: 'agent_delegation',
    user_id: 'user-bob',
    org_id: 'org_alpha',
    execution_id: execId,
    scope: 'agent:execute',
  })
    .setProtectedHeader({ alg: 'ES256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .setIssuer('ag-internal-gateway')
    .setAudience('worker-ai')
    .setJti('jti-exch-1')
    .sign(pair.privateKey);
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.AGENT_GATEWAY_URL = 'http://localhost:3100';
  process.env.AGENT_HOST_SECRET = 'host-secret-for-test';
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-suite-key';

  delegationToken = await mintDelegation('exec-elect-1');
  process.env.INTERNAL_PUBLIC_KEY = gatewayPublicPem;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.endsWith('/api/v1/agent/delegations')) {
        exchangeRequest = { init, body: JSON.parse(init.body || '{}') };
        return {
          ok: true,
          status: 200,
          json: async () => ({
            delegation: delegationToken,
            executionId: 'exec-elect-1',
            userId: 'user-bob',
            orgId: 'org_alpha',
            scope: 'agent:execute',
          }),
        } as any;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    })
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('PHASE 8.3 Electron Main Process Delegation Exchange', () => {
  it('exchanges the renderer access token for a verified delegation and passes only metadata to the runtime', async () => {
    vi.resetModules();
    const { AgentIpcService } = await import('../AgentIpcService');
    const service = new AgentIpcService(
      MOCK_WINDOW,
      MOCK_WORKSPACE,
      MOCK_EXECUTION,
      MOCK_INTELLIGENCE
    );

    const startHandler = service
      .registerHandlers()
      .find((h) => h.channel === Channels.Agent.StartRequest)!;
    const ctx: any = { requestId: 'req-1' };

    const response = await startHandler.handler(
      {
        workspaceId: 'ws-1',
        conversationId: 'conv-1',
        prompt: 'summarize',
        providerType: 'anthropic',
        providerConfig: {},
        accessToken: 'renderer.access.token.xyz',
      },
      ctx
    );

    // The ephemeral delegation was obtained from the Gateway using the
    // renderer's own access token plus the execution-host secret.
    expect(exchangeRequest.init.headers['Authorization']).toBe('Bearer renderer.access.token.xyz');
    expect(exchangeRequest.init.headers['X-Agent-Host-Token']).toBe('host-secret-for-test');

    // The runtime started bound to the verified execution identity. ONLY
    // metadata reached the runtime - never a bearer credential.
    expect(runtimeMock.startAgent).toHaveBeenCalledTimes(1);
    const delegationArg = runtimeMock.startAgent.mock.calls[0][6];
    expect(delegationArg).toEqual({
      executionId: 'exec-elect-1',
      userId: 'user-bob',
      orgId: 'org_alpha',
      scope: 'agent:execute',
      jti: 'jti-exch-1',
    });

    // The renderer receives ONLY the agent id - never a raw delegation token.
    expect(response).toEqual({
      version: ProtocolVersion.V1,
      requestId: 'req-1',
      payload: { agentId: 'agent-abc' },
    });
    expect(JSON.stringify(response)).not.toContain('delegation');
    expect(JSON.stringify(response)).not.toContain('jti-exch-1');
  });

  it('fails closed when the renderer supplies no access token', async () => {
    vi.resetModules();
    const { AgentIpcService } = await import('../AgentIpcService');
    const service = new AgentIpcService(
      MOCK_WINDOW,
      MOCK_WORKSPACE,
      MOCK_EXECUTION,
      MOCK_INTELLIGENCE
    );

    const startHandler = service
      .registerHandlers()
      .find((h) => h.channel === Channels.Agent.StartRequest)!;
    await expect(
      startHandler.handler(
        {
          workspaceId: 'ws-1',
          conversationId: 'c',
          prompt: 'p',
          providerType: 'x',
          providerConfig: {},
          accessToken: '',
        },
        { requestId: 'req-2' } as any
      )
    ).rejects.toThrow('renderer access token is required');
  });

  it('handles GetProviderConfigRequest and SetProviderConfigRequest securely', async () => {
    vi.resetModules();
    const { AgentIpcService } = await import('../AgentIpcService');
    const service = new AgentIpcService(
      MOCK_WINDOW,
      MOCK_WORKSPACE,
      MOCK_EXECUTION,
      MOCK_INTELLIGENCE
    );

    const getHandler = service
      .registerHandlers()
      .find((h) => h.channel === Channels.Agent.GetProviderConfigRequest)!;
    const setHandler = service
      .registerHandlers()
      .find((h) => h.channel === Channels.Agent.SetProviderConfigRequest)!;

    // Initially active provider is gemini, and anthropic has its env key configured from beforeAll
    const initialConfig = await getHandler.handler(undefined, { requestId: 'req-get-1' } as any);
    expect(initialConfig.payload.activeProvider).toBe('gemini');
    expect(initialConfig.payload.providers.find((p: any) => p.type === 'anthropic').isConfigured).toBe(true);

    // Set OpenAI provider credentials via IPC
    const setRes = await setHandler.handler(
      {
        providerType: 'openai',
        apiKey: 'sk-new-openai-key',
        model: 'gpt-4o',
      },
      { requestId: 'req-set-1' } as any
    );
    expect(setRes.payload.success).toBe(true);
    expect(setRes.payload.isConfigured).toBe(true);

    // Verify updated config without revealing the key
    const updatedConfig = await getHandler.handler(undefined, { requestId: 'req-get-2' } as any);
    expect(updatedConfig.payload.activeProvider).toBe('openai');
    const openai = updatedConfig.payload.providers.find((p: any) => p.type === 'openai');
    expect(openai.isConfigured).toBe(true);
    expect(JSON.stringify(updatedConfig)).not.toContain('sk-new-openai-key');
  });

  it('fails with clear error when no API key is configured for unconfigured provider', async () => {
    vi.resetModules();
    delete process.env.OPENAI_API_KEY;
    const { AgentIpcService } = await import('../AgentIpcService');
    const service = new AgentIpcService(
      MOCK_WINDOW,
      MOCK_WORKSPACE,
      MOCK_EXECUTION,
      MOCK_INTELLIGENCE
    );

    const startHandler = service
      .registerHandlers()
      .find((h) => h.channel === Channels.Agent.StartRequest)!;

    await expect(
      startHandler.handler(
        {
          workspaceId: 'ws-1',
          conversationId: 'c-openai',
          prompt: 'test prompt',
          providerType: 'openai',
          providerConfig: {},
          accessToken: 'valid.token',
        },
        { requestId: 'req-openai-1' } as any
      )
    ).rejects.toThrow("No API key configured for provider 'openai'");
  });
});
