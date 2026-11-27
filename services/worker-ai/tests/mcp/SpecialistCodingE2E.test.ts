import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { AgentSession } from '../../src/AgentSession';
import { ToolRegistry } from '../../src/tools/ToolRegistry';
import { ReadFileTool } from '../../src/tools/builtin/ReadFileTool';
import { WriteFileTool } from '../../src/tools/builtin/WriteFileTool';
import { ExecuteCommandTool } from '../../src/tools/builtin/ExecuteCommandTool';
import { RepositoryMapTool } from '../../src/tools/builtin/RepositoryMapTool';
import { AgentRouterTool } from '../../src/mcp/AgentRouterTool';
import { SpecialistRegistry } from '../../src/mcp/SpecialistRegistry';
import { SpecialistLifecycleManager } from '../../src/mcp/SpecialistLifecycleManager';
import { AgentProtocol } from '@ag/protocol';
import { AIProvider, AIStreamEventType, AIStreamEvent, CompletionRequest } from '@ag/ai-providers';
import type { DelegationContext } from '../../src/DelegationContext';

/**
 * End-to-End Specialist Orchestration Acceptance Test
 *
 * Demonstrates real coding workflow (Workflows A & C):
 * 1. Inspects a real coding issue in the local workspace.
 * 2. Consults SoftwareEngineeringExpert for architectural guidance.
 * 3. Evaluates and incorporates the specialist's recommendation.
 * 4. Modifies local workspace file via capability bridge.
 * 5. Executes local test suite.
 * 6. Diagnoses test failure and corrects the implementation.
 * 7. Verifies test passes with exit code 0.
 * 8. Asserts remote specialist NEVER received local filesystem or terminal authority.
 */
describe('AI Agent Core — Specialist Orchestration & Real Coding Workflow Acceptance', () => {
  let tempWorkspaceDir: string;
  let toolRegistry: ToolRegistry;
  let emittedEvents: AgentProtocol.AgentEventEnvelope[];
  let eventEmitter: (event: AgentProtocol.AgentEventEnvelope) => void;
  let specialistBridgeAccessCount = 0;

  const delegation: DelegationContext = {
    executionId: 'exec-specialist-e2e',
    userId: 'user-specialist-e2e',
    orgId: 'org-specialist-e2e',
    scope: 'agent:execute',
    jti: 'jti-specialist-e2e',
  };

  beforeEach(() => {
    tempWorkspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-specialist-e2e-'));
    emittedEvents = [];
    eventEmitter = (event) => {
      emittedEvents.push(event);
    };
    specialistBridgeAccessCount = 0;

    // Set up real local project structure
    fs.mkdirSync(path.join(tempWorkspaceDir, 'src'), { recursive: true });

    fs.writeFileSync(
      path.join(tempWorkspaceDir, 'package.json'),
      JSON.stringify(
        {
          name: 'rate-limiter-project',
          version: '1.0.0',
          scripts: { test: 'node test.js' },
        },
        null,
        2
      ),
      'utf8'
    );

    // Initial buggy rate limiter implementation
    fs.writeFileSync(
      path.join(tempWorkspaceDir, 'src', 'rateLimiter.js'),
      `class TokenBucketRateLimiter {
  constructor(capacity, refillRatePerSecond) {
    this.capacity = capacity;
    this.refillRate = refillRatePerSecond;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  tryConsume(tokens = 1) {
    // BUG: Incorrect refill calculation without time delta
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }
}

module.exports = { TokenBucketRateLimiter };
`,
      'utf8'
    );

    // Node test runner that executes the real code and asserts behavior
    fs.writeFileSync(
      path.join(tempWorkspaceDir, 'test.js'),
      `const assert = require('assert');
const { TokenBucketRateLimiter } = require('./src/rateLimiter');

const limiter = new TokenBucketRateLimiter(5, 10);

// Should consume available tokens
assert.strictEqual(limiter.tryConsume(3), true, 'Should consume 3 tokens from capacity of 5');
assert.strictEqual(limiter.tryConsume(2), true, 'Should consume remaining 2 tokens');
assert.strictEqual(limiter.tryConsume(1), false, 'Should reject consumption when bucket is empty');

// Test refill behavior with simulated time progression
limiter.lastRefill = Date.now() - 500; // 500ms elapsed at 10 tokens/sec = 5 tokens refilled
assert.strictEqual(limiter.tryConsume(4), true, 'Should allow consumption after token refill');

console.log('ALL RATE LIMITER TESTS PASSED');
`,
      'utf8'
    );

    toolRegistry = new ToolRegistry();
    toolRegistry.register(new ReadFileTool());
    toolRegistry.register(new WriteFileTool());
    toolRegistry.register(new ExecuteCommandTool());
    toolRegistry.register(new RepositoryMapTool());
  });

  afterEach(() => {
    try {
      fs.rmSync(tempWorkspaceDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error on windows
    }
  });

  it('orchestrates specialist consultation, local code remediation, test diagnosis, and recovery', async () => {
    const registry = new SpecialistRegistry();

    // Mock remote specialist client returning expert guidance
    const mockSpecialistClient = {
      isInitialized: true,
      callTool: vi.fn().mockImplementation(async (toolName: string, args: any) => {
        if (toolName === 'softwareengineeringexpert') {
          return {
            content: [
              {
                type: 'text',
                text: [
                  'ARCHITECTURAL ANALYSIS FROM SOFTWARE ENGINEERING EXPERT:',
                  'Issue Identified: TokenBucketRateLimiter fails to update this.tokens based on the elapsed time delta before evaluating tryConsume.',
                  'Recommended Fix:',
                  '1. Calculate elapsed seconds: const now = Date.now(); const elapsedSec = (now - this.lastRefill) / 1000;',
                  '2. Add refilled tokens: this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillRate);',
                  '3. Update this.lastRefill = now;',
                  '4. Check if this.tokens >= count, subtract count, and return true; otherwise return false.',
                ].join('\n'),
              },
            ],
          };
        }
        return { content: [{ type: 'text', text: 'OK' }] };
      }),
    } as any;

    const lifecycleManager = new SpecialistLifecycleManager(mockSpecialistClient);

    const toolDef = {
      name: 'softwareengineeringexpert',
      description: 'Performs expert software engineering analysis',
      inputSchema: {
        type: 'object',
        properties: {
          payload: {
            type: 'object',
            properties: {
              task_desciption: { type: 'string' },
            },
            required: ['task_desciption'],
          },
        },
        required: ['payload'],
      },
    };
    registry.registerDiscoveredTools([toolDef]);

    const specialistTool = new AgentRouterTool(
      toolDef,
      mockSpecialistClient,
      registry,
      lifecycleManager
    );

    toolRegistry.register(specialistTool);

    // Local Capability Bridge using real filesystem and terminal commands
    const realBridge: AgentProtocol.IAgentCapabilityBridge = {
      readFile: async (_ctx, relPath) => {
        const fullPath = path.resolve(tempWorkspaceDir, relPath);
        return fs.readFileSync(fullPath, 'utf8');
      },
      writeFile: async (_ctx, relPath, content) => {
        const fullPath = path.resolve(tempWorkspaceDir, relPath);
        fs.writeFileSync(fullPath, content, 'utf8');
      },
      executeCommand: async (_ctx, command) => {
        try {
          const stdout = execSync(command, {
            cwd: tempWorkspaceDir,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          return { stdout, stderr: '', exitCode: 0 };
        } catch (err: any) {
          return {
            stdout: err.stdout ? err.stdout.toString() : '',
            stderr: err.stderr ? err.stderr.toString() : err.message,
            exitCode: typeof err.status === 'number' ? err.status : 1,
          };
        }
      },
      searchWorkspace: async () => ({ workspaceId: 'ws', snapshotSequence: 1, results: [] }),
      findDefinition: async () => ({ workspaceId: 'ws', snapshotSequence: 1, results: [] }),
      findReferences: async () => ({ workspaceId: 'ws', snapshotSequence: 1, results: [] }),
      getRepositoryMap: async () => ({
        workspaceId: 'ws',
        snapshotSequence: 1,
        results: [{ content: 'src/rateLimiter.js\ntest.js\npackage.json' }],
      }),
      semanticSearch: async () => ({ workspaceId: 'ws', snapshotSequence: 1, results: [] }),
      addEpisodicMemory: async () => {},
      getEpisodicMemory: async () => [],
      addLongTermMemory: async () => {},
      getLongTermMemory: async () => [],
      searchLongTermMemory: async () => [],
    };

    // Spy on bridge to prove remote specialist NEVER touches local bridge
    const wrappedBridge = new Proxy(realBridge, {
      get(target, prop, receiver) {
        const orig = Reflect.get(target, prop, receiver);
        if (typeof orig === 'function') {
          return function (...args: any[]) {
            const stack = new Error().stack || '';
            if (stack.includes('AgentRouterTool') || stack.includes('SpecialistLifecycle')) {
              specialistBridgeAccessCount++;
            }
            return orig.apply(target, args);
          };
        }
        return orig;
      },
    });

    // Multi-turn ReAct deterministic test provider simulating intelligent delegation
    let turn = 0;
    const testProvider: AIProvider = {
      streamChat: async function* (req: CompletionRequest) {
        turn++;

        if (turn === 1) {
          // Turn 1: Inspect repository and create initial plan
          yield {
            type: AIStreamEventType.TextDelta,
            content: 'I will first read the rate limiter implementation and test suite.',
          } as AIStreamEvent;
          yield {
            type: AIStreamEventType.ToolCallComplete,
            toolCall: {
              id: 'call-1',
              name: 'read_file',
              arguments: { path: 'src/rateLimiter.js' },
            },
          } as AIStreamEvent;
        } else if (turn === 2) {
          // Turn 2: Consult specialist SoftwareEngineeringExpert
          yield {
            type: AIStreamEventType.TextDelta,
            content:
              'The rate limiter lacks refill logic. I will consult softwareengineeringexpert for proper token bucket architecture.',
          } as AIStreamEvent;
          yield {
            type: AIStreamEventType.ToolCallComplete,
            toolCall: {
              id: 'call-2',
              name: 'softwareengineeringexpert',
              arguments: {
                payload: {
                  task_desciption:
                    'Analyze TokenBucketRateLimiter algorithm in Node.js. How should refill calculation be structured?',
                },
              },
            },
          } as AIStreamEvent;
        } else if (turn === 3) {
          // Turn 3: Incorporate recommendation, update plan, and apply initial fix (with deliberate flaw to test error diagnosis)
          yield {
            type: AIStreamEventType.TextDelta,
            content:
              'Received specialist recommendation. I will apply the token refill formula to src/rateLimiter.js and execute test.js.',
          } as AIStreamEvent;
          yield {
            type: AIStreamEventType.ToolCallComplete,
            toolCall: {
              id: 'call-3',
              name: 'write_file',
              arguments: {
                path: 'src/rateLimiter.js',
                content: `class TokenBucketRateLimiter {
  constructor(capacity, refillRatePerSecond) {
    this.capacity = capacity;
    this.refillRate = refillRatePerSecond;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  tryConsume(tokens = 1) {
    // Deliberate initial flaw: forgot to call this.refill()
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }
}

module.exports = { TokenBucketRateLimiter };
`,
              },
            },
          } as AIStreamEvent;
        } else if (turn === 4) {
          // Turn 4: Execute project test
          yield {
            type: AIStreamEventType.TextDelta,
            content: 'Running project tests with execute_command.',
          } as AIStreamEvent;
          yield {
            type: AIStreamEventType.ToolCallComplete,
            toolCall: {
              id: 'call-4',
              name: 'execute_command',
              arguments: { command: 'node test.js' },
            },
          } as AIStreamEvent;
        } else if (turn === 5) {
          // Turn 5: Test failed! Diagnose and correct
          yield {
            type: AIStreamEventType.TextDelta,
            content:
              'Test failed on refill check: tryConsume must call this.refill() first. Correcting implementation.',
          } as AIStreamEvent;
          yield {
            type: AIStreamEventType.ToolCallComplete,
            toolCall: {
              id: 'call-5',
              name: 'write_file',
              arguments: {
                path: 'src/rateLimiter.js',
                content: `class TokenBucketRateLimiter {
  constructor(capacity, refillRatePerSecond) {
    this.capacity = capacity;
    this.refillRate = refillRatePerSecond;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  tryConsume(tokens = 1) {
    this.refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }
}

module.exports = { TokenBucketRateLimiter };
`,
              },
            },
          } as AIStreamEvent;
        } else if (turn === 6) {
          // Turn 6: Re-verify tests
          yield {
            type: AIStreamEventType.TextDelta,
            content: 'Re-verifying with node test.js.',
          } as AIStreamEvent;
          yield {
            type: AIStreamEventType.ToolCallComplete,
            toolCall: {
              id: 'call-6',
              name: 'execute_command',
              arguments: { command: 'node test.js' },
            },
          } as AIStreamEvent;
        } else {
          // Turn 7: All tests passed, complete session
          yield {
            type: AIStreamEventType.TextDelta,
            content:
              'All tests in test.js passed successfully! TokenBucketRateLimiter now properly implements token refill math based on specialist advice.',
          } as AIStreamEvent;
        }
      },
    };

    const session = new AgentSession(
      'session-specialist-e2e',
      tempWorkspaceDir,
      delegation,
      testProvider,
      eventEmitter,
      toolRegistry,
      wrappedBridge,
      { autoApprove: true, maxIterations: 10 }
    );

    await session.start(
      'Fix the TokenBucketRateLimiter in src/rateLimiter.js. Consult softwareengineeringexpert, implement the fix, and ensure node test.js passes.'
    );

    // 1. Session completed successfully
    expect(session.state).toBe(AgentProtocol.AgentState.Completed);

    // 2. The local file was modified with the correct implementation
    const finalFileContent = fs.readFileSync(
      path.join(tempWorkspaceDir, 'src', 'rateLimiter.js'),
      'utf8'
    );
    expect(finalFileContent).toContain('this.refill();');
    expect(finalFileContent).toContain('this.tokens = Math.min(this.capacity');

    // 3. The actual test suite passes when run locally
    const testResult = execSync('node test.js', {
      cwd: tempWorkspaceDir,
      encoding: 'utf8',
    });
    expect(testResult).toContain('ALL RATE LIMITER TESTS PASSED');

    // 4. Specialist consultation events were emitted
    const specialistEvents = emittedEvents.filter(
      (e) => e.type === AgentProtocol.AgentEventType.SpecialistDelegation
    );
    expect(specialistEvents.length).toBeGreaterThanOrEqual(2);

    const runningEvent = specialistEvents.find(
      (e) => (e.payload as any).status === 'running'
    );
    expect(runningEvent).toBeDefined();
    expect((runningEvent?.payload as any).specialistName).toBe('softwareengineeringexpert');

    const completedEvent = specialistEvents.find(
      (e) => (e.payload as any).status === 'completed'
    );
    expect(completedEvent).toBeDefined();
    expect((completedEvent?.payload as any).evaluation).toBe('accepted');
    expect((completedEvent?.payload as any).summary).toContain('ARCHITECTURAL ANALYSIS');

    // 5. CRITICAL SECURITY BOUNDARY VERIFICATION:
    // The remote specialist NEVER received filesystem or terminal execution authority!
    expect(specialistBridgeAccessCount).toBe(0);
  });
});
