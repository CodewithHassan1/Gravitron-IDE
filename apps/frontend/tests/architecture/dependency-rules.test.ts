import { describe, it, expect } from 'vitest';
import madge from 'madge';
import path from 'path';

/**
 * Protects:
 * docs/architecture/dependency-rules.md
 *
 * Rule:
 * The dependency graph must contain zero cycles.
 * Dependencies may only flow downward through approved layers.
 */
describe('Dependency Rules', () => {
  const srcPath = path.resolve(__dirname, '../../src');

  it('The dependency graph must contain zero cycles', async () => {
    const res = await madge(srcPath, { fileExtensions: ['ts', 'tsx'] });
    const circular = res.circular();
    
    if (circular.length > 0) {
      console.error('Circular dependencies found:', circular);
    }
    
    expect(circular).toHaveLength(0);
  }, 30000);

  it('Layer Direction Enforcement: Domain engines cannot import UI, and Persistence isolation', async () => {
    const res = await madge(srcPath, { fileExtensions: ['ts', 'tsx'] });
    const dependencies = res.obj();
    const violations: string[] = [];

    Object.entries(dependencies).forEach(([module, deps]) => {
      // Normalize module name (madge returns relative paths like services/workspace/...)
      const mod = module.replace(/\\/g, '/');
      
      deps.forEach(d => {
        const dep = d.replace(/\\/g, '/');

        // Rule: Domain cannot import UI
        if (mod.startsWith('services/workspace/') && !mod.includes('adapters/')) {
          if (dep.startsWith('components/') || dep.startsWith('ui/') || dep.startsWith('app/') || dep.includes('.tsx')) {
            violations.push(`DOMAIN->UI: ${mod} -> ${dep}`);
          }
        }

        // Rule: Persistence Isolation (Persistence cannot import UI)
        if (mod.includes('WorkspacePersistence')) {
          if (dep.startsWith('components/') || dep.startsWith('ui/')) {
            violations.push(`PERSISTENCE->UI: ${mod} -> ${dep}`);
          }
        }

        // Rule: Domain Isolation from native DB/FS APIs directly (VirtualFileSystem cannot import IndexedDB)
        if (mod.includes('VirtualFileSystem')) {
          if (dep.includes('idb') || dep.includes('WorkspacePersistence') || dep.includes('FileSystemHandle')) {
            violations.push(`DOMAIN->NATIVE: ${mod} -> ${dep}`);
          }
        }
      });
    });

    if (violations.length > 0) {
      console.error('Layer Direction Violations:', violations);
    }
    
    expect(violations).toHaveLength(0);
  }, 30000);
});
