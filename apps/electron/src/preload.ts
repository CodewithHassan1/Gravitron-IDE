import { contextBridge, ipcRenderer } from 'electron';
import { Channels, TerminalProtocol, RequestEnvelope, ProtocolVersion, unwrapIpcResponse } from '@ag/protocol';

console.log('[FORENSIC:PRELOAD:INIT] preload.ts is executing!');


window.addEventListener('error', (event) => {
  console.log(`[BROWSER CONSOLE] UNCAUGHT ERROR: ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`);
  if (event.error && event.error.stack) {
    console.log(`[BROWSER CONSOLE] STACK: ${event.error.stack}`);
  }
});

contextBridge.exposeInMainWorld('agApi', {
  terminal: {
    create: async (config: TerminalProtocol.TerminalCreateRequestOptions) => {
      const envelope: RequestEnvelope<TerminalProtocol.TerminalCreateRequestOptions> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: config
      };
      const response = await ipcRenderer.invoke(Channels.Terminal.CreateRequest, envelope);
      return unwrapIpcResponse<any>(response).sessionId; // Extract ID from response payload
    },
    resize: (sessionId: string, cols: number, rows: number) => {
      const envelope: RequestEnvelope<any> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: { sessionId, cols, rows }
      };
      return ipcRenderer.invoke(Channels.Terminal.ResizeRequest, envelope);
    },
    kill: (sessionId: string) => {
      const envelope: RequestEnvelope<any> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: sessionId
      };
      return ipcRenderer.invoke(Channels.Terminal.DestroyRequest, envelope);
    },
    list: async () => {
      const envelope: RequestEnvelope<any> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: {}
      };
      const response = await ipcRenderer.invoke(Channels.Terminal.ListSessionsRequest, envelope);
      return unwrapIpcResponse<any>(response).sessions;
    },
    getProfiles: async () => {
      const envelope: RequestEnvelope<any> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: {}
      };
      const response = await ipcRenderer.invoke(Channels.Terminal.GetProfilesRequest, envelope);
      return unwrapIpcResponse<any>(response);
    },
    attach: async (sessionId: string) => {
      const envelope: RequestEnvelope<string> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: sessionId
      };
      const response = await ipcRenderer.invoke(Channels.Terminal.AttachSessionRequest, envelope);
      const payload = unwrapIpcResponse<any>(response);
      return {
        history: payload.history instanceof Buffer ? new Uint8Array(payload.history) : payload.history,
        send: (data: Uint8Array) => {
          const envelope: RequestEnvelope<any> = {
            version: ProtocolVersion.V1,
            requestId: crypto.randomUUID(),
            payload: { sessionId, data }
          };
          ipcRenderer.invoke(Channels.Terminal.WriteRequest, envelope);
        },
        subscribe: (callback: (event: TerminalProtocol.TerminalEvent) => void) => {
          const handler = (_event: any, payload: any) => {
            if (payload?.sessionId === sessionId) {
              if (payload.type === 'data') {
                const data = payload.data instanceof Buffer ? new Uint8Array(payload.data) : payload.data;
                callback({ ...payload, data } as TerminalProtocol.TerminalEvent);
              } else {
                callback(payload as TerminalProtocol.TerminalEvent);
              }
            }
          };
          ipcRenderer.on(Channels.Terminal.OnEvent, handler);
          return {
            dispose: () => {
              ipcRenderer.removeListener(Channels.Terminal.OnEvent, handler);
            }
          };
        },
        detach: () => {
          const envelope: RequestEnvelope<string> = {
            version: ProtocolVersion.V1,
            requestId: crypto.randomUUID(),
            payload: sessionId
          };
          ipcRenderer.invoke(Channels.Terminal.DetachSessionRequest, envelope);
        },
        dispose: () => {
          // just an alias for kill
          const envelope: RequestEnvelope<any> = {
            version: ProtocolVersion.V1,
            requestId: crypto.randomUUID(),
            payload: sessionId
          };
          ipcRenderer.invoke(Channels.Terminal.DestroyRequest, envelope);
        }
      };
    },
    detach: (sessionId: string) => {
      const envelope: RequestEnvelope<string> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: sessionId
      };
      return ipcRenderer.invoke(Channels.Terminal.DetachSessionRequest, envelope);
    }
  },
  workspace: {
    openFile: async () => {
      const envelope: RequestEnvelope<void> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: undefined
      };
      return ipcRenderer.invoke(Channels.Workspace.OpenFileRequest, envelope);
    },
    search: async (workspaceId: string, query: string, options?: any) => {
      const envelope: RequestEnvelope<any> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: { workspaceId, query, options }
      };
      return ipcRenderer.invoke(Channels.Workspace.SearchRequest, envelope);
    },
    open: (path: string) => {
      const envelope: RequestEnvelope<string> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: path
      };
      return ipcRenderer.invoke(Channels.Workspace.Open, envelope);
    },
    close: (workspaceId: string) => {
      const envelope: RequestEnvelope<string> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: workspaceId
      };
      return ipcRenderer.invoke(Channels.Workspace.Close, envelope);
    },
    selectAndOpen: async () => {
      console.log('[FORENSIC:PRELOAD:OPEN] Sending open request');
      const envelope: RequestEnvelope<void> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: undefined
      };
      const response = await ipcRenderer.invoke(Channels.Workspace.SelectFolderRequest, envelope);
      console.log('[FORENSIC:PRELOAD:OPEN] response received from ipcRenderer.invoke:', response);
      return response;
    },
    getDefaultWorkspace: async () => {
      const envelope: RequestEnvelope<void> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: undefined
      };
      return ipcRenderer.invoke(Channels.Workspace.GetDefaultWorkspaceRequest, envelope);
    },
    readDirectory: async (workspaceId: string, path: string) => {
      console.log('[FORENSIC:PRELOAD:READDIR] workspaceId:', workspaceId, 'path:', path);
      const envelope: RequestEnvelope<{ workspaceId: string, path: string }> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: { workspaceId, path }
      };
      const response = await ipcRenderer.invoke(Channels.Workspace.ReadDirectory, envelope);
      console.log('[FORENSIC:PRELOAD:READDIR] response received:', response);
      return response;
    },
    readFile: (workspaceId: string, path: string) => {
      const envelope: RequestEnvelope<{ workspaceId: string, path: string }> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: { workspaceId, path }
      };
      return ipcRenderer.invoke(Channels.Workspace.ReadFile, envelope);
    },
    writeFile: (workspaceId: string, path: string, content: string | Uint8Array, mutationId?: string) => {
      const envelope: RequestEnvelope<{ workspaceId: string, path: string, content: string | Uint8Array, mutationId?: string }> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: { workspaceId, path, content, mutationId }
      };
      return ipcRenderer.invoke(Channels.Workspace.WriteFile, envelope);
    },
    createFile: (workspaceId: string, path: string, mutationId?: string) => {
      const envelope: RequestEnvelope<{ workspaceId: string, path: string, mutationId?: string }> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: { workspaceId, path, mutationId }
      };
      return ipcRenderer.invoke(Channels.Workspace.CreateFile, envelope);
    },
    createFolder: (workspaceId: string, path: string, mutationId?: string) => {
      const envelope: RequestEnvelope<{ workspaceId: string, path: string, mutationId?: string }> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: { workspaceId, path, mutationId }
      };
      return ipcRenderer.invoke(Channels.Workspace.CreateFolder, envelope);
    },
    deleteFile: (workspaceId: string, path: string, mutationId?: string) => {
      const envelope: RequestEnvelope<{ workspaceId: string, path: string, mutationId?: string }> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: { workspaceId, path, mutationId }
      };
      return ipcRenderer.invoke(Channels.Workspace.DeleteFile, envelope);
    },
    deleteFolder: (workspaceId: string, path: string, mutationId?: string) => {
      const envelope: RequestEnvelope<{ workspaceId: string, path: string, mutationId?: string }> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: { workspaceId, path, mutationId }
      };
      return ipcRenderer.invoke(Channels.Workspace.DeleteFolder, envelope);
    },
    renameFile: (workspaceId: string, path: string, newPath: string, mutationId?: string) => {
      const envelope: RequestEnvelope<{ workspaceId: string, path: string, newPath: string, mutationId?: string }> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: { workspaceId, path, newPath, mutationId }
      };
      return ipcRenderer.invoke(Channels.Workspace.RenameFile, envelope);
    },
    renameFolder: (workspaceId: string, path: string, newPath: string, mutationId?: string) => {
      const envelope: RequestEnvelope<{ workspaceId: string, path: string, newPath: string, mutationId?: string }> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: { workspaceId, path, newPath, mutationId }
      };
      return ipcRenderer.invoke(Channels.Workspace.RenameFolder, envelope);
    },
    moveFile: (workspaceId: string, path: string, newPath: string, mutationId?: string) => {
      const envelope: RequestEnvelope<{ workspaceId: string, path: string, newPath: string, mutationId?: string }> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: { workspaceId, path, newPath, mutationId }
      };
      return ipcRenderer.invoke(Channels.Workspace.MoveFile, envelope);
    },
    copy: (workspaceId: string, path: string, newPath: string, mutationId?: string) => {
      const envelope: RequestEnvelope<{ workspaceId: string, path: string, newPath: string, mutationId?: string }> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: { workspaceId, path, newPath, mutationId }
      };
      return ipcRenderer.invoke(Channels.Workspace.Copy, envelope);
    },

    subscribe: (callback: (event: any) => void) => {
      const handler = (_event: any, payload: any) => {
        callback(payload);
      };
      ipcRenderer.on(Channels.Workspace.OnEvent, handler);
      return {
        dispose: () => {
          ipcRenderer.removeListener(Channels.Workspace.OnEvent, handler);
        }
      };
    }
  },
  agent: {
    start: async (workspaceId: string, conversationId: string, prompt: string, providerType: any, providerConfig: any, accessToken?: string) => {
      const envelope: RequestEnvelope<any> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: { workspaceId, conversationId, prompt, providerType, providerConfig, accessToken }
      };
      const response = await ipcRenderer.invoke(Channels.Agent.StartRequest, envelope);
      return unwrapIpcResponse<any>(response).agentId;
    },
    cancel: (agentId: string) => {
      const envelope: RequestEnvelope<any> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: { agentId }
      };
      return ipcRenderer.invoke(Channels.Agent.CancelRequest, envelope);
    },
    snapshot: async (agentId: string) => {
      const envelope: RequestEnvelope<any> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: { agentId }
      };
      const response = await ipcRenderer.invoke(Channels.Agent.SnapshotRequest, envelope);
      return unwrapIpcResponse<any>(response);
    },
    approveTool: (agentId: string, approvalId: string, toolCallId: string, approved: boolean) => {
      const envelope: RequestEnvelope<any> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: { agentId, approvalId, toolCallId, approved }
      };
      return ipcRenderer.invoke(Channels.Agent.ApproveToolRequest, envelope);
    },
    subscribe: (callback: (event: any) => void) => {
      const handler = (_event: any, payload: any) => {
        callback(payload);
      };
      ipcRenderer.on(Channels.Agent.OnEvent, handler);
      return {
        dispose: () => {
          ipcRenderer.removeListener(Channels.Agent.OnEvent, handler);
        }
      };
    }
  },
  app: {
    quit: () => {
      const envelope: RequestEnvelope<void> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: undefined
      };
      return ipcRenderer.invoke(Channels.App.QuitRequest, envelope);
    }
  },
  window: {
    create: () => {
      const envelope: RequestEnvelope<void> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: undefined
      };
      return ipcRenderer.invoke(Channels.Window.CreateRequest, envelope);
    },
    close: () => {
      const envelope: RequestEnvelope<void> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: undefined
      };
      return ipcRenderer.invoke(Channels.Window.CloseRequest, envelope);
    },
    openExternal: (url: string) => {
      const envelope: RequestEnvelope<string> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: url
      };
      return ipcRenderer.invoke(Channels.Window.OpenExternalRequest, envelope);
    },
    setApplicationMenu: (menuTree: any) => {
      const envelope: RequestEnvelope<any> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: menuTree
      };
      return ipcRenderer.invoke(Channels.Window.SetApplicationMenu, envelope);
    },
    updateMenuState: (updates: any[]) => {
      const envelope: RequestEnvelope<any[]> = {
        version: ProtocolVersion.V1,
        requestId: crypto.randomUUID(),
        payload: updates
      };
      return ipcRenderer.invoke(Channels.Window.UpdateMenuState, envelope);
    },
    onMenuCommand: (callback: (commandId: string) => void) => {
      const handler = (_event: any, payload: any) => {
        callback(payload); // payload is the commandId string
      };
      ipcRenderer.on(Channels.Window.OnMenuCommand, handler);
      return {
        dispose: () => {
          ipcRenderer.removeListener(Channels.Window.OnMenuCommand, handler);
        }
      };
    }
  }
});
