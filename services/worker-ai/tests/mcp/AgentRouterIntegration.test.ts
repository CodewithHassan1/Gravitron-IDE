import { describe, it, expect, vi } from 'vitest';
import { AgentRuntime } from '../../src/AgentRuntime';
import { ToolInputValidationFailed } from '../../src/tools/errors';

const mockBridge: any = {
  readFile: vi.fn(),
  writeFile: vi.fn(),
  executeCommand: vi.fn(),
};

const mockContext: any = {
  workspaceId: 'ws-test',
  conversationId: 'conv-test',
  signal: new AbortController().signal,
};

describe('AgentRouter Integration with AgentRuntime & Specialist Allowlist', () => {
  it('connects to AgentRouter, dynamically discovers tools, and registers ONLY approved specialists', async () => {
    const runtime = new AgentRuntime({ capabilityBridge: mockBridge });

    const initialToolCount = runtime.getToolRegistry().getDefinitions().length;
    expect(initialToolCount).toBe(9); // 9 builtin tools

    const connection = await runtime.connectAgentRouter({
      endpoint: 'https://agent-router.org/mcp',
      timeoutMs: 20000,
    });

    expect(connection.connected).toBe(true);
    expect(connection.toolsDiscovered).toBeGreaterThanOrEqual(20);

    // 4-Tier Separation verification:
    // Discovered tools list contains all remote tools
    expect(connection.tools).toContain('discover_agents');
    expect(connection.tools).toContain('campbuddy');
    expect(connection.tools).toContain('stock_market');

    // Approved tools contains approved specialists
    expect(connection.approvedTools).toContain('softwareengineeringexpert');
    expect(connection.approvedTools).toContain('sandboxcodingagent');
    expect(connection.approvedTools).toContain('taskplanner');
    expect(connection.approvedTools).toContain('constructivecritic');
    expect(connection.approvedTools).toContain('researchagent');
    expect(connection.approvedTools).toContain('browsernavigationagent');
    expect(connection.approvedTools).toContain('reasoningdelegationhigh');

    // Excluded tools must NEVER be approved
    expect(connection.approvedTools).not.toContain('exploitagent');
    expect(connection.approvedTools).not.toContain('campbuddy');
    expect(connection.approvedTools).not.toContain('stock_market');
    expect(connection.approvedTools).not.toContain('financial_agent');
    expect(connection.approvedTools).not.toContain('silpo_home_restaurant');

    // Registered tools in AJV ToolRegistry:
    // Only approved tools are registered!
    const definitions = runtime.getToolRegistry().getDefinitions();
    const registeredNames = definitions.map((d) => d.name);

    expect(registeredNames).toContain('softwareengineeringexpert');
    expect(registeredNames).toContain('sandboxcodingagent');
    expect(registeredNames).toContain('taskplanner');
    expect(registeredNames).toContain('constructivecritic');
    expect(registeredNames).toContain('researchagent');
    expect(registeredNames).toContain('browsernavigationagent');
    expect(registeredNames).toContain('reasoningdelegationhigh');

    // Unapproved / excluded tools must NOT be registered in ToolRegistry
    expect(registeredNames).not.toContain('campbuddy');
    expect(registeredNames).not.toContain('stock_market');
    expect(registeredNames).not.toContain('financial_agent');
    expect(registeredNames).not.toContain('exploitagent');

    // Risk level classification verification:
    const sweDef = definitions.find((d) => d.name === 'softwareengineeringexpert');
    expect(sweDef?.riskLevel).toBe('read');

    const sandboxDef = definitions.find((d) => d.name === 'sandboxcodingagent');
    expect(sandboxDef?.riskLevel).toBe('execute');

    const browserDef = definitions.find((d) => d.name === 'browsernavigationagent');
    expect(browserDef?.riskLevel).toBe('write');
  }, 25000);

  it('allows the user/runtime to dynamically disable and enable approved specialists', async () => {
    const runtime = new AgentRuntime({ capabilityBridge: mockBridge });
    await runtime.connectAgentRouter({
      endpoint: 'https://agent-router.org/mcp',
      timeoutMs: 20000,
    });

    const registry = runtime.getToolRegistry();
    expect(registry.has('softwareengineeringexpert')).toBe(true);

    // Disable specialist
    const disabled = runtime.disableSpecialist('softwareengineeringexpert');
    expect(disabled).toBe(true);
    expect(registry.has('softwareengineeringexpert')).toBe(false);

    // Re-enable specialist
    const enabled = runtime.enableSpecialist('softwareengineeringexpert');
    expect(enabled).toBe(true);
    expect(registry.has('softwareengineeringexpert')).toBe(true);

    // Disallowed specialist cannot be enabled
    const invalidEnable = runtime.enableSpecialist('campbuddy');
    expect(invalidEnable).toBe(false);
    expect(registry.has('campbuddy')).toBe(false);
  }, 25000);

  it('validates tool arguments using AJV against the remote schema', async () => {
    const runtime = new AgentRuntime({ capabilityBridge: mockBridge });
    await runtime.connectAgentRouter({
      endpoint: 'https://agent-router.org/mcp',
      timeoutMs: 20000,
    });

    const registry = runtime.getToolRegistry();

    // Valid arguments should pass validation
    const validArgs = { query: 'web search', limit: 3 };
    const validated = registry.validateArguments('discover_agents', validArgs);
    expect(validated.query).toBe('web search');

    // Invalid argument types should throw ToolInputValidationFailed
    const invalidArgs = { limit: 'not-a-number' };
    expect(() => {
      registry.validateArguments('discover_agents', invalidArgs);
    }).toThrow(ToolInputValidationFailed);
  }, 25000);

  it('executes a harmless specialist tool through the ReAct tool execution boundary', async () => {
    const runtime = new AgentRuntime({ capabilityBridge: mockBridge });
    await runtime.connectAgentRouter({
      endpoint: 'https://agent-router.org/mcp',
      timeoutMs: 25000,
    });

    const tool = runtime.getToolRegistry().getTool('discover_agents');
    expect(tool).toBeDefined();

    const result = await tool.execute({ query: 'code', limit: 1 }, mockBridge, mockContext);

    expect(result).toBeDefined();
    expect(typeof result.content).toBe('string');
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.truncated).toBe(false);

    // Verify security boundary: Local bridge was NEVER called by the remote specialist
    expect(mockBridge.readFile).not.toHaveBeenCalled();
    expect(mockBridge.writeFile).not.toHaveBeenCalled();
    expect(mockBridge.executeCommand).not.toHaveBeenCalled();
  }, 35000);

  it('gracefully handles connection failure when connecting to an invalid endpoint', async () => {
    const runtime = new AgentRuntime({ capabilityBridge: mockBridge });

    const connection = await runtime.connectAgentRouter({
      endpoint: 'https://invalid-host-definitely-does-not-exist-99.org/mcp',
      timeoutMs: 3000,
    });

    expect(connection.connected).toBe(false);
    expect(connection.toolsDiscovered).toBe(0);
    expect(connection.error).toBeDefined();

    // Builtin tools remain intact
    expect(runtime.getToolRegistry().getDefinitions().length).toBe(9);
  });
});
