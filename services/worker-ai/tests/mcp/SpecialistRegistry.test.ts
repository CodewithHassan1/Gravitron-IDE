import { describe, it, expect } from 'vitest';
import { SpecialistRegistry } from '../../src/mcp/SpecialistRegistry';
import { McpToolDefinition } from '../../src/mcp/AgentRouterClient';

describe('SpecialistRegistry — Strict Allowlist and 4-Tier Tool Lifecycle', () => {
  const sampleDiscoveredTools: McpToolDefinition[] = [
    {
      name: 'softwareengineeringexpert',
      description: 'Expert software engineering analysis',
      inputSchema: { type: 'object' },
    },
    {
      name: 'sandboxcodingagent',
      description: 'Executes code in isolated sandbox',
      inputSchema: { type: 'object' },
    },
    {
      name: 'taskplanner',
      description: 'Plans task steps',
      inputSchema: { type: 'object' },
    },
    {
      name: 'constructivecritic',
      description: 'Reviews code and architecture plans',
      inputSchema: { type: 'object' },
    },
    {
      name: 'researchagent',
      description: 'Internet technical research',
      inputSchema: { type: 'object' },
    },
    {
      name: 'browsernavigationagent',
      description: 'Web navigation and form interaction',
      inputSchema: { type: 'object' },
    },
    {
      name: 'reasoningdelegationhigh',
      description: 'High-effort multi-step reasoning',
      inputSchema: { type: 'object' },
    },
    {
      name: 'wait_for_task',
      description: 'Waits for async task completion',
      inputSchema: { type: 'object' },
    },
    // Excluded / unapproved tools
    {
      name: 'exploitagent',
      description: 'Security exploitation tool',
      inputSchema: { type: 'object' },
    },
    {
      name: 'campbuddy',
      description: 'Camping trip planner',
      inputSchema: { type: 'object' },
    },
    {
      name: 'financial_agent',
      description: 'Financial analysis',
      inputSchema: { type: 'object' },
    },
    {
      name: 'stock_market',
      description: 'Stock market fundamental analysis',
      inputSchema: { type: 'object' },
    },
    {
      name: 'silpo_home_restaurant',
      description: 'Recipe and grocery planning',
      inputSchema: { type: 'object' },
    },
  ];

  it('separates discovered, approved, registered, and available tools', () => {
    const registry = new SpecialistRegistry();

    // Initially all tiers empty
    expect(registry.getDiscoveredTools().length).toBe(0);
    expect(registry.getApprovedToolNames().length).toBe(0);
    expect(registry.getRegisteredToolNames().length).toBe(0);
    expect(registry.getAvailableToolNames().length).toBe(0);

    // Ingest discovered tools
    registry.registerDiscoveredTools(sampleDiscoveredTools);

    // Discovered tier: all 13 tools
    expect(registry.getDiscoveredTools().length).toBe(13);

    // Approved tier: only 8 approved tools (7 specialists + 1 utility)
    const approved = registry.getApprovedToolNames();
    expect(approved).toContain('softwareengineeringexpert');
    expect(approved).toContain('sandboxcodingagent');
    expect(approved).toContain('taskplanner');
    expect(approved).toContain('constructivecritic');
    expect(approved).toContain('researchagent');
    expect(approved).toContain('browsernavigationagent');
    expect(approved).toContain('reasoningdelegationhigh');
    expect(approved).toContain('wait_for_task');

    // Excluded tools must NOT be approved
    expect(approved).not.toContain('exploitagent');
    expect(approved).not.toContain('campbuddy');
    expect(approved).not.toContain('financial_agent');
    expect(approved).not.toContain('stock_market');
    expect(approved).not.toContain('silpo_home_restaurant');

    // Available tier: starts with all approved tools
    expect(registry.getAvailableToolNames().length).toBe(approved.length);

    // Registered tier: still 0 until marked registered
    expect(registry.getRegisteredToolNames().length).toBe(0);
    registry.markRegistered('softwareengineeringexpert');
    expect(registry.getRegisteredToolNames()).toEqual(['softwareengineeringexpert']);
  });

  it('enforces riskLevel classification per tool function', () => {
    const registry = new SpecialistRegistry();

    // Read-only consultative analysis
    expect(registry.getToolRiskLevel('softwareengineeringexpert')).toBe('read');
    expect(registry.getToolRiskLevel('taskplanner')).toBe('read');
    expect(registry.getToolRiskLevel('constructivecritic')).toBe('read');
    expect(registry.getToolRiskLevel('researchagent')).toBe('read');
    expect(registry.getToolRiskLevel('reasoningdelegationhigh')).toBe('read');
    expect(registry.getToolRiskLevel('wait_for_task')).toBe('read');

    // Remote execution and browser navigation are classified appropriately
    expect(registry.getToolRiskLevel('sandboxcodingagent')).toBe('execute');
    expect(registry.getToolRiskLevel('browsernavigationagent')).toBe('write');
  });

  it('allows enabling and disabling approved specialists at runtime', () => {
    const registry = new SpecialistRegistry();
    registry.registerDiscoveredTools(sampleDiscoveredTools);

    expect(registry.isAvailable('softwareengineeringexpert')).toBe(true);

    // Disable specialist
    const disabled = registry.disableSpecialist('softwareengineeringexpert');
    expect(disabled).toBe(true);
    expect(registry.isAvailable('softwareengineeringexpert')).toBe(false);
    expect(registry.getAvailableToolNames()).not.toContain('softwareengineeringexpert');

    // Re-enable specialist
    const reEnabled = registry.enableSpecialist('softwareengineeringexpert');
    expect(reEnabled).toBe(true);
    expect(registry.isAvailable('softwareengineeringexpert')).toBe(true);
    expect(registry.getAvailableToolNames()).toContain('softwareengineeringexpert');

    // Cannot enable an unapproved/excluded tool
    const enabledExcluded = registry.enableSpecialist('exploitagent');
    expect(enabledExcluded).toBe(false);
    expect(registry.isAvailable('exploitagent')).toBe(false);
  });
});
