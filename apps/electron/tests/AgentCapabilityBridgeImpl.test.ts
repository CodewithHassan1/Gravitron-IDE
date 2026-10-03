import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentCapabilityBridgeImpl } from '../src/services/AgentCapabilityBridgeImpl';
import { IWorkspaceService } from '../src/services/IWorkspaceService';
import { IWorkspaceExecutionService } from '../src/services/execution/IWorkspaceExecutionService';
import { Channels } from '@ag/protocol';

describe('AgentCapabilityBridgeImpl', () => {
  let workspaceService: any;
  let executionService: any;
  let bridge: AgentCapabilityBridgeImpl;
  let mockReadHandler: any;
  let mockWriteHandler: any;

  beforeEach(() => {
    mockReadHandler = vi.fn();
    mockWriteHandler = vi.fn();

    workspaceService = {
      registerHandlers: vi.fn().mockReturnValue([
        { channel: Channels.Workspace.ReadFile, handler: mockReadHandler },
        { channel: Channels.Workspace.WriteFile, handler: mockWriteHandler }
      ])
    };

    executionService = {
      execute: vi.fn(),
      terminateSession: vi.fn().mockResolvedValue(undefined)
    };

    bridge = new AgentCapabilityBridgeImpl(workspaceService as any, executionService as any);
  });

  it('readFile routes securely through WorkspaceService via workspaceId', async () => {
    mockReadHandler.mockResolvedValue('file content');
    
    const result = await bridge.readFile(
      { workspaceId: 'test-ws-1', agentId: 'agent-1' }, 
      'src/index.ts'
    );
    
    expect(result).toBe('file content');
    expect(mockReadHandler).toHaveBeenCalledWith({ workspaceId: 'test-ws-1', path: 'src/index.ts' });
  });

  it('writeFile routes securely through WorkspaceService via workspaceId', async () => {
    mockWriteHandler.mockResolvedValue(undefined);
    
    await bridge.writeFile(
      { workspaceId: 'test-ws-2', agentId: 'agent-1' }, 
      'src/index.ts',
      'new content'
    );
    
    expect(mockWriteHandler).toHaveBeenCalledWith({ workspaceId: 'test-ws-2', path: 'src/index.ts', content: 'new content' });
  });

  it('executeCommand resolves properly and enforces constraints', async () => {
    let onDataCallback: any;
    let onExitCallback: any;

    const mockProcess = {
      onData: vi.fn((cb) => { onDataCallback = cb; }),
      onExit: vi.fn((cb) => { onExitCallback = cb; }),
    };

    executionService.execute.mockResolvedValue({
      id: 'session-1',
      process: mockProcess
    });

    const executePromise = bridge.executeCommand(
      { workspaceId: 'test-ws-3', agentId: 'agent-1' },
      'echo hello',
      'sub/dir'
    );

    // Simulate async data
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(executionService.execute).toHaveBeenCalledWith({
      workspaceId: 'test-ws-3',
      target: { kind: 'local' },
      shellOverride: {
        executable: 'powershell.exe',
        args: ['-NoProfile', '-NonInteractive', '-Command', 'echo hello']
      },
      cwdOverride: 'sub/dir'
    });

    onDataCallback(new TextEncoder().encode('hello output'));
    onExitCallback(0);

    const result = await executePromise;
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('hello output');
  });
});
