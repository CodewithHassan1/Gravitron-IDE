import { GitChange } from './GitModels';

export class GitDiffEngine {
  /**
   * Classifies file changes into GitChange array from parsed status lines.
   */
  static classifyChanges(statusEntries: { path: string; status: string }[]): GitChange[] {
    return statusEntries.map((entry) => ({
      path: entry.path,
      status: entry.status as GitChange['status'],
    }));
  }

  /**
   * Simple unified diff parser to extract added/removed lines
   * for Monaco gutter decorations.
   */
  static parseDecorations(
    diffText: string
  ): { type: 'added' | 'deleted' | 'modified'; line: number }[] {
    const decorations: { type: 'added' | 'deleted' | 'modified'; line: number }[] = [];
    if (!diffText) return decorations;

    let currentLine = 0;
    const lines = diffText.split('\n');

    for (const line of lines) {
      if (line.startsWith('@@ ')) {
        // Extract new start line: @@ -old,old_count +new,new_count @@
        const match = line.match(/\+([0-9]+)/);
        if (match) {
          currentLine = parseInt(match[1], 10) - 1;
        }
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        currentLine++;
        decorations.push({ type: 'added', line: currentLine });
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        decorations.push({ type: 'deleted', line: currentLine > 0 ? currentLine : 1 });
      } else if (!line.startsWith('\\')) {
        currentLine++;
      }
    }

    return decorations;
  }
}
