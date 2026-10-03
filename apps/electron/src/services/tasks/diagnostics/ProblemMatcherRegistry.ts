import { IProblemMatcher } from './IProblemMatcher';

export class ProblemMatcherRegistry {
  private matchers = new Map<string, IProblemMatcher>();

  public register(matcher: IProblemMatcher): void {
    if (this.matchers.has(matcher.id)) {
      throw new Error(`Problem matcher ${matcher.id} is already registered.`);
    }
    this.matchers.set(matcher.id, matcher);
  }

  public get(id: string): IProblemMatcher | undefined {
    return this.matchers.get(id);
  }

  public getAll(): IProblemMatcher[] {
    return Array.from(this.matchers.values());
  }
}
