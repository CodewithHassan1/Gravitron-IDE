import { TaskDiagnosticEvent } from '@ag/protocol';

export interface IProblemMatcher {
  readonly id: string;
  readonly name: string;

  /**
   * Process a single line of output and return a diagnostic event if it matches a problem.
   */
  match(line: string): TaskDiagnosticEvent | undefined;
}
