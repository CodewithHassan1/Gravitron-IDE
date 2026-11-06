import { describe, it, expect, beforeEach } from 'vitest';
import { TypeScriptParser } from '../src/pipeline/TypeScriptParser';
import { SymbolKind } from '../src/domain/IndexDTOs';
import * as path from 'path';

describe('TypeScriptParser (Gate 4A.3)', () => {
  let parser: TypeScriptParser;
  const workspaceRoot = '/fake/workspace';

  beforeEach(() => {
    parser = new TypeScriptParser();
  });

  it('extracts basic TypeScript symbols and imports', () => {
    const code = `
      import { A, B as C } from './utils';
      import DefaultExport from 'module';
      
      export class MyClass {
        public myProperty = 1;
        constructor() {}
        public myMethod() {
           console.log(A);
        }
      }

      interface MyInterface {}
      type MyType = string;
      const myConst = 'test';
      let myLet = 1;
      function myFunction() {}
      enum MyEnum { X, Y }
    `;

    const result = parser.parse(workspaceRoot, 'src/main.ts', code);

    // Symbols
    const classSym = result.symbols.find((s) => s.name === 'MyClass');
    expect(classSym?.kind).toBe(SymbolKind.Class);
    expect(classSym?.line).toBe(5); // Adjusting if exact lines drift, but roughly 5

    expect(result.symbols.find((s) => s.name === 'myProperty')?.kind).toBe(SymbolKind.Property);
    expect(result.symbols.find((s) => s.name === 'myMethod')?.kind).toBe(SymbolKind.Method);
    expect(result.symbols.find((s) => s.name === 'MyInterface')?.kind).toBe(SymbolKind.Interface);
    expect(result.symbols.find((s) => s.name === 'MyType')?.kind).toBe(SymbolKind.TypeAlias);
    expect(result.symbols.find((s) => s.name === 'myConst')?.kind).toBe(SymbolKind.Constant);
    expect(result.symbols.find((s) => s.name === 'myLet')?.kind).toBe(SymbolKind.Variable);
    expect(result.symbols.find((s) => s.name === 'myFunction')?.kind).toBe(SymbolKind.Function);
    expect(result.symbols.find((s) => s.name === 'MyEnum')?.kind).toBe(SymbolKind.Enum);

    // Imports
    expect(result.imports).toHaveLength(3);
    expect(
      result.imports.find((i) => i.moduleName === './utils' && i.symbolName === 'A')
    ).toBeDefined();
    expect(
      result.imports.find((i) => i.moduleName === './utils' && i.symbolName === 'C')
    ).toBeDefined(); // alias is fine for now
    expect(
      result.imports.find((i) => i.moduleName === 'module' && i.symbolName === 'DefaultExport')
    ).toBeDefined();

    // References
    // We expect 'console', 'log', 'A' to be extracted as syntactic references
    const refs = result.references.map((r) => r.symbolName);
    expect(refs).toContain('console');
    expect(refs).toContain('log');
    expect(refs).toContain('A');
  });

  it('handles JSX/TSX', () => {
    const code = `
      export function MyComponent() {
        return <div className="test">{myConst}</div>;
      }
    `;
    const result = parser.parse(workspaceRoot, 'src/App.tsx', code);
    expect(result.symbols.find((s) => s.name === 'MyComponent')).toBeDefined();
    expect(result.references.map((r) => r.symbolName)).toContain('myConst');
  });

  it('handles empty files gracefully', () => {
    const result = parser.parse(workspaceRoot, 'empty.ts', '');
    expect(result.symbols).toHaveLength(0);
    expect(result.imports).toHaveLength(0);
    expect(result.references).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('isolates parser failures (malformed TypeScript)', () => {
    const code = `
      function broken( {
        const x = 
      }
      function okay() {}
    `;
    // ts.createSourceFile is extremely resilient and doesn't throw, it generates AST with Error nodes
    const result = parser.parse(workspaceRoot, 'broken.ts', code);

    // It should still find the good function
    expect(result.symbols.find((s) => s.name === 'okay')).toBeDefined();
  });

  it('handles Unicode identifiers', () => {
    const code = `const café = 'coffee'; function こんにちは() {}`;
    const result = parser.parse(workspaceRoot, 'unicode.ts', code);
    expect(result.symbols.find((s) => s.name === 'café')).toBeDefined();
    expect(result.symbols.find((s) => s.name === 'こんにちは')).toBeDefined();
  });

  it('prevents workspace root traversal (security boundary)', () => {
    const code = `const x = 1;`;

    // Valid
    expect(() => parser.parse(workspaceRoot, 'valid.ts', code)).not.toThrow();

    // Invalid
    expect(() => parser.parse(workspaceRoot, '../etc/passwd', code)).toThrow(
      /Path traversal blocked/
    );
    expect(() => parser.parse(workspaceRoot, '..\\windows\\system32', code)).toThrow(
      /Path traversal blocked/
    );
  });

  it('verifies determinism (same input -> same output)', () => {
    const code = `class X { foo() { return 1; } }`;
    const res1 = parser.parse(workspaceRoot, 'test.ts', code);
    const res2 = parser.parse(workspaceRoot, 'test.ts', code);

    expect(res1).toEqual(res2);
  });

  it('verifies source location correctness', () => {
    const code = `const x = 1;`; // 'x' starts at index 6, length 1
    const result = parser.parse(workspaceRoot, 'loc.ts', code);
    const sym = result.symbols[0];

    expect(sym.name).toBe('x');
    expect(sym.startOffset).toBe(6);
    expect(sym.endOffset).toBe(7);
  });

  it('handles large files (stress test)', () => {
    let largeCode = `import { useState } from 'react';\n`;
    for (let i = 0; i < 5000; i++) {
      largeCode += `const var${i} = ${i};\n`;
      largeCode += `function func${i}() { return var${i}; }\n`;
    }
    const start = Date.now();
    const result = parser.parse(workspaceRoot, 'large.ts', largeCode);
    const end = Date.now();

    expect(result.symbols.length).toBe(10000);
    // Shouldn't take more than a second or two even in JS
    expect(end - start).toBeLessThan(3000);
  });
});
