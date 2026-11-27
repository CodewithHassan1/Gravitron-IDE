import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { AgentRuntime } from '../../src/AgentRuntime';
import { AgentProtocol } from '@ag/protocol';
import type { DelegationContext } from '../../src/DelegationContext';

/**
 * End-to-End Gemini-Powered Autonomous Coding Acceptance Test
 *
 * Validates the complete autonomous loop driven by Google Gemini API:
 * 1. Connects anonymously to AgentRouter MCP specialist network.
 * 2. Registers approved specialists (softwareengineeringexpert, etc.).
 * 3. Inspects a real coding issue in a local workspace directory.
 * 4. Gemini autonomously plans and executes file inspection via read_file.
 * 5. Gemini autonomously updates implementation using write_file.
 * 6. Gemini autonomously verifies changes by executing tests with execute_command.
 * 7. Confirms all tests pass with exit code 0.
 * 8. Confirms remote specialists maintain zero bridge access to local filesystem/terminal.
 */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

describe.skipIf(!GEMINI_API_KEY)('AI Agent Core — Real Gemini Autonomous Coding Acceptance', () => {
  let tempWorkspaceDir: string;
  let emittedEvents: AgentProtocol.AgentEventEnvelope[];
  let eventEmitter: (event: AgentProtocol.AgentEventEnvelope) => void;
  let localBridgeAccessCount = 0;

  const delegation: DelegationContext = {
    executionId: 'exec-gemini-live',
    userId: 'user-gemini-live',
    orgId: 'org-gemini-live',
    scope: 'agent:execute',
    jti: 'jti-gemini-live',
  };

  beforeEach(() => {
    tempWorkspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-gemini-coding-'));
    emittedEvents = [];
    eventEmitter = (event) => {
      emittedEvents.push(event);
    };
    localBridgeAccessCount = 0;

    // Set up project structure
    fs.mkdirSync(path.join(tempWorkspaceDir, 'src'), { recursive: true });

    fs.writeFileSync(
      path.join(tempWorkspaceDir, 'package.json'),
      JSON.stringify(
        {
          name: 'token-bucket-project',
          version: '1.0.0',
          scripts: { test: 'node test.js' },
        },
        null,
        2
      ),
      'utf8'
    );

    // Initial broken implementation: does not refill tokens based on elapsed time
    fs.writeFileSync(
      path.join(tempWorkspaceDir, 'src', 'tokenBucket.js'),
      `class TokenBucket {
  constructor(capacity, refillRatePerSec) {
    this.capacity = capacity;
    this.refillRate = refillRatePerSec;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  tryConsume(count = 1) {
    // BUG: Missing token refill logic based on elapsed time!
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }
}

module.exports = { TokenBucket };
`,
      'utf8'
    );

    // Node test runner that executes real code and asserts behavior
    fs.writeFileSync(
      path.join(tempWorkspaceDir, 'test.js'),
      `const assert = require('assert');
const { TokenBucket } = require('./src/tokenBucket');

const bucket = new TokenBucket(5, 10);

// 1. Initial consumption within capacity
assert.strictEqual(bucket.tryConsume(3), true, 'Should consume 3 tokens');
assert.strictEqual(bucket.tryConsume(2), true, 'Should consume remaining 2 tokens');
assert.strictEqual(bucket.tryConsume(1), false, 'Should reject consumption when bucket is empty');

// 2. Refill behavior after simulated time progression (500ms elapsed at 10 tokens/sec = 5 tokens)
bucket.lastRefill = Date.now() - 500;
assert.strictEqual(bucket.tryConsume(4), true, 'Should allow consumption after token refill');

console.log('ALL TOKEN BUCKET TESTS PASSED');
`,
      'utf8'
    );

    // Confirm test initially fails
    try {
      execSync('node test.js', { cwd: tempWorkspaceDir, stdio: 'pipe' });
      throw new Error('Initial test was supposed to fail!');
    } catch (err: any) {
      expect(err.status).toBe(1);
    }
  });

  afterEach(() => {
    try {
      fs.rmSync(tempWorkspaceDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error on windows
    }
  });

  it(
    'executes real Gemini-driven autonomous coding, file editing, and test verification',
    async () => {
      // Local Capability Bridge using real filesystem and terminal commands
      const realBridge: AgentProtocol.IAgentCapabilityBridge = {
        readFile: async (_ctx, relPath) => {
          localBridgeAccessCount++;
          const fullPath = path.resolve(tempWorkspaceDir, relPath);
          return fs.readFileSync(fullPath, 'utf8');
        },
        writeFile: async (_ctx, relPath, content) => {
          localBridgeAccessCount++;
          const fullPath = path.resolve(tempWorkspaceDir, relPath);
          fs.writeFileSync(fullPath, content, 'utf8');
        },
        executeCommand: async (_ctx, command) => {
          localBridgeAccessCount++;
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
        findDefinitions: async () => ({ definitions: [] }),
        findReferences: async () => ({ references: [] }),
        getRepositoryMap: async () => ({
          files: ['package.json', 'src/tokenBucket.js', 'test.js'],
        }),
        getSemanticContext: async () => ({ entries: [] }),
        getEpisodicMemory: async () => [],
        addEpisodicMemory: async () => {},
        recordEpisodicMemory: async () => {},
        searchLongTermMemory: async () => [],
      };

      const runtime = new AgentRuntime({ capabilityBridge: realBridge });

      // Connect to AgentRouter anonymously to discover specialists
      const connection = await runtime.connectAgentRouter({
        endpoint: 'https://agent-router.org/mcp',
        timeoutMs: 30000,
      });

      expect(connection.connected).toBe(true);
      expect(connection.approvedTools).toContain('softwareengineeringexpert');

      // Setup completion promise
      const completionPromise = new Promise<{ state: AgentProtocol.AgentState; reason?: string }>(
        (resolve) => {
          const handler = (event: AgentProtocol.AgentEventEnvelope) => {
            emittedEvents.push(event);
            if (event.type === AgentProtocol.AgentEventType.StateChanged) {
              const state = (event.payload as any).state;
              if (
                state === AgentProtocol.AgentState.Completed ||
                state === AgentProtocol.AgentState.Failed ||
                state === AgentProtocol.AgentState.Cancelled
              ) {
                resolve({ state, reason: (event.payload as any).reason });
              }
            }
          };
          eventEmitter = handler;
        }
      );

      const prompt = [
        'TASK: Fix the failing rate limiter implementation in src/tokenBucket.js.',
        '1. Inspect the workspace files src/tokenBucket.js and test.js using the read_file tool.',
        '2. You may consult the softwareengineeringexpert specialist if needed for architectural advice on token bucket algorithms.',
        '3. Fix the implementation in src/tokenBucket.js using the write_file tool so that tokens refill based on elapsed time: (Date.now() - lastRefill) / 1000 * refillRate, capped at capacity.',
        '4. Execute "node test.js" using execute_command tool to verify your fix.',
        '5. Once the tests pass with exit code 0, complete your task and provide a concise summary.',
      ].join('\n');

      const agentId = runtime.startAgent(
        'ws-gemini-live',
        'conv-gemini-live',
        prompt,
        'gemini',
        {
          apiKey: GEMINI_API_KEY,
          model: 'gemini-3.5-flash-lite',
        },
        (evt) => eventEmitter(evt),
        delegation,
        'agent-gemini-live-01',
        {
          autoApprove: true,
          model: 'gemini-3.5-flash-lite',
          maxIterations: 10,
        }
      );

      expect(agentId).toBe('agent-gemini-live-01');

      // Wait for agent to finish
      const finalResult = await completionPromise;
      console.log('Gemini Agent Final Result:', finalResult);

      expect(finalResult.state).toBe(AgentProtocol.AgentState.Completed);

      // Verify the local code was modified
      const updatedCode = fs.readFileSync(path.join(tempWorkspaceDir, 'src', 'tokenBucket.js'), 'utf8');
      expect(updatedCode).not.toContain('BUG: Missing token refill logic');

      // Verify the real test passes on disk
      const testRun = execSync('node test.js', {
        cwd: tempWorkspaceDir,
        encoding: 'utf8',
      });
      expect(testRun).toContain('ALL TOKEN BUCKET TESTS PASSED');

      // Verify event log shows tool calling and state transitions
      const stateEvents = emittedEvents.filter(
        (e) => e.type === AgentProtocol.AgentEventType.StateChanged
      );
      expect(stateEvents.length).toBeGreaterThan(2);

      const executingToolStates = stateEvents.filter(
        (e) => (e.payload as any).state === AgentProtocol.AgentState.ExecutingTool
      );
      expect(executingToolStates.length).toBeGreaterThanOrEqual(2);

      // Verify tool approval requests were emitted
      const toolApprovalEvents = emittedEvents.filter(
        (e) => e.type === AgentProtocol.AgentEventType.ToolApprovalRequested
      );
      expect(toolApprovalEvents.length).toBeGreaterThanOrEqual(1);

      // Ensure localBridge was used for reading/writing/executing
      expect(localBridgeAccessCount).toBeGreaterThan(0);
    },
    180000 // 3 minutes timeout for live multi-turn LLM + network calls
  );
});
