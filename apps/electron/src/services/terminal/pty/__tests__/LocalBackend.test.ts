import { describe, it, expect } from 'vitest';
import { LocalBackend } from '../LocalBackend';

describe('LocalBackend Shell Integration & Non-Interactive Execution', () => {
  const backend = new LocalBackend();

  it('bypasses shell integration for non-interactive powershell commands to prevent hangs', () => {
    const originalArgs = ['-NoProfile', '-NonInteractive', '-Command', 'npm test'];
    const result = backend.prepareShellIntegration('powershell.exe', originalArgs);

    expect(result.executable).toBe('powershell.exe');
    expect(result.args).toEqual(originalArgs);
    expect(result.args).not.toContain('-NoExit');
  });

  it('bypasses shell integration for non-interactive pwsh commands', () => {
    const originalArgs = ['-Command', 'Get-ChildItem'];
    const result = backend.prepareShellIntegration('pwsh.exe', originalArgs);

    expect(result.executable).toBe('pwsh.exe');
    expect(result.args).toEqual(originalArgs);
    expect(result.args).not.toContain('-NoExit');
  });

  it('injects integration prompt script with -NoExit for interactive PowerShell sessions', () => {
    const interactiveArgs = ['-NoLogo'];
    const result = backend.prepareShellIntegration('powershell.exe', interactiveArgs);

    expect(result.executable).toBe('powershell.exe');
    expect(result.args).toContain('-NoExit');
    expect(result.args).toContain('-ExecutionPolicy');
    expect(result.args).toContain('Bypass');
    expect(result.args).toContain('-Command');
  });

  it('bypasses /k injection for non-interactive cmd.exe commands (/c)', () => {
    const cmdArgs = ['/c', 'dir /b'];
    const result = backend.prepareShellIntegration('cmd.exe', cmdArgs);

    expect(result.executable).toBe('cmd.exe');
    expect(result.args).toEqual(cmdArgs);
    expect(result.args).not.toContain('/k');
  });

  it('injects prompt string terminator for interactive cmd.exe sessions', () => {
    const result = backend.prepareShellIntegration('cmd.exe', []);

    expect(result.executable).toBe('cmd.exe');
    expect(result.args[0]).toBe('/k');
    expect(result.args[1]).toContain('prompt');
  });

  it('bypasses --init-file for non-interactive bash commands (-c)', () => {
    const bashArgs = ['-c', 'echo hello'];
    const result = backend.prepareShellIntegration('/bin/bash', bashArgs);

    expect(result.executable).toBe('/bin/bash');
    expect(result.args).toEqual(bashArgs);
    expect(result.args).not.toContain('--init-file');
  });

  it('injects --init-file for interactive bash sessions', () => {
    const result = backend.prepareShellIntegration('/bin/bash', []);

    expect(result.executable).toBe('/bin/bash');
    expect(result.args[0]).toBe('--init-file');
  });
});
