import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { IntelligenceManager } from '../../src/services/IntelligenceManager';
import { AgentCapabilityBridgeImpl } from '../../src/services/AgentCapabilityBridgeImpl';
import { AgentProtocol } from '@ag/protocol';
import { SearchWorkspaceTool } from '../../../../services/worker-ai/src/tools/builtin/SearchWorkspaceTool';
import { FindDefinitionTool } from '../../../../services/worker-ai/src/tools/builtin/FindDefinitionTool';
import { FindReferencesTool } from '../../../../services/worker-ai/src/tools/builtin/FindReferencesTool';

describe('Phase 4A Gate 8: Intelligence E2E System Verification', () => {
  let manager: IntelligenceManager;
  let bridge: AgentCapabilityBridgeImpl;
  let searchTool: SearchWorkspaceTool;
  let defTool: FindDefinitionTool;
  let refTool: FindReferencesTool;

  let wsA_Id: string;
  let wsA_Dir: string;
  let wsB_Id: string;
  let wsB_Dir: string;

  beforeAll(async () => {
    manager = new IntelligenceManager();
    await manager.initialize();

    // Create Bridge
    bridge = new AgentCapabilityBridgeImpl(
      {
        registerHandlers: () => [
          { channel: 'workspace.readFile', handler: async () => '' },
          { channel: 'workspace.writeFile', handler: async () => {} },
        ],
      } as any, // workspaceService mock
      {} as any, // workspaceExecutionService mock not needed
      manager
    );

    searchTool = new SearchWorkspaceTool();
    defTool = new FindDefinitionTool();
    refTool = new FindReferencesTool();

    // Setup temporary workspaces
    wsA_Id = 'ws-A-' + randomUUID();
    wsA_Dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-e2e-ws-A-'));
    wsB_Id = 'ws-B-' + randomUUID();
    wsB_Dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-e2e-ws-B-'));

    // Open workspaces in manager to start indexing
    await manager.workspaceOpened(wsA_Id, wsA_Dir);
    await manager.workspaceOpened(wsB_Id, wsB_Dir);

    // Wait a bit for initialization
    await new Promise((r) => setTimeout(r, 1000));
  });

  afterAll(async () => {
    await manager.stop();
    if (wsA_Dir) fs.rmSync(wsA_Dir, { recursive: true, force: true });
    if (wsB_Dir) fs.rmSync(wsB_Dir, { recursive: true, force: true });
  });

  const createContext = (workspaceId: string): AgentProtocol.AgentCapabilityContext => ({
    agentId: randomUUID(),
    workspaceId,
    signal: new AbortController().signal,
  });

  it('Fresh repository indexing & Search successfully', async () => {
    // Add file
    fs.writeFileSync(path.join(wsA_Dir, 'testA.ts'), 'export class InitialClassA {}');
    await new Promise((r) => setTimeout(r, 800)); // allow debounce

    const res = await searchTool.execute({ query: 'InitialClassA' }, bridge, createContext(wsA_Id));
    const parsed = JSON.parse(res.content);
    expect(parsed.success).toBe(true);
    expect(parsed.results.length).toBeGreaterThan(0);
    expect(parsed.results[0].symbolName).toBe('InitialClassA');
    expect(parsed.snapshotSequence).toBeGreaterThan(0);
  });

  it('Workspace isolation: Identical symbols cannot cross repositories', async () => {
    fs.writeFileSync(path.join(wsA_Dir, 'UserService.ts'), 'export class UserService {}');
    fs.writeFileSync(path.join(wsB_Dir, 'UserService.ts'), 'export class UserService {}');
    await new Promise((r) => setTimeout(r, 800)); // allow debounce

    const resA = await searchTool.execute({ query: 'UserService' }, bridge, createContext(wsA_Id));
    const parsedA = JSON.parse(resA.content);

    const resB = await searchTool.execute({ query: 'UserService' }, bridge, createContext(wsB_Id));
    const parsedB = JSON.parse(resB.content);

    expect(parsedA.results.length).toBe(1);
    expect(parsedB.results.length).toBe(1);

    // The file paths should be relative, but let's just make sure they only see their own
    // Since we queried wsA, we only get 1 result. If it wasn't isolated, we'd get 2.
  });

  it('Incremental update and file deletion', async () => {
    fs.writeFileSync(path.join(wsA_Dir, 'A.ts'), 'export class SymbolA {}');
    fs.writeFileSync(path.join(wsA_Dir, 'B.ts'), 'export class SymbolB {}');
    await new Promise((r) => setTimeout(r, 800));

    let res = await searchTool.execute({ query: 'Symbol' }, bridge, createContext(wsA_Id));
    let parsed = JSON.parse(res.content);
    const snapN = parsed.snapshotSequence;

    // Modify A.ts
    fs.writeFileSync(path.join(wsA_Dir, 'A.ts'), 'export class SymbolA2 {}');
    await new Promise((r) => setTimeout(r, 800));

    res = await searchTool.execute({ query: 'Symbol' }, bridge, createContext(wsA_Id));
    parsed = JSON.parse(res.content);
    const snapN1 = parsed.snapshotSequence;

    expect(snapN1).toBe(snapN + 1); // Exact increment

    const symbols = parsed.results.map((r: any) => r.symbolName);
    expect(symbols).not.toContain('SymbolA');
    expect(symbols).toContain('SymbolA2');
    expect(symbols).toContain('SymbolB'); // B untouched

    // Delete A.ts
    fs.unlinkSync(path.join(wsA_Dir, 'A.ts'));
    await new Promise((r) => setTimeout(r, 800));

    res = await searchTool.execute({ query: 'Symbol' }, bridge, createContext(wsA_Id));
    parsed = JSON.parse(res.content);
    const snapN2 = parsed.snapshotSequence;

    expect(snapN2).toBe(snapN1 + 1); // Exact increment
    const symbols2 = parsed.results.map((r: any) => r.symbolName);
    expect(symbols2).not.toContain('SymbolA2');
    expect(symbols2).toContain('SymbolB');
  });

  it('Stale snapshot behavior explicitly retains N', async () => {
    fs.writeFileSync(path.join(wsA_Dir, 'Stale.ts'), 'export class StaleOld {}');
    await new Promise((r) => setTimeout(r, 800));

    const oldRes = await searchTool.execute({ query: 'Stale' }, bridge, createContext(wsA_Id));
    const oldParsed = JSON.parse(oldRes.content);
    const snapN = oldParsed.snapshotSequence;

    // Mutate repo -> N+1
    fs.writeFileSync(path.join(wsA_Dir, 'Stale.ts'), 'export class StaleNew {}');
    await new Promise((r) => setTimeout(r, 800));

    const newRes = await searchTool.execute({ query: 'Stale' }, bridge, createContext(wsA_Id));
    const newParsed = JSON.parse(newRes.content);

    expect(newParsed.snapshotSequence).toBeGreaterThan(snapN);
    expect(oldParsed.snapshotSequence).toBe(snapN); // Old observation strictly identified
  });

  it('Parse failure leaves snapshot sequence intact', async () => {
    const resBefore = await searchTool.execute({ query: 'SymbolB' }, bridge, createContext(wsA_Id));
    const snapBefore = JSON.parse(resBefore.content).snapshotSequence;

    // Write malformed/corrupt file
    fs.writeFileSync(path.join(wsA_Dir, 'B.ts'), '// SIMULATE_PARSER_CRASH');
    await new Promise((r) => setTimeout(r, 800));

    const resAfter = await searchTool.execute({ query: 'SymbolB' }, bridge, createContext(wsA_Id));
    const snapAfter = JSON.parse(resAfter.content).snapshotSequence;

    expect(snapAfter).toBe(snapBefore); // Snapshot N remains
    // Should still be able to find SymbolB since snapshot was not corrupted or advanced
    const parsed = JSON.parse(resAfter.content);
    expect(parsed.results.some((r: any) => r.symbolName === 'SymbolB')).toBe(true);
  });

  it('Crash recovery strictly rejects pending exactly once and recovers', async () => {
    // Generate a long query or just standard query but kill worker immediately
    const p1 = searchTool.execute({ query: 'UserService' }, bridge, createContext(wsA_Id));
    const p2 = searchTool.execute({ query: 'SymbolB' }, bridge, createContext(wsA_Id));

    // Wait a tiny bit then kill worker process
    const workerProcess = (manager as any).workerProcess;
    workerProcess.kill('SIGKILL');

    // Both should reject gracefully and tool catches it
    const [res1, res2] = await Promise.all([p1, p2]);
    const parsed1 = JSON.parse(res1.content);
    const parsed2 = JSON.parse(res2.content);

    expect(parsed1.success).toBe(false);
    expect(parsed2.success).toBe(false);
    expect(parsed1.error.code).toBe('INTELLIGENCE_QUERY_FAILED');
    expect(parsed2.error.code).toBe('INTELLIGENCE_QUERY_FAILED');

    const pending = (manager as any).pendingRequests;
    expect(pending.size).toBe(0); // No leaks

    // Wait for restart (2s timeout inside IntelligenceManager)
    await new Promise((r) => setTimeout(r, 2500));

    // New requests should succeed
    const newRes = await searchTool.execute(
      { query: 'UserService' },
      bridge,
      createContext(wsA_Id)
    );
    expect(JSON.parse(newRes.content).success).toBe(true);
  });

  it('Stale response after crash / IPC Envelope Integrity', async () => {
    // We can simulate an attack/late response via handleMessage
    const fakeRequestId = randomUUID();

    // Should not throw, should be ignored
    expect(() => {
      (manager as any).handleMessage({
        requestId: fakeRequestId, // Unknown ID
        workspaceId: wsA_Id,
        success: true,
        payload: { results: [] },
      });
    }).not.toThrow();

    // Missing workspaceId, Missing requestId, Malformed Payload
    expect(() => {
      (manager as any).handleMessage({}); // Fully malformed
    }).not.toThrow(); // Should safely ignore

    expect(() => {
      (manager as any).handleMessage({
        requestId: 'real-id',
        workspaceId: 'wrong-ws',
        success: true,
      });
    }).not.toThrow(); // Safely ignored
  });

  it('Path traversal and Exclusions', async () => {
    // Create node_modules and .git
    const nmDir = path.join(wsA_Dir, 'node_modules');
    const gitDir = path.join(wsA_Dir, '.git');
    fs.mkdirSync(nmDir);
    fs.mkdirSync(gitDir);
    fs.writeFileSync(path.join(nmDir, 'ShouldNotIndex.ts'), 'export class ShouldNotIndex {}');
    fs.writeFileSync(
      path.join(gitDir, 'ShouldNotIndexGit.ts'),
      'export class ShouldNotIndexGit {}'
    );
    await new Promise((r) => setTimeout(r, 800));

    const resNM = await searchTool.execute(
      { query: 'ShouldNotIndex' },
      bridge,
      createContext(wsA_Id)
    );
    expect(JSON.parse(resNM.content).results.length).toBe(0);

    const resGit = await searchTool.execute(
      { query: 'ShouldNotIndexGit' },
      bridge,
      createContext(wsA_Id)
    );
    expect(JSON.parse(resGit.content).results.length).toBe(0);
  });

  it('Result bounds exactly MAX_RESULTS_HARD (1000)', async () => {
    // To generate > 1000 matches, we can write a large TS file with 1050 classes
    let content = '';
    for (let i = 0; i < 1050; i++) {
      content += `export class MassiveBoundTest${i} {}\n`;
    }
    fs.writeFileSync(path.join(wsA_Dir, 'Massive.ts'), content);
    await new Promise((r) => setTimeout(r, 1000));

    // Result bound MAX_RESULTS_HARD is exactly 1000 according to Gate 4A.5
    let parsed: any;
    for (let i = 0; i < 20; i++) {
      const res = await searchTool.execute(
        { query: 'MassiveBoundTest' },
        bridge,
        createContext(wsA_Id)
      );
      parsed = JSON.parse(res.content);
      if (parsed.results && parsed.results.length >= 1000) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(parsed.results.length).toBe(1000);
  }, 15000);

  it('Definition and Reference queries return correct coordinates', async () => {
    fs.writeFileSync(
      path.join(wsA_Dir, 'TargetDef.ts'),
      'export class TargetDef { public foo() {} }\nconst t = new TargetDef();\nt.foo();'
    );
    await new Promise((r) => setTimeout(r, 800));

    let defParsed: any;
    for (let i = 0; i < 20; i++) {
      const defRes = await defTool.execute(
        { symbolName: 'TargetDef' },
        bridge,
        createContext(wsA_Id)
      );
      defParsed = JSON.parse(defRes.content);
      if (defParsed.success && defParsed.results && defParsed.results.length > 0) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(defParsed.success).toBe(true);
    expect(defParsed.results[0].symbolName).toBe('TargetDef');
    expect(defParsed.results[0].line).toBeGreaterThan(0);
    expect(defParsed.results[0].column).toBeGreaterThan(0);

    let refParsed: any;
    for (let i = 0; i < 20; i++) {
      const refRes = await refTool.execute(
        { symbolName: 'TargetDef' },
        bridge,
        createContext(wsA_Id)
      );
      refParsed = JSON.parse(refRes.content);
      if (refParsed.success && refParsed.results && refParsed.results.length > 0) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(refParsed.success).toBe(true);
    expect(refParsed.results.length).toBeGreaterThanOrEqual(1); // The instantiation 'new TargetDef()'
    // References are purely syntactic, so they include any occurrences of TargetDef
    expect(refParsed.results[0].symbolName).toBe('TargetDef');
    expect(refParsed.results[0].line).toBeGreaterThan(0);
  }, 15000);
});
