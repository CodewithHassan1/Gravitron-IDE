import { McpToolDefinition } from './AgentRouterClient';

export type ToolRiskLevel = 'read' | 'write' | 'execute' | 'destructive';

export class SpecialistRegistry {
  /**
   * Explicit approved specialist allowlist specified by Gravitron M8.
   */
  public static readonly APPROVED_SPECIALISTS: ReadonlySet<string> = new Set([
    'softwareengineeringexpert',
    'sandboxcodingagent',
    'taskplanner',
    'constructivecritic',
    'researchagent',
    'browsernavigationagent',
    'reasoningdelegationhigh',
    // Platform utilities necessary for specialist coordination
    'wait_for_task',
    'discover_agents',
  ]);

  /**
   * Explicitly excluded specialists (unrelated domains, dangerous tools, financial/lifestyle).
   */
  public static readonly EXCLUDED_SPECIALISTS: ReadonlySet<string> = new Set([
    'exploitagent',
    'campbuddy',
    'nexus_strategy_analyst',
    'financial_agent',
    'silpo_home_restaurant',
    'hpo_demo_echo_agent',
    'russian_website_legal_auditor',
    'smart_fridge___nutrition',
    'stock_market',
    'luraph_deobfuscator',
  ]);

  /**
   * Specific risk level mapping per specialist tool.
   * Remote analysis tools are read-only, but sandbox code execution is 'execute',
   * and browser navigation is 'write'.
   */
  public static readonly RISK_LEVEL_MAP: Record<string, ToolRiskLevel> = {
    softwareengineeringexpert: 'read',
    sandboxcodingagent: 'execute',
    taskplanner: 'read',
    constructivecritic: 'read',
    researchagent: 'read',
    browsernavigationagent: 'write',
    reasoningdelegationhigh: 'read',
    wait_for_task: 'read',
    discover_agents: 'read',
  };

  // 1. Discovered tools (all tools returned dynamically by MCP tools/list)
  private discoveredTools = new Map<string, McpToolDefinition>();

  // 2. Approved tools (subset of discovered tools matching the allowlist)
  private approvedTools = new Set<string>();

  // 3. Registered tools (tools actually registered in AJV ToolRegistry)
  private registeredTools = new Set<string>();

  // 4. Currently available tools (tools currently enabled for the agent session)
  private availableTools = new Set<string>();

  // Explicitly disabled tools
  private disabledTools = new Set<string>();

  constructor() {}

  /**
   * Ingests dynamically discovered tools from the remote MCP server.
   * Partitions discovered tools into approved tools based on the allowlist.
   * Newly approved tools are enabled by default.
   */
  public registerDiscoveredTools(tools: McpToolDefinition[]): void {
    for (const tool of tools) {
      this.discoveredTools.set(tool.name, tool);

      if (this.isApproved(tool.name)) {
        this.approvedTools.add(tool.name);
        if (!this.disabledTools.has(tool.name)) {
          this.availableTools.add(tool.name);
        }
      }
    }
  }

  /**
   * Checks whether a tool name is approved by policy and not explicitly excluded.
   */
  public isApproved(name: string): boolean {
    if (SpecialistRegistry.EXCLUDED_SPECIALISTS.has(name)) {
      return false;
    }
    return SpecialistRegistry.APPROVED_SPECIALISTS.has(name);
  }

  /**
   * Checks whether a tool name is explicitly excluded.
   */
  public isExcluded(name: string): boolean {
    return SpecialistRegistry.EXCLUDED_SPECIALISTS.has(name);
  }

  /**
   * Records that a tool has been compiled and registered into ToolRegistry.
   */
  public markRegistered(name: string): void {
    this.registeredTools.add(name);
  }

  /**
   * Allows the user or runtime to enable an approved specialist.
   */
  public enableSpecialist(name: string): boolean {
    if (!this.isApproved(name)) {
      return false;
    }
    this.disabledTools.delete(name);
    this.availableTools.add(name);
    return true;
  }

  /**
   * Allows the user or runtime to disable an approved specialist.
   */
  public disableSpecialist(name: string): boolean {
    if (!this.isApproved(name)) {
      return false;
    }
    this.disabledTools.add(name);
    this.availableTools.delete(name);
    return true;
  }

  /**
   * Checks if a specialist tool is currently available for execution.
   */
  public isAvailable(name: string): boolean {
    if (this.disabledTools.has(name) || !this.isApproved(name)) {
      return false;
    }
    if (this.discoveredTools.size > 0) {
      return this.availableTools.has(name);
    }
    return true;
  }

  /**
   * Returns all discovered tools.
   */
  public getDiscoveredTools(): McpToolDefinition[] {
    return Array.from(this.discoveredTools.values());
  }

  /**
   * Returns names of all discovered tools.
   */
  public getDiscoveredToolNames(): string[] {
    return Array.from(this.discoveredTools.keys());
  }

  /**
   * Returns names of all approved tools.
   */
  public getApprovedToolNames(): string[] {
    return Array.from(this.approvedTools);
  }

  /**
   * Returns names of all tools registered in ToolRegistry.
   */
  public getRegisteredToolNames(): string[] {
    return Array.from(this.registeredTools);
  }

  /**
   * Returns names of currently available (enabled) tools.
   */
  public getAvailableToolNames(): string[] {
    return Array.from(this.availableTools);
  }

  /**
   * Resolves the risk level for a specialist tool.
   */
  public getToolRiskLevel(name: string): ToolRiskLevel {
    return SpecialistRegistry.RISK_LEVEL_MAP[name] || 'read';
  }

  /**
   * Retrieves definition of a discovered tool.
   */
  public getToolDefinition(name: string): McpToolDefinition | undefined {
    return this.discoveredTools.get(name);
  }
}
