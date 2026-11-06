import { describe, it, expect, vi } from 'vitest';
import { AgentCapabilityBridgeImpl } from '../AgentCapabilityBridgeImpl';
import { IWorkspaceService } from '../IWorkspaceService';
import { IWorkspaceExecutionService } from '../execution/IWorkspaceExecutionService';
import { IntelligenceManager } from '../IntelligenceManager';
import { AgentProtocol, Channels } from '@ag/protocol';

describe('AgentCapabilityBridgeImpl', () => {
  const mockWorkspaceService = {
    registerHandlers: vi.fn().mockReturnValue([
      { channel: Channels.Workspace.ReadFile, handler: async (p: any) => p },
      { channel: Channels.Workspace.WriteFile, handler: async (p: any) => p },
    ]),
  } as unknown as IWorkspaceService;

  const mockExecutionService = {
    execute: vi.fn(),
    terminateSession: vi.fn().mockResolvedValue(undefined),
  } as unknown as IWorkspaceExecutionService;

  const mockIntelligenceManager = {
    sendRequest: vi.fn(),
  } as unknown as IntelligenceManager;

  const bridge = new AgentCapabilityBridgeImpl(
    mockWorkspaceService,
    mockExecutionService,
    mockIntelligenceManager
  );

  it('binds readFile to the context workspaceId, preventing spoofing', async () => {
    const context: AgentProtocol.AgentCapabilityContext = {
      agentId: 'agent-1',
      workspaceId: 'trusted-ws-1',
      signal: new AbortController().signal,
    };

    const res = await bridge.readFile(context, '/secret.txt');
    expect(res).toEqual({ workspaceId: 'trusted-ws-1', path: '/secret.txt' });
  });

  it('binds writeFile to the context workspaceId, preventing spoofing', async () => {
    const context: AgentProtocol.AgentCapabilityContext = {
      agentId: 'agent-1',
      workspaceId: 'trusted-ws-1',
      signal: new AbortController().signal,
    };

    const res = await bridge.writeFile(context, '/secret.txt', 'data');
    expect(res).toEqual({ workspaceId: 'trusted-ws-1', path: '/secret.txt', content: 'data' });
  });

  it('routes executeCommand to WorkspaceExecutionService with bounds', async () => {
    const context: AgentProtocol.AgentCapabilityContext = {
      agentId: 'agent-1',
      workspaceId: 'trusted-ws-1',
      signal: new AbortController().signal,
    };

    const mockSession = {
      id: 'session-1',
      process: {
        onData: vi.fn((cb) => {
          cb(new TextEncoder().encode('test output'));
        }),
        onExit: vi.fn((cb) => {
          cb(0);
        }),
      },
    };

    vi.mocked(mockExecutionService.execute).mockResolvedValueOnce(mockSession as any);

    const res = await bridge.executeCommand(context, 'echo hi');

    expect(mockExecutionService.execute).toHaveBeenCalledWith({
      workspaceId: 'trusted-ws-1',
      target: { kind: 'local' },
      shellOverride: {
        executable: 'powershell.exe',
        args: ['-NoProfile', '-NonInteractive', '-Command', 'echo hi'],
      },
      cwdOverride: undefined,
    });

    expect(res.stdout).toBe('test output');
    expect(res.exitCode).toBe(0);
  });
});
