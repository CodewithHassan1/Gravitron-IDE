export type TerminalEvent =
  | { category: 'data'; kind: 'output'; sessionId: string; data: Uint8Array }
  | { category: 'data'; kind: 'resizeAck'; sessionId: string; cols: number; rows: number }
  | { category: 'lifecycle'; kind: 'exit'; sessionId: string; exitCode?: number }
  | { category: 'diagnostic'; kind: 'error'; sessionId: string; error: string }
  | { category: 'diagnostic'; kind: 'warning'; sessionId: string; warning: string }
  | { category: 'ui'; kind: 'bell'; sessionId: string }
  | { category: 'ui'; kind: 'titleChanged'; sessionId: string; title: string };
