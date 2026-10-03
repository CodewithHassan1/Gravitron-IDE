import { IntelligenceProtocol } from '@ag/protocol';
import { AGLogger } from '@ag/logger';
import { SQLiteStore } from './db/SQLiteStore';
import { SQLiteProvider } from './providers/SQLiteProvider';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import { IncrementalIndexer } from './pipeline/IncrementalIndexer';
import { TypeScriptParser } from './pipeline/TypeScriptParser';
import { SnapshotModel } from './db/SnapshotModel';
import { ProviderFactory, ProviderType } from '@ag/ai-providers';

const logger = new AGLogger('worker-intelligence', '1.0.0');

interface WorkspaceData {
  store: SQLiteStore;
  provider: SQLiteProvider;
  indexer: IncrementalIndexer;
  watcher?: fs.FSWatcher;
}

const workspaces = new Map<string, WorkspaceData>();

function scanWorkspace(dir: string, workspaceId: string, workspacePath: string, indexer: IncrementalIndexer) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanWorkspace(fullPath, workspaceId, workspacePath, indexer);
    } else if (entry.isFile() && (fullPath.endsWith('.ts') || fullPath.endsWith('.js') || fullPath.endsWith('.tsx') || fullPath.endsWith('.jsx'))) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        indexer.queueUpdate(workspacePath, fullPath, content, Date.now());
      } catch (e) {
        // ignore read errors
      }
    }
  }
}

async function getProvider(workspaceId: string, workspacePath?: string): Promise<SQLiteProvider> {
  let ws = workspaces.get(workspaceId);
  if (!ws) {
    const appData = path.join(os.homedir(), '.gemini', 'antigravity-ide', 'worker-intelligence');
    if (!fs.existsSync(appData)) {
      fs.mkdirSync(appData, { recursive: true });
    }
    const dbPath = path.join(appData, `${workspaceId.replace(/[^a-zA-Z0-9-]/g, '_')}.sqlite`);

    const store = new SQLiteStore(workspaceId, dbPath);
    await store.initialize();
    const model = new SnapshotModel(store);
    const parser = new TypeScriptParser();
    
    let embeddingProvider;
    if (process.env.OPENAI_API_KEY) {
      embeddingProvider = ProviderFactory.createProvider('openai', { apiKey: process.env.OPENAI_API_KEY });
    }
    
    const provider = new SQLiteProvider(store.getDb(), embeddingProvider as any);
    const indexer = new IncrementalIndexer(parser, model, embeddingProvider as any);

    let watcher: NodeJS.Timeout | undefined;
    if (workspacePath && fs.existsSync(workspacePath)) {
      const realWorkspacePath = fs.realpathSync(workspacePath);
      
      const fileMtimes = new Map<string, number>();
      
      const pollWorkspace = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const currentFiles = new Set<string>();
        
        for (const entry of entries) {
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            pollWorkspace(fullPath);
          } else if (entry.isFile() && fullPath.match(/\.(ts|js|tsx|jsx)$/)) {
            currentFiles.add(fullPath);
            try {
              const mtime = fs.statSync(fullPath).mtimeMs;
              const lastMtime = fileMtimes.get(fullPath);
              if (lastMtime !== mtime) {
                fileMtimes.set(fullPath, mtime);
                const content = fs.readFileSync(fullPath, 'utf8');
                indexer.queueUpdate(realWorkspacePath, fullPath, content, Date.now());
              }
            } catch (e) {}
          }
        }
        
        // Remove deleted files
        for (const fullPath of Array.from(fileMtimes.keys())) {
          if (fullPath.startsWith(dir) && !currentFiles.has(fullPath) && path.dirname(fullPath) === dir) {
            fileMtimes.delete(fullPath);
            indexer.queueDelete(realWorkspacePath, fullPath, Date.now());
          }
        }
      };

      pollWorkspace(realWorkspacePath);
      watcher = setInterval(() => {
        pollWorkspace(realWorkspacePath);
      }, 300);
    }

    ws = { store, provider, indexer, watcher: watcher as any };
    workspaces.set(workspaceId, ws);
  }
  return ws.provider;
}

function sendResponse(response: IntelligenceProtocol.AnyIntelligenceResponse) {
  if (process.send) {
    process.send(response);
  } else {
    logger.warn({ trace_id: 'init', span_id: 'init', request_id: 'init' }, 'process.send is undefined, cannot send response');
  }
}

async function handleMessage(message: IntelligenceProtocol.AnyIntelligenceRequest) {
  logger.info({ trace_id: 'init', span_id: 'init', request_id: 'init' }, `Received intelligence request: ${message.type} (requestId: ${message.requestId})`);

  try {
    switch (message.type) {
      case IntelligenceProtocol.IntelligenceRequestType.Handshake:
        sendResponse({
          requestId: message.requestId,
          success: true,
          payload: { version: '1.0.0' }
        });
        break;

      case IntelligenceProtocol.IntelligenceRequestType.WorkspaceOpen:
        const openPayload = message.payload as IntelligenceProtocol.WorkspaceOpenPayload;
        logger.info({ trace_id: 'init', span_id: 'init', request_id: 'init' }, `Opened workspace: ${openPayload.workspaceId} at ${openPayload.workspacePath}`);
        // Ensure initialized
        await getProvider(openPayload.workspaceId, openPayload.workspacePath);

        sendResponse({
          requestId: message.requestId,
          workspaceId: (message as IntelligenceProtocol.IntelligenceRequestEnvelope).workspaceId,
          success: true
        });
        break;

      case IntelligenceProtocol.IntelligenceRequestType.WorkspaceClose:
        const closePayload = message.payload as IntelligenceProtocol.WorkspaceClosePayload;
        logger.info({ trace_id: 'init', span_id: 'init', request_id: 'init' }, `Closed workspace: ${closePayload.workspaceId}`);
        const ws = workspaces.get(closePayload.workspaceId);
        if (ws) {
          if (ws.watcher) ws.watcher.close();
          await ws.store.close();
          workspaces.delete(closePayload.workspaceId);
        }
        sendResponse({
          requestId: message.requestId,
          workspaceId: (message as IntelligenceProtocol.IntelligenceRequestEnvelope).workspaceId,
          success: true
        });
        break;

      case IntelligenceProtocol.IntelligenceRequestType.SearchWorkspace: {
        const payload = message.payload as any; // { query, options }
        const provider = await getProvider((message as IntelligenceProtocol.IntelligenceRequestEnvelope).workspaceId);
        const result = await provider.searchSymbols(
          (message as IntelligenceProtocol.IntelligenceRequestEnvelope).workspaceId,
          payload.query,
          payload.options
        );
        sendResponse({
          requestId: message.requestId,
          workspaceId: (message as IntelligenceProtocol.IntelligenceRequestEnvelope).workspaceId,
          success: true,
          payload: result
        });
        break;
      }

      case IntelligenceProtocol.IntelligenceRequestType.FindDefinition: {
        const payload = message.payload as any; // { symbolName, options }
        const provider = await getProvider((message as IntelligenceProtocol.IntelligenceRequestEnvelope).workspaceId);
        const result = await provider.findDefinition(
          (message as IntelligenceProtocol.IntelligenceRequestEnvelope).workspaceId,
          payload.symbolName,
          payload.options
        );
        sendResponse({
          requestId: message.requestId,
          workspaceId: (message as IntelligenceProtocol.IntelligenceRequestEnvelope).workspaceId,
          success: true,
          payload: result
        });
        break;
      }

      case IntelligenceProtocol.IntelligenceRequestType.FindReferences: {
        const payload = message.payload as any; // { symbolName, options }
        const provider = await getProvider((message as IntelligenceProtocol.IntelligenceRequestEnvelope).workspaceId);
        const result = await provider.findReferences(
          (message as IntelligenceProtocol.IntelligenceRequestEnvelope).workspaceId,
          payload.symbolName,
          payload.options
        );
        sendResponse({
          requestId: message.requestId,
          workspaceId: (message as IntelligenceProtocol.IntelligenceRequestEnvelope).workspaceId,
          success: true,
          payload: result
        });
        break;
      }
      case IntelligenceProtocol.IntelligenceRequestType.GetRepositoryMap: {
        const provider = await getProvider((message as IntelligenceProtocol.IntelligenceRequestEnvelope).workspaceId);
        const result = await provider.getRepositoryMap(
          (message as IntelligenceProtocol.IntelligenceRequestEnvelope).workspaceId
        );
        sendResponse({
          requestId: message.requestId,
          workspaceId: (message as IntelligenceProtocol.IntelligenceRequestEnvelope).workspaceId,
          success: true,
          payload: result
        });
        break;
      }

      case IntelligenceProtocol.IntelligenceRequestType.SemanticSearch: {
        const payload = message.payload as any; // { query, options }
        const provider = await getProvider((message as IntelligenceProtocol.IntelligenceRequestEnvelope).workspaceId);
        const result = await provider.semanticSearch(
          (message as IntelligenceProtocol.IntelligenceRequestEnvelope).workspaceId,
          payload.query,
          payload.options
        );
        sendResponse({
          requestId: message.requestId,
          workspaceId: (message as IntelligenceProtocol.IntelligenceRequestEnvelope).workspaceId,
          success: true,
          payload: result
        });
        break;
      }
      default:
        const unkMsg = message as any;
        logger.warn({ trace_id: 'init', span_id: 'init', request_id: 'init' }, `Unknown intelligence request type: ${unkMsg.type}`);
        sendResponse({
          requestId: unkMsg.requestId,
          workspaceId: unkMsg.workspaceId,
          success: false,
          error: {
            code: 'UNKNOWN_REQUEST',
            message: `Unknown intelligence request type: ${unkMsg.type}`
          }
        });
    }
  } catch (err: any) {
    const catchMsg = message as any;
    logger.error({ trace_id: 'init', span_id: 'init', request_id: 'init' }, `Error handling message: ${err.message}`);
    console.error('[worker-intelligence FATAL ERROR TRACE]', err.stack);
    sendResponse({
      requestId: catchMsg.requestId,
      workspaceId: catchMsg.workspaceId,
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: err.message,
        stack: err.stack
      }
    });
  }
}

// Ensure we handle process exit gracefully
process.on('SIGTERM', () => {
  logger.info({ trace_id: 'init', span_id: 'init', request_id: 'init' }, 'Received SIGTERM, shutting down worker-intelligence');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info({ trace_id: 'init', span_id: 'init', request_id: 'init' }, 'Received SIGINT, shutting down worker-intelligence');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  logger.error({ trace_id: 'init', span_id: 'init', request_id: 'init' }, err as any);
  process.exit(1); // Force exit so IntelligenceManager detects crash
});

process.on('message', (message: IntelligenceProtocol.AnyIntelligenceRequest) => {
  const msgAny = message as any;
  // Gate 4A.1 Runtime enforcement
  if (msgAny.type !== IntelligenceProtocol.IntelligenceRequestType.Handshake && !('workspaceId' in msgAny)) {
    sendResponse({
      requestId: msgAny.requestId,
      success: false,
      error: {
        code: 'MISSING_WORKSPACE_ID',
        message: 'workspaceId is required for this request type'
      }
    });
    return;
  }

  handleMessage(message);
});

logger.info({ trace_id: 'init', span_id: 'init', request_id: 'init' }, 'Worker Intelligence process started');
