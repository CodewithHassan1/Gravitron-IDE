export enum RepositoryDiagnosticType {
  ParserFailed = 'ParserFailed',
  UnsupportedLanguage = 'UnsupportedLanguage',
  CorruptDocument = 'CorruptDocument',
  CacheMismatch = 'CacheMismatch',
  ReplayMismatch = 'ReplayMismatch',
  SnapshotMismatch = 'SnapshotMismatch',
}

export interface RepositoryDiagnostic {
  readonly id: string;
  readonly type: RepositoryDiagnosticType;
  readonly message: string;
  readonly documentId?: string;
  readonly timestamp: number;
  readonly traceContext?: Record<string, string>;
}
