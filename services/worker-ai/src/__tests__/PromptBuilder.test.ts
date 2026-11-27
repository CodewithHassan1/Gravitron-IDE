import { describe, it, expect, vi } from 'vitest';
import { PromptBuilder, PromptContext } from '../PromptBuilder';
import { TokenBudget } from '../TokenBudget';

describe('PromptBuilder', () => {
  it('should assemble prompts with strict precedence', async () => {
    const budget = new TokenBudget(100000); // Plenty of budget
    const builder = new PromptBuilder(budget);

    const context: PromptContext = {
      systemSafety: 'You are an AI assistant.',
      projectInstructions: 'Never delete files.',
      claudeMd: 'Path specific rule: use tabs.',
      currentTask: 'Format the code.',
      retrievedMemories: [
        { role: 'system', content: 'Long term memory: user likes fast execution.' },
      ],
      episodicHistory: [{ role: 'user', content: 'What is the format?' }],
    };

    const messages = builder.build(context);

    // Precedence: system/safety -> project instructions -> CLAUDE.md/rules -> current task -> retrieved memory -> episodic history
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('You are an AI assistant.');

    // We expect the system prompt to aggregate instructions and rules, or they can be separate messages
    const fullContent = messages.map((m) => m.content).join('\n');
    expect(fullContent).toContain('Never delete files.');
    expect(fullContent).toContain('Path specific rule: use tabs.');
    expect(fullContent).toContain('Long term memory: user likes fast execution.');
    expect(fullContent).toContain('Format the code.');
    expect(fullContent).toContain('What is the format?');

    // Ensure retrieved memory doesn't override system instructions (this might just mean they appear lower in the prompt)
    const safetyIndex = fullContent.indexOf('You are an AI assistant.');
    const memoryIndex = fullContent.indexOf('Long term memory: user likes fast execution.');
    expect(safetyIndex).toBeLessThan(memoryIndex);
  });

  it('should truncate episodic history if budget is tight', () => {
    const budget = new TokenBudget(50); // Very tight budget
    const builder = new PromptBuilder(budget);

    const context: PromptContext = {
      systemSafety: 'Short system',
      currentTask: 'Do it',
      retrievedMemories: [],
      episodicHistory: [
        { role: 'user', content: 'Long conversation 1...'.repeat(50) },
        { role: 'user', content: 'Long conversation 2...'.repeat(50) },
      ],
    };

    const messages = builder.build(context);
    const historyCount = messages.filter((m) => m.content.includes('Long conversation')).length;
    // Because of tight budget, history should be truncated or omitted
    expect(historyCount).toBeLessThan(2);
  });

  it('preserves multi-tool turns as coherent atomic groups with toolCallId associations', () => {
    const budget = new TokenBudget(10000);
    const builder = new PromptBuilder(budget);

    const context: PromptContext = {
      systemSafety: 'System safety',
      currentTask: 'Do work',
      retrievedMemories: [],
      episodicHistory: [
        { role: 'user', content: 'Inspect repo' },
        {
          role: 'assistant',
          content: 'Inspecting files',
          toolCalls: [
            { id: 'call_1', name: 'read_file', arguments: { path: 'a.txt' } },
            { id: 'call_2', name: 'read_file', arguments: { path: 'b.txt' } },
          ],
        },
        { role: 'tool', toolCallId: 'call_1', content: 'Content of a' },
        { role: 'tool', toolCallId: 'call_2', content: 'Content of b' },
      ],
    };

    const messages = builder.build(context);

    // Messages should contain system, user, assistant with toolCalls, and both tool responses (5 total)
    expect(messages).toHaveLength(5);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
    expect(messages[2].role).toBe('assistant');
    expect(messages[2].toolCalls).toHaveLength(2);
    expect(messages[2].toolCalls![0].id).toBe('call_1');
    expect(messages[2].toolCalls![1].id).toBe('call_2');

    expect(messages[3].role).toBe('tool');
    expect(messages[3].toolCallId).toBe('call_1');
    expect(messages[3].content).toBe('Content of a');

    expect(messages[4].role).toBe('tool');
    expect(messages[4].toolCallId).toBe('call_2');
    expect(messages[4].content).toBe('Content of b');
  });

  it('drops orphaned tool results with no preceding assistant group', () => {
    const budget = new TokenBudget(10000);
    const builder = new PromptBuilder(budget);

    const context: PromptContext = {
      systemSafety: 'System safety',
      currentTask: 'Task',
      retrievedMemories: [],
      episodicHistory: [
        { role: 'tool', toolCallId: 'orphan_1', content: 'Orphaned output' },
        { role: 'user', content: 'Hello' },
      ],
    };

    const messages = builder.build(context);
    expect(messages.some((m) => m.role === 'tool')).toBe(false);
    expect(messages.some((m) => m.content === 'Hello')).toBe(true);
  });

  it('keeps entire tool turn together or drops together under budget constraint', () => {
    // Large tool turn followed by recent user message
    const largeToolResult = 'x'.repeat(400); // ~100 tokens
    const budget = new TokenBudget(100); // Only fits system + recent user message, not large tool group
    const builder = new PromptBuilder(budget);

    const context: PromptContext = {
      systemSafety: 'Safety',
      currentTask: 'Task',
      retrievedMemories: [],
      episodicHistory: [
        {
          role: 'assistant',
          content: 'Running tool',
          toolCalls: [{ id: 'call_old', name: 'big_tool', arguments: {} }],
        },
        { role: 'tool', toolCallId: 'call_old', content: largeToolResult },
        { role: 'user', content: 'Recent quick message' },
      ],
    };

    const messages = builder.build(context);
    // Recent user message fits, but the preceding tool turn must not be partially retained
    expect(messages.some((m) => m.content === 'Recent quick message')).toBe(true);
    expect(messages.some((m) => m.role === 'tool')).toBe(false);
    expect(messages.some((m) => m.role === 'assistant' && m.toolCalls)).toBe(false);
  });

  it('does not retain tool calls without corresponding results when results are expected', () => {
    const budget = new TokenBudget(10000);
    const builder = new PromptBuilder(budget);

    const context: PromptContext = {
      systemSafety: 'Safety',
      currentTask: 'Task',
      retrievedMemories: [],
      episodicHistory: [
        {
          role: 'assistant',
          content: 'Calling two tools',
          toolCalls: [
            { id: 'c1', name: 'tool_1', arguments: {} },
            { id: 'c2', name: 'tool_2', arguments: {} },
          ],
        },
        // Only c1 returned; c2 is missing
        { role: 'tool', toolCallId: 'c1', content: 'Result 1' },
        { role: 'user', content: 'Next step' },
      ],
    };

    const messages = builder.build(context);
    // Incomplete tool group must be dropped
    expect(messages.some((m) => m.content === 'Calling two tools')).toBe(false);
    expect(messages.some((m) => m.content === 'Result 1')).toBe(false);
    expect(messages.some((m) => m.content === 'Next step')).toBe(true);
  });
});
