import { IProcess } from './types';
import { IExecutionBackend, ExecutionBackendCapabilities } from './IExecutionBackend';
import { NodePTYAdapter } from './NodePTYAdapter';
import * as pty from 'node-pty';
import { ExecutionBackendKind, ExecutionContext } from '@ag/protocol';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

export class LocalBackend implements IExecutionBackend {
  public readonly kind: ExecutionBackendKind = 'local';

  public readonly capabilities: ExecutionBackendCapabilities = {
    supportsResize: true,
    supportsSignals: true,
    supportsReconnect: true,
    supportsPersistentSessions: false,
    supportsEnvironmentVariables: true,
    supportsWorkingDirectory: true,
    supportsHistory: true,
    supportsBinaryStreams: true,
    supportsDetach: false,
    supportsAttach: false,
    supportsTitleEvents: true,
  };

  private processes = new Map<string, IProcess>();

  constructor() {}

  private prepareShellIntegration(
    executable: string,
    originalArgs: readonly string[]
  ): { executable: string; args: string[] } {
    const execLower = executable.toLowerCase();

    if (execLower.includes('powershell') || execLower.includes('pwsh')) {
      const integrationDir = path.join(os.tmpdir(), 'ag-ide-integration');
      if (!fs.existsSync(integrationDir)) {
        fs.mkdirSync(integrationDir, { recursive: true });
      }

      const ps1Path = path.join(integrationDir, `ps-${randomUUID()}.ps1`);

      const psScript = `
$e = [char]27
$a = [char]7
function prompt {
    $p = $pwd.ProviderPath
    # Emit OSC 7 for CWD
    $uri = "file://localhost/" + $p.Replace('\\', '/')
    Write-Host -NoNewline "$e]7;$uri$a"
    # Emit OSC 0 for Title (Idle)
    Write-Host -NoNewline "$e]0;PowerShell$a"
    return "PS $p> "
}

# Hook command execution for Active Title if PSReadLine is available
if (Get-Module PSReadLine) {
    Set-PSReadLineKeyHandler -Key Enter -ScriptBlock {
        $line = $null
        $cursor = $null
        [Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState([ref]$line, [ref]$cursor)
        $cmd = $line.Trim()
        if ($cmd) {
            $first = $cmd.Split(' ')[0]
            Write-Host -NoNewline "$e]0;$first$a"
        }
        [Microsoft.PowerShell.PSConsoleReadLine]::AcceptLine()
    }
}
`;
      fs.writeFileSync(ps1Path, psScript, 'utf8');

      // Inject integration script
      const newArgs = ['-NoLogo', '-NoExit', '-Command', `. '${ps1Path}'`];
      return { executable, args: newArgs };
    }

    if (execLower.includes('cmd.exe')) {
      // CMD can be injected inline. Use $E\ for ESC \ (String Terminator)
      const newArgs = ['/k', 'prompt $E]7;file://localhost/$P$E\\$E]0;Command Prompt$E\\$P$G'];
      return { executable, args: newArgs };
    }

    if (execLower.includes('bash')) {
      const integrationDir = path.join(os.tmpdir(), 'ag-ide-integration');
      if (!fs.existsSync(integrationDir)) {
        fs.mkdirSync(integrationDir, { recursive: true });
      }

      const bashrcPath = path.join(integrationDir, `bash-${randomUUID()}.sh`);

      const bashScript = `
if [ -f ~/.bashrc ]; then
  source ~/.bashrc
fi
# OSC 7 for CWD and OSC 0 for Title (Idle)
export PROMPT_COMMAND='echo -ne "\\033]7;file://localhost$PWD\\007\\033]0;bash\\007"'
# OSC 0 for Title (Active command)
trap 'echo -ne "\\033]0;$BASH_COMMAND\\007"' DEBUG
`;
      fs.writeFileSync(bashrcPath, bashScript, 'utf8');

      return { executable, args: ['--init-file', bashrcPath] };
    }

    // Default fallback, no integration
    return { executable, args: [...originalArgs] };
  }

  public async createProcess(sessionId: string, context: ExecutionContext): Promise<string> {
    if (context.target.kind !== 'local') {
      throw new Error(`LocalBackend cannot execute target of kind \${context.target.kind}`);
    }

    const { executable, args } = this.prepareShellIntegration(
      context.shell.executable,
      context.shell.args
    );

    const ptyProcess = pty.spawn(executable, args, {
      name: 'xterm-256color',
      cols: context.cols,
      rows: context.rows,
      cwd: context.cwd,
      env: context.environment as Record<string, string>,
      useConpty: process.env.NODE_ENV !== 'test',
    });

    const nativeProcessId = ptyProcess.pid.toString();
    const adapter = new NodePTYAdapter(ptyProcess);

    this.processes.set(nativeProcessId, adapter);

    adapter.onExit(() => {
      this.processes.delete(nativeProcessId);
    });

    return nativeProcessId;
  }

  public getProcess(nativeProcessId: string): IProcess | undefined {
    return this.processes.get(nativeProcessId);
  }

  public dispose(): void {
    for (const p of this.processes.values()) {
      p.kill();
    }
    this.processes.clear();
  }
}
