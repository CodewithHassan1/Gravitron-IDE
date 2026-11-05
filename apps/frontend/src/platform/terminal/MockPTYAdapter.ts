import { IPTYAdapter, TerminalCapability } from './IPTYAdapter';

export class MockPTYAdapter implements IPTYAdapter {
  capabilities: TerminalCapability = {
    supportsResize: true,
    supportsColor: true,
    supportsUnicode: true,
    supportsShellIntegration: false,
    supportsClipboard: true,
    supportsPersistence: false,
    supportsOSC52: false,
  };

  private dataListeners: Set<(data: string) => void> = new Set();
  private exitListeners: Set<(exitCode: number) => void> = new Set();

  private cwd = '/workspace';
  private history: string[] = [];
  private historyIndex = -1;
  private currentBuffer = '';
  private promptString = '\x1b[32muser@gravitron\x1b[0m:\x1b[34m~${cwd}\x1b[0m$ ';

  // Simple in-memory FS
  private fs: Record<string, string[]> = {
    '/workspace': ['src', 'package.json', 'README.md'],
    '/workspace/src': ['index.ts', 'components'],
  };

  async spawn(
    executable: string,
    args: string[],
    cwd: string,
    env: Record<string, string>
  ): Promise<void> {
    this.cwd = cwd || '/workspace';
    setTimeout(() => {
      this.print(
        `Welcome to Gravitron IDE Mock Terminal.\r\nType 'help' to see available commands.\r\n\r\n`
      );
      this.prompt();
    }, 50);
  }

  write(data: string): void {
    switch (data) {
      case '\r': // Enter
        this.print('\r\n');
        this.executeCommand(this.currentBuffer);
        this.currentBuffer = '';
        break;
      case '\x7F': // Backspace
        if (this.currentBuffer.length > 0) {
          this.currentBuffer = this.currentBuffer.slice(0, -1);
          this.print('\b \b');
        }
        break;
      case '\x1b[A': // Up arrow
        if (this.history.length > 0) {
          if (this.historyIndex < this.history.length - 1) this.historyIndex++;
          this.replaceBuffer(this.history[this.history.length - 1 - this.historyIndex]);
        }
        break;
      case '\x1b[B': // Down arrow
        if (this.historyIndex > 0) {
          this.historyIndex--;
          this.replaceBuffer(this.history[this.history.length - 1 - this.historyIndex]);
        } else if (this.historyIndex === 0) {
          this.historyIndex = -1;
          this.replaceBuffer('');
        }
        break;
      case '\u0003': // Ctrl+C
        this.print('^C\r\n');
        this.currentBuffer = '';
        this.prompt();
        break;
      default:
        // Print printable characters
        if (data >= String.fromCharCode(32) && data <= String.fromCharCode(126)) {
          this.currentBuffer += data;
          this.print(data);
        }
    }
  }

  resize(cols: number, rows: number): void {
    // Mock ignores resize, xterm handles its own buffer size
  }

  kill(): void {
    this.exitListeners.forEach((l) => l(0));
  }

  onData(listener: (data: string) => void): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  onExit(listener: (exitCode: number) => void): () => void {
    this.exitListeners.add(listener);
    return () => this.exitListeners.delete(listener);
  }

  private print(data: string) {
    this.dataListeners.forEach((l) => l(data));
  }

  private prompt() {
    this.print(
      this.promptString.replace(
        '${cwd}',
        this.cwd === '/workspace' ? '' : this.cwd.replace('/workspace', '')
      )
    );
  }

  private replaceBuffer(newBuffer: string) {
    // Clear current line
    const backspaces = '\b \b'.repeat(this.currentBuffer.length);
    this.print(backspaces + newBuffer);
    this.currentBuffer = newBuffer;
  }

  private executeCommand(cmdStr: string) {
    const cmd = cmdStr.trim();
    if (cmd) {
      this.history.push(cmd);
      this.historyIndex = -1;
    }

    const [command, ...args] = cmd.split(' ');

    switch (command) {
      case '':
        break;
      case 'help':
        this.print(
          'Available commands: help, clear, pwd, cd, ls, mkdir, touch, cat, echo, exit\r\n'
        );
        break;
      case 'clear':
        this.print('\x1b[2J\x1b[H'); // ANSI escape sequence to clear screen
        break;
      case 'pwd':
        this.print(`${this.cwd}\r\n`);
        break;
      case 'ls':
        const files = this.fs[this.cwd] || [];
        if (files.length > 0) {
          this.print(files.join('  ') + '\r\n');
        }
        break;
      case 'cd':
        const dir = args[0] || '/workspace';
        let target = dir;
        if (!dir.startsWith('/')) {
          target = this.cwd === '/' ? `/${dir}` : `${this.cwd}/${dir}`;
        }
        if (dir === '..') {
          const parts = this.cwd.split('/');
          parts.pop();
          target = parts.length === 1 ? '/' : parts.join('/');
        }
        if (this.fs[target] || target === '/workspace') {
          this.cwd = target;
        } else {
          this.print(`cd: no such file or directory: ${dir}\r\n`);
        }
        break;
      case 'echo':
        this.print(`${args.join(' ')}\r\n`);
        break;
      case 'exit':
        this.kill();
        return; // Don't prompt again
      default:
        this.print(`command not found: ${command}\r\n`);
    }

    this.prompt();
  }
}
