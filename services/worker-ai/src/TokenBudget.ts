export type PromptSegment = 'system' | 'instructions' | 'rules' | 'task' | 'retrieval' | 'history';

export class TokenBudget {
  private used: Record<PromptSegment, number> = {
    system: 0,
    instructions: 0,
    rules: 0,
    task: 0,
    retrieval: 0,
    history: 0,
  };

  private limits: Record<PromptSegment, number>;

  // A rough approximation: ~4 characters per token for English text
  private static readonly CHARS_PER_TOKEN = 4;

  constructor(private readonly totalBudget: number) {
    // Dynamic allocation percentages
    this.limits = {
      system: Math.floor(totalBudget * 0.1), // 10%
      instructions: Math.floor(totalBudget * 0.1), // 10%
      rules: Math.floor(totalBudget * 0.1), // 10%
      task: Math.floor(totalBudget * 0.05), // 5%
      retrieval: Math.floor(totalBudget * 0.25), // 25%
      history: Math.floor(totalBudget * 0.4), // 40%
    };
  }

  public getLimit(segment: PromptSegment): number {
    return this.limits[segment];
  }

  public getRemaining(segment: PromptSegment): number {
    return Math.max(0, this.limits[segment] - this.used[segment]);
  }

  public countTokens(text: string): number {
    // In a real production system this would use `tiktoken` or a similar tokenizer.
    // For this local IDE, we use a robust approximation to avoid heavy binary dependencies.
    return Math.ceil(text.length / TokenBudget.CHARS_PER_TOKEN);
  }

  public canFit(segment: PromptSegment, text: string): boolean {
    const tokens = this.countTokens(text);
    return this.used[segment] + tokens <= this.limits[segment];
  }

  public consume(segment: PromptSegment, text: string): void {
    const tokens = this.countTokens(text);
    this.used[segment] += tokens;
  }
}
