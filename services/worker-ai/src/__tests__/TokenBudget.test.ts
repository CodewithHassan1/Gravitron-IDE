import { describe, it, expect } from 'vitest';
import { TokenBudget } from '../TokenBudget';

describe('TokenBudget', () => {
  it('should initialize with correct limit and safe margin', () => {
    // Usually provider limit is large, e.g. 200000
    // We allocate segments
    const budget = new TokenBudget(200_000);
    
    // Test base allocations
    expect(budget.getLimit('system')).toBeGreaterThan(0);
    expect(budget.getLimit('history')).toBeGreaterThan(0);
    expect(budget.getLimit('retrieval')).toBeGreaterThan(0);
  });

  it('should accurately count approximate tokens', () => {
    const budget = new TokenBudget(200_000);
    // 1 token = approx 4 chars
    const text = 'Hello world, this is a test string.'; // 35 chars -> ~8 tokens
    const tokens = budget.countTokens(text);
    expect(tokens).toBeGreaterThan(5);
    expect(tokens).toBeLessThan(15);
  });

  it('should enforce limits when tracking used budget', () => {
    const budget = new TokenBudget(10_000); // Tiny budget
    const canFit = budget.canFit('history', 'A very long string...'.repeat(5000)); 
    expect(canFit).toBe(false);

    const canFitShort = budget.canFit('history', 'Short string');
    expect(canFitShort).toBe(true);
    
    budget.consume('history', 'Short string');
    const remaining = budget.getRemaining('history');
    expect(remaining).toBeLessThan(budget.getLimit('history'));
  });
});
