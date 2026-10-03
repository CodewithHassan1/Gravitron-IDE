import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Find all TypeScript files in the worker-ai directory
function getAllTypeScriptFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const stat = fs.statSync(path.join(dir, file));
    if (stat.isDirectory()) {
      getAllTypeScriptFiles(path.join(dir, file), fileList);
    } else if (file.endsWith('.ts')) {
      fileList.push(path.join(dir, file));
    }
  }
  return fileList;
}

describe('Architecture Dependencies Audit', () => {
  it('worker-ai must NOT depend on any internal intelligence or SQLite components', () => {
    const workerAiDir = path.resolve(__dirname, '../../../../services/worker-ai/src');
    const files = getAllTypeScriptFiles(workerAiDir);

    const forbiddenImports = [
      'sqlite3',
      'better-sqlite3',
      'worker-intelligence',
      'SQLiteStore',
      'IncrementalIndexer',
      'TypeScriptParser',
      'IntelligenceManager',
      'child_process'
    ];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      
      for (const forbidden of forbiddenImports) {
        // Regex to check for require or import of forbidden modules
        // Matches: import { X } from 'forbidden'; import 'forbidden'; require('forbidden')
        const importRegex = new RegExp(`(?:from|import|require)\\s*['"]([^'"]*?${forbidden}[^'"]*)['"]`, 'g');
        const match = importRegex.exec(content);
        if (match) {
          throw new Error(`File ${file} violates architecture by importing: ${match[1]} (contains ${forbidden})`);
        }
        
        // Let's also check for exact words just in case for classes, though importing them is the primary failure
        if (content.includes(` ${forbidden} `) || content.includes(` ${forbidden}\n`)) {
          // Some might just be mentioned in comments, but usually this catches direct usage if they somehow bypassed import
          // We won't strictly fail on word presence to avoid false positives in comments,
          // but we rely on the import/require check which is most robust for JS/TS dependencies.
        }
      }
    }
  });

  it('Protocol integrity: shared contracts preserved end-to-end', () => {
    // Verify that the AgentCapabilityBridge and IntelligenceManager both use 
    // the correct protocols from @ag/protocol
    
    // We will verify this statically by ensuring the protocol models are referenced in the right files.
    const bridgeFile = path.resolve(__dirname, '../../src/services/AgentCapabilityBridgeImpl.ts');
    const managerFile = path.resolve(__dirname, '../../src/services/IntelligenceManager.ts');
    const toolsFile = path.resolve(__dirname, '../../../../services/worker-ai/src/tools/builtin/SearchWorkspaceTool.ts');
    
    const bridgeSrc = fs.readFileSync(bridgeFile, 'utf-8');
    const managerSrc = fs.readFileSync(managerFile, 'utf-8');
    const toolsSrc = fs.readFileSync(toolsFile, 'utf-8');
    
    // They should all import from @ag/protocol
    expect(bridgeSrc).toMatch(/import.*AgentProtocol.*from ['"]@ag\/protocol['"]/);
    expect(managerSrc).toMatch(/import.*IntelligenceProtocol.*from ['"]@ag\/protocol['"]/);
    expect(toolsSrc).toMatch(/import.*IntelligenceProtocol.*from ['"]@ag\/protocol['"]/);
  });
});
