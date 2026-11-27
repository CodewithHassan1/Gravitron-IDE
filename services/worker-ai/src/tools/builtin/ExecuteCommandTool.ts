import { AgentProtocol } from '@ag/protocol';
import { ToolImplementation, ToolResult } from '../AgentTool';

function formatDurationMs(ms?: number): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) {
    return 'unknown';
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  const totalSec = Math.round(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins === 0) return `${secs}s`;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m 0s`;
}

export class ExecuteCommandTool implements ToolImplementation {
  public readonly definition = {
    name: 'execute_command',
    description:
      'Execute a terminal command in the workspace with managed timeout enforcement, live progress tracking, and safe process-tree cleanup.',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute.',
        },
        cwd: {
          type: 'string',
          description: 'The working directory relative to the workspace root. Optional.',
        },
        description: {
          type: 'string',
          description:
            'Short human-readable description of what this command does (shown in live execution UI).',
        },
        timeoutSeconds: {
          type: 'number',
          description:
            'Optional per-command timeout in seconds (subject to backend maximum policy). Default is policy-configured (usually 120s).',
        },
        timeoutPreset: {
          type: 'string',
          enum: ['short', 'normal', 'long', 'extended'],
          description:
            'Optional timeout tier hint: short (30s), normal (2m), long (5m), extended (10m). Overridden by timeoutSeconds if both are given.',
        },
      },
      required: ['command'],
    },
    riskLevel: 'execute' as const,
  };

  public async execute(
    args: {
      command: string;
      cwd?: string;
      description?: string;
      timeoutSeconds?: number;
      timeoutPreset?: AgentProtocol.CommandTimeoutPreset;
    },
    bridge: AgentProtocol.IAgentCapabilityBridge,
    context: AgentProtocol.AgentCapabilityContext
  ): Promise<ToolResult> {
    const requestedTimeoutMs =
      typeof args.timeoutSeconds === 'number' && Number.isFinite(args.timeoutSeconds) && args.timeoutSeconds > 0
        ? Math.round(args.timeoutSeconds * 1000)
        : undefined;

    const result = await bridge.executeCommand(context, args.command, args.cwd, {
      description: args.description,
      timeoutMs: requestedTimeoutMs,
      preset: args.timeoutPreset,
    });

    const outcome: AgentProtocol.CommandExecutionOutcome =
      result.outcome ||
      (result.timedOut
        ? 'timed_out'
        : result.cancelled
          ? 'cancelled_by_user'
          : result.exitCode === 0
            ? 'completed'
            : 'failed');

    const isTimeout = outcome === 'timed_out' || result.timedOut === true;
    const isCancelled = outcome === 'cancelled_by_user' || result.cancelled === true;
    const isPolicyTerminated = outcome === 'terminated_by_policy';

    const headerLines: string[] = [
      `Outcome: ${outcome}`,
      `Exit Code: ${result.exitCode}`,
    ];

    if (result.commandId) {
      headerLines.push(`Command ID: ${result.commandId}`);
    }
    if (result.description || args.description) {
      headerLines.push(`Description: ${result.description || args.description}`);
    }
    if (typeof result.configuredTimeoutMs === 'number') {
      headerLines.push(
        `Configured Timeout: ${formatDurationMs(result.configuredTimeoutMs)} (${result.configuredTimeoutMs}ms)`
      );
    }
    if (typeof result.elapsedMs === 'number') {
      headerLines.push(`Elapsed Time: ${formatDurationMs(result.elapsedMs)} (${result.elapsedMs}ms)`);
    }
    if (result.terminationResult) {
      headerLines.push(`Termination Result: ${result.terminationResult}`);
    }
    if (result.policyViolation) {
      headerLines.push(`Policy Violation: ${result.policyViolation}`);
    }

    if (isTimeout) {
      headerLines.push(
        `[TIMEOUT RECOVERY GUIDANCE]: The command exceeded its configured timeout and was safely terminated. Inspect the partial output below to diagnose why it stalled or ran slowly. Do NOT report this command as successful. Adjust your command (or re-run with a justified longer timeoutSeconds/timeoutPreset within policy limits) or ask the user for confirmation/help.`
      );
    } else if (isCancelled) {
      headerLines.push(
        `[CANCELLED BY USER]: The user explicitly cancelled this command. Do not automatically re-run it without user instruction.`
      );
    } else if (isPolicyTerminated) {
      headerLines.push(
        `[POLICY TERMINATION]: Execution was blocked or terminated by security/resource policy.`
      );
    }

    let content = `${headerLines.join('\n')}\n`;
    let originalSize = 0;

    if (result.stdout) {
      content += `\nSTDOUT:\n${result.stdout}`;
      originalSize += result.stdout.length;
    }

    if (result.stderr) {
      content += `\nSTDERR:\n${result.stderr}`;
      originalSize += result.stderr.length;
    }

    // Truncate to 8000 characters while preserving the structured header and recovery metadata
    if (content.length > 8000) {
      return {
        content: content.substring(0, 8000),
        truncated: true,
        originalSize,
      };
    }

    return {
      content,
      truncated: false,
    };
  }
}
