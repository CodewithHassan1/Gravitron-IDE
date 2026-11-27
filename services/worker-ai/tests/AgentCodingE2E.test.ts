import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { AgentSession } from '../src/AgentSession';
import { ToolRegistry } from '../src/tools/ToolRegistry';
import { ReadFileTool } from '../src/tools/builtin/ReadFileTool';
import { WriteFileTool } from '../src/tools/builtin/WriteFileTool';
import { ExecuteCommandTool } from '../src/tools/builtin/ExecuteCommandTool';
import { RepositoryMapTool } from '../src/tools/builtin/RepositoryMapTool';
import { SearchWorkspaceTool } from '../src/tools/builtin/SearchWorkspaceTool';
import { AgentProtocol } from '@ag/protocol';
import { AIProvider, AIStreamEventType, AIStreamEvent, CompletionRequest } from '@ag/ai-providers';
import type { DelegationContext } from '../src/DelegationContext';

/**
 * AI AGENT CORE — Real Product Acceptance E2E Orchestration Scenario
 *
 * NOTE: This test validates the agent's autonomous orchestration, state machine,
 * tool execution loop, multi-turn ReAct history preservation, and error recovery
 * using a deterministic mock provider simulating LLM decisions. It verifies actual
 * program behavior and runtime execution in a real workspace.
 */
describe('AI Agent Core — Real Product Acceptance E2E Scenario', () => {
  let tempWorkspaceDir: string;
  let toolRegistry: ToolRegistry;
  let emittedEvents: AgentProtocol.AgentEventEnvelope[];
  let eventEmitter: (event: AgentProtocol.AgentEventEnvelope) => void;

  const delegation: DelegationContext = {
    executionId: 'exec-e2e-001',
    userId: 'user_e2e',
    orgId: 'org_e2e',
    scope: 'agent:execute',
    jti: 'jti-e2e-001',
  };

  beforeEach(() => {
    tempWorkspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-agent-e2e-'));
    emittedEvents = [];
    eventEmitter = (event) => {
      emittedEvents.push(event);
    };

    // Initialize fixture project with an incomplete implementation
    fs.mkdirSync(path.join(tempWorkspaceDir, 'src'), { recursive: true });

    fs.writeFileSync(
      path.join(tempWorkspaceDir, 'package.json'),
      JSON.stringify(
        {
          name: 'sample-project',
          version: '1.0.0',
          main: 'src/calculator.js',
          scripts: { test: 'node test.js' },
        },
        null,
        2
      ),
      'utf8'
    );

    // Initial incomplete calculator module
    fs.writeFileSync(
      path.join(tempWorkspaceDir, 'src', 'calculator.js'),
      `function add(a, b) {
  return a + b;
}

function subtract(a, b) {
  // Incomplete initial implementation: throws
  throw new Error('Not implemented');
}

module.exports = { add, subtract };
`,
      'utf8'
    );

    // Behavioral test runner that actually executes functions and asserts behavior
    const testScript = `
const assert = require('assert');
const { add, subtract } = require('./src/calculator');

// Verify existing feature (add)
assert.strictEqual(add(5, 7), 12, 'add(5, 7) must equal 12');

// Verify requested feature (subtract) through actual functional invocation
if (typeof subtract !== 'function') {
  console.error('FAIL: subtract is not an exported function');
  process.exit(1);
}

try {
  const result1 = subtract(10, 4);
  assert.strictEqual(result1, 6, 'Expected subtract(10, 4) to be 6, got ' + result1);

  const result2 = subtract(3, 8);
  assert.strictEqual(result2, -5, 'Expected subtract(3, 8) to be -5, got ' + result2);

  console.log('PASS: All calculator behavioral tests passed successfully');
  process.exit(0);
} catch (err) {
  console.error('FAIL: Behavioral assertion failed: ' + err.message);
  process.exit(1);
}
`;
    fs.writeFileSync(path.join(tempWorkspaceDir, 'test.js'), testScript, 'utf8');

    // Register actual builtin tools
    toolRegistry = new ToolRegistry();
    toolRegistry.register(new ReadFileTool());
    toolRegistry.register(new WriteFileTool());
    toolRegistry.register(new ExecuteCommandTool());
    toolRegistry.register(new RepositoryMapTool());
    toolRegistry.register(new SearchWorkspaceTool());
  });

  afterEach(() => {
    if (tempWorkspaceDir && fs.existsSync(tempWorkspaceDir)) {
      try {
        fs.rmSync(tempWorkspaceDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup failure
      }
    }
  });

  it('autonomously completes a real coding task: inspect -> plan -> code -> test -> error diagnose -> fix -> verify actual behavior', async () => {
    const memoryStore = new Map<string, any[]>();

    const capabilityBridge: AgentProtocol.IAgentCapabilityBridge = {
      async readFile(context, relPath) {
        const fullPath = path.join(tempWorkspaceDir, relPath);
        if (!fs.existsSync(fullPath)) {
          throw new Error(`File not found: ${relPath}`);
        }
        return fs.readFileSync(fullPath, 'utf8');
      },

      async writeFile(context, relPath, content) {
        const fullPath = path.join(tempWorkspaceDir, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        const stringContent = typeof content === 'string' ? content : new TextDecoder().decode(content);
        fs.writeFileSync(fullPath, stringContent, 'utf8');
      },

      async executeCommand(context, command, cwd) {
        const targetCwd = cwd ? path.join(tempWorkspaceDir, cwd) : tempWorkspaceDir;
        try {
          const stdout = execSync(command, {
            cwd: targetCwd,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          return { stdout, stderr: '', exitCode: 0 };
        } catch (err: any) {
          return {
            stdout: err.stdout?.toString() || '',
            stderr: err.stderr?.toString() || err.message || '',
            exitCode: err.status || 1,
          };
        }
      },

      async getRepositoryMap(context) {
        const files: string[] = [];
        const walk = (dir: string, prefix = '') => {
          for (const item of fs.readdirSync(dir)) {
            const rel = prefix ? `${prefix}/${item}` : item;
            const full = path.join(dir, item);
            if (fs.statSync(full).isDirectory()) {
              walk(full, rel);
            } else {
              files.push(rel);
            }
          }
        };
        walk(tempWorkspaceDir);
        return {
          workspaceId: context.workspaceId,
          snapshotSequence: 1,
          results: [{ content: files.join('\n') }],
        };
      },

      async searchWorkspace(context, query) {
        return { workspaceId: context.workspaceId, snapshotSequence: 1, results: [] };
      },

      async findDefinition(context, symbolName) {
        return { workspaceId: context.workspaceId, snapshotSequence: 1, results: [] };
      },

      async findReferences(context, symbolName) {
        return { workspaceId: context.workspaceId, snapshotSequence: 1, results: [] };
      },

      async semanticSearch(context, query) {
        return { workspaceId: context.workspaceId, snapshotSequence: 1, results: [] };
      },

      async addEpisodicMemory(context, sessionId, memory) {
        const list = memoryStore.get(sessionId) || [];
        list.push(memory);
        memoryStore.set(sessionId, list);
      },

      async getEpisodicMemory(context, sessionId, limit) {
        const list = memoryStore.get(sessionId) || [];
        return limit ? list.slice(-limit) : list;
      },

      async addLongTermMemory(context, memory) {},
      async getLongTermMemory(context, limit) {
        return [];
      },
      async searchLongTermMemory(context, queryEmbedding, limit) {
        return [];
      },
    };

    let turnCount = 0;
    const recordedRequests: CompletionRequest[] = [];

    // Deterministic mock provider orchestrating the multi-turn scenario
    const mockLLM: AIProvider = {
      completeChat: vi.fn(),
      streamChat: async function* (request: CompletionRequest, signal?: AbortSignal) {
        turnCount++;
        recordedRequests.push(request);

        if (turnCount === 1) {
          // Turn 1: Inspect repository structure and source files
          yield {
            type: AIStreamEventType.TextDelta,
            content: 'Inspecting workspace structure and existing calculator implementation.',
          } as AIStreamEvent;
          yield {
            type: AIStreamEventType.ToolCallComplete,
            toolCall: {
              id: 'call_1',
              name: 'get_repository_map',
              arguments: {},
            },
          } as AIStreamEvent;
          yield {
            type: AIStreamEventType.ToolCallComplete,
            toolCall: {
              id: 'call_2',
              name: 'read_file',
              arguments: { path: 'src/calculator.js' },
            },
          } as AIStreamEvent;
        } else if (turnCount === 2) {
          // Turn 2: Form structured plan and attempt implementation with an initial logic defect
          yield {
            type: AIStreamEventType.TextDelta,
            content: 'Created execution plan. Attempting subtract implementation with initial flawed logic.',
          } as AIStreamEvent;
          yield {
            type: AIStreamEventType.ToolCallComplete,
            toolCall: {
              id: 'call_3',
              name: 'update_plan',
              arguments: {
                steps: [
                  { id: '1', description: 'Inspect repository and test suite', status: 'completed' },
                  { id: '2', description: 'Implement subtract function', status: 'in_progress' },
                  { id: '3', description: 'Verify program behavior with test runner', status: 'pending' },
                ],
              },
            },
          } as AIStreamEvent;
          // Initial write contains a deliberate logic error (adds instead of subtracts)
          yield {
            type: AIStreamEventType.ToolCallComplete,
            toolCall: {
              id: 'call_4',
              name: 'write_file',
              arguments: {
                path: 'src/calculator.js',
                content: `function add(a, b) {
  return a + b;
}

function subtract(a, b) {
  // Intentional initial bug: returns addition
  return a + b;
}

module.exports = { add, subtract };
`,
              },
            },
          } as AIStreamEvent;
        } else if (turnCount === 3) {
          // Turn 3: Execute verification command
          yield {
            type: AIStreamEventType.TextDelta,
            content: 'Running verification test to check behavior.',
          } as AIStreamEvent;
          yield {
            type: AIStreamEventType.ToolCallComplete,
            toolCall: {
              id: 'call_5',
              name: 'execute_command',
              arguments: { command: 'node test.js' },
            },
          } as AIStreamEvent;
        } else if (turnCount === 4) {
          // Turn 4: Error recovery: Test failed because subtract(10, 4) returned 14 instead of 6.
          // Agent diagnoses error from command output, updates plan, and writes correct code.
          yield {
            type: AIStreamEventType.TextDelta,
            content: 'Test failed: subtract logic returned addition. Correcting implementation to return a - b.',
          } as AIStreamEvent;
          yield {
            type: AIStreamEventType.ToolCallComplete,
            toolCall: {
              id: 'call_6',
              name: 'write_file',
              arguments: {
                path: 'src/calculator.js',
                content: `function add(a, b) {
  return a + b;
}

function subtract(a, b) {
  return a - b;
}

module.exports = { add, subtract };
`,
              },
            },
          } as AIStreamEvent;
        } else if (turnCount === 5) {
          // Turn 5: Re-verify program behavior
          yield {
            type: AIStreamEventType.TextDelta,
            content: 'Re-running test runner to confirm fix.',
          } as AIStreamEvent;
          yield {
            type: AIStreamEventType.ToolCallComplete,
            toolCall: {
              id: 'call_7',
              name: 'execute_command',
              arguments: { command: 'node test.js' },
            },
          } as AIStreamEvent;
        } else if (turnCount === 6) {
          // Turn 6: Mark all plan steps completed and summarize
          yield {
            type: AIStreamEventType.ToolCallComplete,
            toolCall: {
              id: 'call_8',
              name: 'update_plan',
              arguments: {
                steps: [
                  { id: '1', description: 'Inspect repository and test suite', status: 'completed' },
                  { id: '2', description: 'Implement subtract function', status: 'completed' },
                  { id: '3', description: 'Verify program behavior with test runner', status: 'completed' },
                ],
              },
            },
          } as AIStreamEvent;
          yield {
            type: AIStreamEventType.TextDelta,
            content:
              'Task completed: inspected project, implemented subtract function, diagnosed initial assertion failure, fixed implementation, and verified all behavioral tests pass.',
          } as AIStreamEvent;
        } else {
          // Turn 7: End of conversation
          yield {
            type: AIStreamEventType.TextDelta,
            content: 'All tasks completed successfully.',
          } as AIStreamEvent;
        }
      },
    };

    const session = new AgentSession(
      'agent-e2e-session',
      'workspace-e2e',
      delegation,
      mockLLM,
      eventEmitter,
      toolRegistry,
      capabilityBridge,
      {
        autoApprove: true,
        model: 'claude-3-5-sonnet',
        maxIterations: 20,
      }
    );

    await session.start(
      'Inspect this project, identify how calculator works, implement subtract function, and verify tests pass.'
    );

    // 1. Session reached Completed state
    expect(session.state).toBe(AgentProtocol.AgentState.Completed);

    // 2. Behavioral verification: Actually execute test runner on the modified workspace
    const testOutput = execSync('node test.js', { cwd: tempWorkspaceDir, encoding: 'utf8' });
    expect(testOutput).toContain('PASS: All calculator behavioral tests passed successfully');

    // 3. Behavioral verification: Directly load and execute the modified module functions
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const calculator = require(path.join(tempWorkspaceDir, 'src', 'calculator.js'));
    expect(calculator.add(10, 20)).toBe(30);
    expect(calculator.subtract(50, 18)).toBe(32);
    expect(calculator.subtract(10, 25)).toBe(-15);

    // 4. Plan lifecycle was maintained through all iterations
    expect(session.plan).toBeDefined();
    expect(session.plan?.steps).toHaveLength(3);
    expect(session.plan?.steps.every((s) => s.status === 'completed')).toBe(true);

    // 5. Tool approvals emitted accurate audit events with approvalMode distinguishing policy approval
    const approvalEvents = emittedEvents.filter(
      (e) => e.type === AgentProtocol.AgentEventType.ToolApprovalRequested
    );
    expect(approvalEvents.length).toBeGreaterThanOrEqual(3);
    expect(
      approvalEvents.every((e) => (e.payload as any).approvalMode === 'policy_auto')
    ).toBe(true);

    // 6. Multi-turn ReAct history preserved complete tool turns without orphaning
    expect(recordedRequests.length).toBeGreaterThanOrEqual(6);
    const lastRequest = recordedRequests[recordedRequests.length - 1];
    const assistantToolMessages = lastRequest.messages.filter(
      (m) => m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0
    );
    expect(assistantToolMessages.length).toBeGreaterThanOrEqual(3);

    // Verify all tool result messages have matching preceding toolCalls in assistant message
    const toolResultMessages = lastRequest.messages.filter((m) => m.role === 'tool');
    expect(toolResultMessages.length).toBeGreaterThanOrEqual(5);
    for (const tr of toolResultMessages) {
      expect(tr.toolCallId).toBeDefined();
      const hasMatchingCall = assistantToolMessages.some((am) =>
        am.toolCalls?.some((tc) => tc.id === tr.toolCallId)
      );
      expect(hasMatchingCall).toBe(true);
    }

    // 7. Snapshot consistency
    const snapshot = session.getSnapshot();
    expect(snapshot.state).toBe(AgentProtocol.AgentState.Completed);
    expect(snapshot.plan?.steps.every((s) => s.status === 'completed')).toBe(true);
    expect(snapshot.displayMessages.length).toBeGreaterThan(10);
  });
});
