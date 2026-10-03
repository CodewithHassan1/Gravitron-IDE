export const ServiceIds = {
  Window: Symbol.for('Window'),
  Terminal: Symbol.for('Terminal'),
  Workspace: Symbol.for('Workspace'),
  WorkspaceExecution: Symbol.for('WorkspaceExecution'),
  Git: Symbol.for('Git'),
  AI: Symbol.for('AI'),
  ExternalLink: Symbol.for('ExternalLink'),
  Extensions: Symbol.for('Extensions'),
  Debug: Symbol.for('Debug'),
  Search: Symbol.for('Search'),
  Indexing: Symbol.for('Indexing'),
  Intelligence: Symbol.for('Intelligence'),
  Tasks: Symbol.for('Tasks'),
  AgentIpc: Symbol.for('AgentIpc'),
  Settings: Symbol.for('Settings'),
  Telemetry: Symbol.for('Telemetry'),
  Update: Symbol.for('Update'),
  Menu: Symbol.for('Menu'),
  WebSocketTerminal: Symbol.for('WebSocketTerminal'),
} as const;

export type ServiceId = typeof ServiceIds[keyof typeof ServiceIds];
