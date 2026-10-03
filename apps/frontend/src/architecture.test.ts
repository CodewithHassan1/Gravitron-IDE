import { describe, it, expect } from 'vitest';
import madge from 'madge';
import path from 'path';

describe('Architecture Validation', () => {
  const srcPath = path.resolve(__dirname, './');

  it('should have zero circular dependencies', async () => {
    const res = await madge(srcPath, {
      fileExtensions: ['ts', 'tsx']
    });
    
    const circular = res.circular();
    
    if (circular.length > 0) {
      console.error('Circular dependencies found:', circular);
    }
    
    expect(circular).toHaveLength(0);
  }, 30000);

  it('domain layer should not import ui layer', async () => {
    const res = await madge(srcPath, {
      fileExtensions: ['ts', 'tsx']
    });

    const dependencies = res.obj();
    const violations: string[] = [];

    // The 'services/workspace' (Domain Engine) must not import anything from 'components/' or 'ui/'
    Object.entries(dependencies).forEach(([module, deps]) => {
      if (module.startsWith('services/workspace') || module.startsWith('services\\workspace')) {
        deps.forEach(dep => {
          if (dep.startsWith('components') || dep.startsWith('ui')) {
            violations.push(`${module} -> ${dep}`);
          }
        });
      }
    });

    if (violations.length > 0) {
      console.error('Layer violations found (Domain -> UI):', violations);
    }
    expect(violations).toHaveLength(0);
  }, 30000);
});
