import { IProblemMatcher } from './IProblemMatcher';
import { TaskDiagnosticEvent } from '@ag/protocol';

export interface RegexProblemMatcherConfig {
  readonly id: string;
  readonly name: string;
  readonly pattern: RegExp;
  readonly fileGroup: number;
  readonly lineGroup: number;
  readonly columnGroup?: number;
  readonly severityGroup?: number;
  readonly messageGroup: number;
  readonly codeGroup?: number;
  readonly defaultSeverity?: 'error' | 'warning' | 'info';
  readonly source?: string;
}

export class RegexProblemMatcher implements IProblemMatcher {
  public readonly id: string;
  public readonly name: string;

  constructor(private readonly config: RegexProblemMatcherConfig) {
    this.id = config.id;
    this.name = config.name;
  }

  public match(line: string): TaskDiagnosticEvent | undefined {
    const match = this.config.pattern.exec(line);
    if (!match) return undefined;

    const file = match[this.config.fileGroup];
    const lineNumber = parseInt(match[this.config.lineGroup], 10);
    const message = match[this.config.messageGroup];

    if (!file || isNaN(lineNumber) || !message) {
      return undefined;
    }

    let column: number | undefined;
    if (this.config.columnGroup !== undefined) {
      const parsedCol = parseInt(match[this.config.columnGroup], 10);
      if (!isNaN(parsedCol)) {
        column = parsedCol;
      }
    }

    let severity: 'error' | 'warning' | 'info' = this.config.defaultSeverity || 'error';
    if (this.config.severityGroup !== undefined) {
      const parsedSev = match[this.config.severityGroup]?.toLowerCase();
      if (parsedSev === 'warning' || parsedSev === 'error' || parsedSev === 'info') {
        severity = parsedSev;
      }
    }

    let code: string | undefined;
    if (this.config.codeGroup !== undefined) {
      code = match[this.config.codeGroup];
    }

    return {
      file,
      line: lineNumber,
      column,
      severity,
      message,
      code,
      source: this.config.source || this.name,
    };
  }
}
