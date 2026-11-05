import { describe, it, expect } from 'vitest';
import { RegexProblemMatcher } from '../../src/services/tasks/diagnostics/RegexProblemMatcher';
import { ProblemMatcherRegistry } from '../../src/services/tasks/diagnostics/ProblemMatcherRegistry';

describe('RegexProblemMatcher', () => {
  it('extracts diagnostic correctly using regex groups', () => {
    // Example TS error: "src/main.ts(10,15): error TS1005: ';' expected."
    const matcher = new RegexProblemMatcher({
      id: 'tsc',
      name: 'TypeScript Compiler',
      // (file)(line,col): (severity) (code): (message)
      pattern:
        /^([^\s].*)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\):\s+(error|warning|info)\s+([A-Za-z0-9]+):\s+(.*)$/,
      fileGroup: 1,
      lineGroup: 2, // We'll simplify and just take the first part of the line/col pair for the test
      severityGroup: 3,
      codeGroup: 4,
      messageGroup: 5,
    });

    // Mocking the match to simulate how standard regex matches line/col
    const simpleMatcher = new RegexProblemMatcher({
      id: 'simple-tsc',
      name: 'TypeScript Compiler',
      pattern: /^(.*)\((\d+),(\d+)\):\s+(error|warning|info)\s+([A-Za-z0-9]+):\s+(.*)$/,
      fileGroup: 1,
      lineGroup: 2,
      columnGroup: 3,
      severityGroup: 4,
      codeGroup: 5,
      messageGroup: 6,
      source: 'tsc',
    });

    const result = simpleMatcher.match("src/main.ts(10,15): error TS1005: ';' expected.");
    expect(result).toBeDefined();
    expect(result?.file).toBe('src/main.ts');
    expect(result?.line).toBe(10);
    expect(result?.column).toBe(15);
    expect(result?.severity).toBe('error');
    expect(result?.code).toBe('TS1005');
    expect(result?.message).toBe("';' expected.");
    expect(result?.source).toBe('tsc');
  });

  it('returns undefined for non-matching lines', () => {
    const matcher = new RegexProblemMatcher({
      id: 'tsc',
      name: 'TypeScript Compiler',
      pattern: /^(.*)\((\d+)\):\s+(error|warning)\s+(.*)$/,
      fileGroup: 1,
      lineGroup: 2,
      severityGroup: 3,
      messageGroup: 4,
    });

    expect(matcher.match('Compiling successfully...')).toBeUndefined();
  });

  it('uses default severity if severityGroup is not provided', () => {
    const matcher = new RegexProblemMatcher({
      id: 'eslint',
      name: 'ESLint',
      pattern: /^(.*):(\d+)\s+(.*)$/,
      fileGroup: 1,
      lineGroup: 2,
      messageGroup: 3,
      defaultSeverity: 'warning',
    });

    const result = matcher.match('src/app.ts:25 unused variable');
    expect(result?.severity).toBe('warning');
  });
});

describe('ProblemMatcherRegistry', () => {
  it('registers and retrieves matchers', () => {
    const registry = new ProblemMatcherRegistry();
    const matcher = new RegexProblemMatcher({
      id: 'test',
      name: 'Test',
      pattern: /(.*):(\d+) (.*)/,
      fileGroup: 1,
      lineGroup: 2,
      messageGroup: 3,
    });

    registry.register(matcher);

    expect(registry.get('test')).toBe(matcher);
    expect(registry.getAll()).toHaveLength(1);

    expect(() => registry.register(matcher)).toThrow('Problem matcher test is already registered.');
  });
});
