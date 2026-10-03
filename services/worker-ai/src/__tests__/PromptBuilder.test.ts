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
        { role: 'system', content: 'Long term memory: user likes fast execution.' }
      ],
      episodicHistory: [
        { role: 'user', content: 'What is the format?' }
      ]
    };

    const messages = builder.build(context);

    // Precedence: system/safety -> project instructions -> CLAUDE.md/rules -> current task -> retrieved memory -> episodic history
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('You are an AI assistant.');
    
    // We expect the system prompt to aggregate instructions and rules, or they can be separate messages
    const fullContent = messages.map(m => m.content).join('\n');
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
        { role: 'user', content: 'Long conversation 2...'.repeat(50) }
      ]
    };

    const messages = builder.build(context);
    const historyCount = messages.filter(m => m.content.includes('Long conversation')).length;
    // Because of tight budget, history should be truncated or omitted
    expect(historyCount).toBeLessThan(2);
  });
});
