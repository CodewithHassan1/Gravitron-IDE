export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, any>;
  outputSchema?: Record<string, any>;
}

export interface McpInitializeResult {
  protocolVersion: string;
  capabilities: Record<string, any>;
  serverInfo: {
    name: string;
    version: string;
  };
}

export interface McpToolCallResult {
  content: Array<{ type: string; text?: string; [key: string]: any }>;
  isError?: boolean;
  structuredContent?: any;
}

export interface AgentRouterClientOptions {
  endpoint?: string;
  timeoutMs?: number;
  clientName?: string;
  clientVersion?: string;
}

export class AgentRouterClient {
  private endpoint: string;
  private timeoutMs: number;
  private clientName: string;
  private clientVersion: string;
  private sessionId?: string;
  private cookies?: string;
  private requestId = 0;
  private initialized = false;
  private serverInfo?: McpInitializeResult['serverInfo'];

  constructor(options: AgentRouterClientOptions = {}) {
    this.endpoint = options.endpoint || 'https://agent-router.org/mcp';
    this.timeoutMs = options.timeoutMs || 30000;
    this.clientName = options.clientName || 'gravitron-ide';
    this.clientVersion = options.clientVersion || '1.0.0';
  }

  public get isInitialized(): boolean {
    return this.initialized;
  }

  public getServerInfo(): McpInitializeResult['serverInfo'] | undefined {
    return this.serverInfo;
  }

  public getEndpoint(): string {
    return this.endpoint;
  }

  private getNextId(): number {
    return ++this.requestId;
  }

  /**
   * Sends a JSON-RPC 2.0 message over HTTP POST in anonymous mode.
   * Explicitly avoids sending Authorization headers or credentials.
   */
  private async postRpc<T>(method: string, params?: Record<string, any>): Promise<T> {
    const isNotification = !params && method.startsWith('notifications/');
    const id = isNotification ? undefined : this.getNextId();

    const payload: Record<string, any> = {
      jsonrpc: '2.0',
      method,
    };
    if (id !== undefined) payload.id = id;
    if (params !== undefined) payload.params = params;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };

    if (this.sessionId) {
      headers['mcp-session-id'] = this.sessionId;
    }
    if (this.cookies) {
      headers['cookie'] = this.cookies;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      let fetchFn: typeof fetch = fetch;
      // Electron 29's built-in Undici fetch throws UND_ERR_REQ_CONTENT_LENGTH_MISMATCH
      // when following HTTP 308 POST redirects. Use Electron's Chromium net.fetch in Electron.
      if (typeof process !== 'undefined' && Boolean((process.versions as any)?.electron)) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const electronMod = require('electron');
          if (electronMod?.net?.fetch) {
            fetchFn = electronMod.net.fetch.bind(electronMod.net);
          }
        } catch {
          // Fallback to global fetch if electron module is unavailable
        }
      }

      res = await fetchFn(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        redirect: 'follow',
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`MCP request to ${this.endpoint} timed out after ${this.timeoutMs}ms`);
      }
      throw new Error(`MCP connection to ${this.endpoint} failed: ${err.message}`);
    } finally {
      clearTimeout(timeoutId);
    }

    // Capture session state if returned
    const sessionHeader = res.headers.get('mcp-session-id');
    if (sessionHeader) {
      this.sessionId = sessionHeader;
    }
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      this.cookies = setCookie;
    }

    // Check HTTP status
    if (res.status === 401 || res.status === 403) {
      let bodySnippet = '';
      try {
        bodySnippet = (await res.text()).slice(0, 300);
      } catch {
        // Ignore read error
      }
      throw new Error(
        `MCP authentication error: HTTP ${res.status} from ${this.endpoint}. Response: ${bodySnippet}`
      );
    }

    if (isNotification && (res.status === 200 || res.status === 202 || res.status === 204)) {
      return undefined as unknown as T;
    }

    if (!res.ok) {
      let errBody = '';
      try {
        errBody = (await res.text()).slice(0, 300);
      } catch {
        // Ignore read error
      }
      throw new Error(
        `MCP HTTP error: ${res.status} ${res.statusText} from ${this.endpoint}. Detail: ${errBody}`
      );
    }

    const json = (await res.json()) as any;
    if (json.error) {
      throw new Error(`MCP RPC error ${json.error.code}: ${json.error.message}`);
    }

    return json.result as T;
  }

  /**
   * Initializes the anonymous MCP session.
   */
  public async initialize(): Promise<McpInitializeResult> {
    const result = await this.postRpc<McpInitializeResult>('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: this.clientName,
        version: this.clientVersion,
      },
    });

    this.serverInfo = result.serverInfo;
    this.initialized = true;

    // Send initialized notification as required by MCP protocol specification
    try {
      await this.postRpc<void>('notifications/initialized');
    } catch {
      // Non-fatal if server does not require notification ack
    }

    return result;
  }

  /**
   * Discovers all available tools from the AgentRouter specialist network.
   */
  public async listTools(): Promise<McpToolDefinition[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const result = await this.postRpc<{ tools: McpToolDefinition[] }>('tools/list', {});
    return result?.tools || [];
  }

  /**
   * Invokes an AgentRouter specialist agent tool.
   */
  public async callTool(name: string, args: Record<string, any>): Promise<McpToolCallResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const result = await this.postRpc<McpToolCallResult>('tools/call', {
      name,
      arguments: args,
    });

    return result;
  }
}
