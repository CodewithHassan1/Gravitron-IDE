export namespace IntelligenceProtocol {
  /**
   * Defines the type of intelligence request being sent to the worker.
   */
  export enum IntelligenceRequestType {
    Handshake = 'Handshake',
    WorkspaceOpen = 'WorkspaceOpen',
    WorkspaceClose = 'WorkspaceClose',
    SearchWorkspace = 'SearchWorkspace',
    FindDefinition = 'FindDefinition',
    FindReferences = 'FindReferences',
    GetRepositoryMap = 'GetRepositoryMap',
    SemanticSearch = 'SemanticSearch',
    AddEpisodicMemory = 'AddEpisodicMemory',
    GetEpisodicMemory = 'GetEpisodicMemory',
    AddLongTermMemory = 'AddLongTermMemory',
    GetLongTermMemory = 'GetLongTermMemory',
    SearchLongTermMemory = 'SearchLongTermMemory',
  }

  export interface IntelligenceError {
    code: string;
    message: string;
    stack?: string;
  }

  export interface HandshakePayload {
    version: string;
  }

  export interface WorkspaceOpenPayload {
    workspaceId: string;
    workspacePath: string;
  }

  export interface WorkspaceClosePayload {
    workspaceId: string;
  }

  export interface RepositoryQuery {
    query: string;
    type: 'structural' | 'regex' | 'fuzzy';
    fileTypes?: string[];
  }

  export interface SymbolQuery {
    symbolName: string;
    filePath?: string;
  }

  export interface ReferenceQuery {
    symbolName: string;
    filePath?: string;
  }

  // Handshake uses a separate envelope since it has no workspace context
  export interface HandshakeRequestEnvelope {
    requestId: string;
    type: IntelligenceRequestType.Handshake;
    payload: HandshakePayload;
  }

  export interface HandshakeResponseEnvelope {
    requestId: string;
    success: boolean;
    payload?: HandshakePayload;
    error?: IntelligenceError;
  }

  // Common wrapper for all workspace-scoped intelligence requests
  export interface IntelligenceRequestEnvelope<T = any> {
    requestId: string;
    workspaceId: string;
    type: Exclude<IntelligenceRequestType, IntelligenceRequestType.Handshake>;
    payload: T;
  }

  // Common wrapper for all workspace-scoped intelligence responses
  export interface IntelligenceResponseEnvelope<T = any> {
    requestId: string;
    workspaceId: string;
    success: boolean;
    payload?: T;
    error?: IntelligenceError;
  }

  export type AnyIntelligenceRequest = HandshakeRequestEnvelope | IntelligenceRequestEnvelope;
  export type AnyIntelligenceResponse = HandshakeResponseEnvelope | IntelligenceResponseEnvelope;
}
