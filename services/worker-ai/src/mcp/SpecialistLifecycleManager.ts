import { AgentRouterClient, McpToolCallResult } from './AgentRouterClient';
import { SpecialistSecurity, AuditMetadata } from './SpecialistSecurity';

export interface SpecialistExecutionOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  maxWaitSeconds?: number;
  signal?: AbortSignal;
}

export interface SpecialistTaskState {
  taskId: string;
  toolName: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: number;
  result?: string;
  error?: string;
}

export class SpecialistLifecycleManager {
  private client: AgentRouterClient;
  private inFlightTasks = new Map<string, Promise<string>>();
  private knownTasks = new Map<string, SpecialistTaskState>();
  private auditLogs: AuditMetadata[] = [];

  constructor(client: AgentRouterClient) {
    this.client = client;
  }

  /**
   * Generates a deterministic deduplication key for an invocation payload.
   */
  private generateDedupKey(toolName: string, args: Record<string, any>): string {
    const sorted = JSON.stringify(args, Object.keys(args).sort());
    return `${toolName}:${sorted}`;
  }

  /**
   * Extracts a task_id and status from tool call results.
   */
  private parseTaskResponse(result: McpToolCallResult): {
    isAsync: boolean;
    taskId?: string;
    status?: string;
    text: string;
  } {
    let text = '';
    if (Array.isArray(result.content)) {
      text = result.content
        .map((c) => (typeof c.text === 'string' ? c.text : JSON.stringify(c)))
        .join('\n');
    } else if (result.structuredContent) {
      text =
        typeof result.structuredContent === 'string'
          ? result.structuredContent
          : JSON.stringify(result.structuredContent, null, 2);
    } else {
      text = JSON.stringify(result);
    }

    // Check for platform agent async task format:
    // e.g. "STATUS: RUNNING\ntask_id: 123e4567-e89b-12d3-a456-426614174000" or similar
    const taskIdMatch =
      text.match(/task_id[:=]\s*["']?([a-f0-9-]{16,})["']?/i) ||
      text.match(/task[:=]\s*["']?([a-f0-9-]{16,})["']?/i);
    const isRunning = /STATUS[:=\s]+RUNNING/i.test(text) || /status[:=\s]+pending/i.test(text);

    if (taskIdMatch && isRunning) {
      return {
        isAsync: true,
        taskId: taskIdMatch[1],
        status: 'RUNNING',
        text,
      };
    }

    return {
      isAsync: false,
      text,
    };
  }

  /**
   * Invokes a specialist tool with full lifecycle management:
   * - Deduplication
   * - Input sanitization & context bounding
   * - Synchronous completion or async bounded polling via wait_for_task
   * - Cancellation support
   * - Audit logging
   */
  public async executeTool(
    toolName: string,
    args: Record<string, any>,
    options: SpecialistExecutionOptions = {}
  ): Promise<string> {
    const startTime = Date.now();
    const dedupKey = this.generateDedupKey(toolName, args);

    // 1. Prevent duplicate remote tasks: Check if an identical request is already in-flight
    const existingPromise = this.inFlightTasks.get(dedupKey);
    if (existingPromise) {
      return existingPromise;
    }

    // 2. Sanitize and bound arguments
    const { sanitized: sanitizedArgs, totalRedactions } = SpecialistSecurity.sanitizePayload(args);

    const taskExecutionPromise = this.runLifecycle(
      toolName,
      sanitizedArgs,
      dedupKey,
      startTime,
      totalRedactions,
      options
    );

    this.inFlightTasks.set(dedupKey, taskExecutionPromise);

    try {
      return await taskExecutionPromise;
    } finally {
      this.inFlightTasks.delete(dedupKey);
    }
  }

  private async runLifecycle(
    toolName: string,
    args: Record<string, any>,
    dedupKey: string,
    startTime: number,
    totalRedactions: number,
    options: SpecialistExecutionOptions
  ): Promise<string> {
    const signal = options.signal;
    if (signal?.aborted) {
      throw new Error(`Specialist execution of ${toolName} cancelled before start`);
    }

    let initialResult: McpToolCallResult;
    try {
      initialResult = await this.client.callTool(toolName, args);
    } catch (err: any) {
      const errorMsg = `AgentRouter callTool failed (${toolName}): ${err.message}`;
      this.auditLogs.push(
        SpecialistSecurity.createAuditMetadata(
          toolName,
          startTime,
          'error',
          totalRedactions,
          0,
          errorMsg
        )
      );
      throw new Error(errorMsg);
    }

    const parsed = this.parseTaskResponse(initialResult);

    if (initialResult.isError || /STATUS[:=\s]+FAILED/i.test(parsed.text)) {
      const errorMsg = `Specialist tool ${toolName} failed remotely: ${parsed.text}`;
      this.auditLogs.push(
        SpecialistSecurity.createAuditMetadata(
          toolName,
          startTime,
          'error',
          totalRedactions,
          parsed.text.length,
          errorMsg
        )
      );
      throw new Error(errorMsg);
    }

    // Synchronous completion
    if (!parsed.isAsync || !parsed.taskId) {
      const output = parsed.text || `(Specialist agent ${toolName} returned empty response)`;
      this.auditLogs.push(
        SpecialistSecurity.createAuditMetadata(
          toolName,
          startTime,
          'success',
          totalRedactions,
          output.length
        )
      );
      return output;
    }

    // Asynchronous task returned: Enter bounded polling with wait_for_task
    const taskId = parsed.taskId;
    this.knownTasks.set(taskId, {
      taskId,
      toolName,
      status: 'running',
      createdAt: Date.now(),
    });

    const maxWaitSeconds = options.maxWaitSeconds || 45;
    const pollIntervalMs = options.pollIntervalMs || 2000;
    const timeoutMs = options.timeoutMs || maxWaitSeconds * 1000;
    const pollDeadline = Date.now() + timeoutMs;

    while (Date.now() < pollDeadline) {
      if (signal?.aborted) {
        const state = this.knownTasks.get(taskId);
        if (state) state.status = 'cancelled';
        throw new Error(`Specialist task ${taskId} (${toolName}) cancelled by user`);
      }

      // Wait interval
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, pollIntervalMs);
        if (signal) {
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true }
          );
        }
      });

      if (signal?.aborted) {
        const state = this.knownTasks.get(taskId);
        if (state) state.status = 'cancelled';
        throw new Error(`Specialist task ${taskId} (${toolName}) cancelled by user`);
      }

      let waitResult: McpToolCallResult;
      try {
        waitResult = await this.client.callTool('wait_for_task', {
          task_id: taskId,
          max_wait_seconds: Math.max(5, Math.min(30, Math.floor((pollDeadline - Date.now()) / 1000))),
        });
      } catch (pollErr: any) {
        // Safe retry on transient network errors, but do NOT restart task
        console.warn(
          `[SpecialistLifecycle] Transient error polling task ${taskId}:`,
          pollErr.message
        );
        continue;
      }

      const waitParsed = this.parseTaskResponse(waitResult);

      // Check if task failed
      if (waitResult.isError || /STATUS[:=\s]+FAILED/i.test(waitParsed.text)) {
        const errorMsg = `Specialist task ${taskId} failed remotely: ${waitParsed.text}`;
        const state = this.knownTasks.get(taskId);
        if (state) {
          state.status = 'failed';
          state.error = errorMsg;
        }
        this.auditLogs.push(
          SpecialistSecurity.createAuditMetadata(
            toolName,
            startTime,
            'error',
            totalRedactions,
            waitParsed.text.length,
            errorMsg
          )
        );
        throw new Error(errorMsg);
      }

      // Check if task completed
      if (/STATUS[:=\s]+COMPLETED/i.test(waitParsed.text) || !waitParsed.isAsync) {
        const finalOutput = waitParsed.text;
        const state = this.knownTasks.get(taskId);
        if (state) {
          state.status = 'completed';
          state.result = finalOutput;
        }
        this.auditLogs.push(
          SpecialistSecurity.createAuditMetadata(
            toolName,
            startTime,
            'success',
            totalRedactions,
            finalOutput.length
          )
        );
        return finalOutput;
      }
    }

    // Bounded timeout reached
    const timeoutMsg = `Specialist task ${taskId} (${toolName}) timed out after ${timeoutMs}ms`;
    this.auditLogs.push(
      SpecialistSecurity.createAuditMetadata(
        toolName,
        startTime,
        'error',
        totalRedactions,
        0,
        timeoutMsg
      )
    );
    throw new Error(timeoutMsg);
  }

  /**
   * Returns recent audit logs.
   */
  public getAuditLogs(): AuditMetadata[] {
    return [...this.auditLogs];
  }

  /**
   * Retrieves tracking status of an asynchronous task.
   */
  public getTaskState(taskId: string): SpecialistTaskState | undefined {
    return this.knownTasks.get(taskId);
  }
}
