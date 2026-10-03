import { describe, it, expect, vi } from 'vitest';
import { SearchWorkspaceTool } from '../../src/tools/builtin/SearchWorkspaceTool';
import { FindDefinitionTool } from '../../src/tools/builtin/FindDefinitionTool';
import { FindReferencesTool } from '../../src/tools/builtin/FindReferencesTool';
import { AgentProtocol } from '@ag/protocol';
import { ToolRegistry } from '../../src/tools/ToolRegistry';
import * as fs from 'fs';

// Dependency boundary check: these modules should NOT be imported anywhere in the files we test
// We can assert this statically by looking at their imports using regex on the source,
// or we can just rely on Vitest and Node module cache not containing them if not explicitly imported.
// A robust way to check is to read the file contents and verify no imports of restricted modules.
it('Dependency boundary: Intelligence tools do not bypass the bridge', () => {
  const toolsDir = __dirname + '/../../src/tools/builtin';
  const searchSrc = fs.readFileSync(`${toolsDir}/SearchWorkspaceTool.ts`, 'utf-8');
  const defSrc = fs.readFileSync(`${toolsDir}/FindDefinitionTool.ts`, 'utf-8');
  const refSrc = fs.readFileSync(`${toolsDir}/FindReferencesTool.ts`, 'utf-8');

  const allSrc = searchSrc + defSrc + refSrc;

  // Tools should not import any of these
  const restrictedModules = [
    'sqlite3',
    'SQLiteStore',
    'IntelligenceManager',
    'child_process',
    'worker-intelligence'
  ];

  for (const module of restrictedModules) {
    expect(allSrc).not.toContain(module);
  }
});

describe('SearchWorkspaceTool', () => {
  const tool = new SearchWorkspaceTool();
  const mockBridge = {
    searchWorkspace: vi.fn(),
  } as unknown as AgentProtocol.IAgentCapabilityBridge;
  
  const mockContext = { workspaceId: 'trusted-ws-1' } as AgentProtocol.AgentCapabilityContext;

  it('has strict input schemas rejecting extraneous fields', () => {
    const registry = new ToolRegistry();
    registry.register(tool);

    // Valid query
    expect(() => registry.validateArguments(tool.definition.name, { query: 'test' })).not.toThrow();

    // Invalid length
    expect(() => registry.validateArguments(tool.definition.name, { query: '' })).toThrow();
    
    // Extraneous field (like workspaceId injection)
    expect(() => registry.validateArguments(tool.definition.name, { query: 'test', workspaceId: 'hacker-ws' })).toThrow();
  });

  it('calls bridge and preserves snapshot sequence', async () => {
    vi.mocked(mockBridge.searchWorkspace).mockResolvedValueOnce({
      workspaceId: 'trusted-ws-1',
      snapshotSequence: 42,
      results: [{ symbolName: 'test', kind: 'var', filePath: '/a.ts', line: 1, column: 1 }]
    });

    const res = await tool.execute({ query: 'test' }, mockBridge, mockContext);
    
    expect(mockBridge.searchWorkspace).toHaveBeenCalledWith(mockContext, 'test');
    
    const parsed = JSON.parse(res.content);
    expect(parsed.success).toBe(true);
    expect(parsed.snapshotSequence).toBe(42);
    expect(parsed.results.length).toBe(1);
    expect(parsed.workspaceId).toBeUndefined(); // Should not return workspaceId to model
  });

  it('handles bridge rejection without crashing', async () => {
    vi.mocked(mockBridge.searchWorkspace).mockRejectedValueOnce(new Error('Bridge died'));

    const res = await tool.execute({ query: 'test' }, mockBridge, mockContext);
    
    const parsed = JSON.parse(res.content);
    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe('INTELLIGENCE_QUERY_FAILED');
    expect(parsed.error.message).toBe('Bridge died');
  });
});

describe('FindDefinitionTool', () => {
  const tool = new FindDefinitionTool();
  const mockBridge = {
    findDefinition: vi.fn(),
  } as unknown as AgentProtocol.IAgentCapabilityBridge;
  
  const mockContext = { workspaceId: 'trusted-ws-1' } as AgentProtocol.AgentCapabilityContext;

  it('has strict input schemas rejecting extraneous fields', () => {
    const registry = new ToolRegistry();
    registry.register(tool);

    expect(() => registry.validateArguments(tool.definition.name, { symbolName: 'test' })).not.toThrow();
    expect(() => registry.validateArguments(tool.definition.name, { symbolName: 'test', workspaceId: 'hacker-ws' })).toThrow();
  });

  it('calls bridge and preserves snapshot sequence', async () => {
    vi.mocked(mockBridge.findDefinition).mockResolvedValueOnce({
      workspaceId: 'trusted-ws-1',
      snapshotSequence: 99,
      results: [{ symbolName: 'test', kind: 'var', filePath: '/a.ts', line: 1, column: 1 }]
    });

    const res = await tool.execute({ symbolName: 'test' }, mockBridge, mockContext);
    
    expect(mockBridge.findDefinition).toHaveBeenCalledWith(mockContext, 'test');
    
    const parsed = JSON.parse(res.content);
    expect(parsed.success).toBe(true);
    expect(parsed.snapshotSequence).toBe(99);
  });
});

describe('FindReferencesTool', () => {
  const tool = new FindReferencesTool();
  const mockBridge = {
    findReferences: vi.fn(),
  } as unknown as AgentProtocol.IAgentCapabilityBridge;
  
  const mockContext = { workspaceId: 'trusted-ws-1' } as AgentProtocol.AgentCapabilityContext;

  it('has strict input schemas rejecting extraneous fields', () => {
    const registry = new ToolRegistry();
    registry.register(tool);

    expect(() => registry.validateArguments(tool.definition.name, { symbolName: 'test' })).not.toThrow();
    expect(() => registry.validateArguments(tool.definition.name, { symbolName: 'test', workspaceId: 'hacker-ws' })).toThrow();
  });

  it('calls bridge and preserves snapshot sequence', async () => {
    vi.mocked(mockBridge.findReferences).mockResolvedValueOnce({
      workspaceId: 'trusted-ws-1',
      snapshotSequence: 105,
      results: [{ symbolName: 'test', filePath: '/b.ts', line: 5, column: 10 }]
    });

    const res = await tool.execute({ symbolName: 'test' }, mockBridge, mockContext);
    
    expect(mockBridge.findReferences).toHaveBeenCalledWith(mockContext, 'test');
    
    const parsed = JSON.parse(res.content);
    expect(parsed.success).toBe(true);
    expect(parsed.snapshotSequence).toBe(105);
  });
});
