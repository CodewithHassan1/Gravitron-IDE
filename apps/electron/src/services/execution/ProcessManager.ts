import { ExecutionSessionImpl } from './ExecutionSession';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface SafeTerminationResult {
  exitedGracefully: boolean;
  pid?: number;
  terminationResult: string;
}

export class ProcessManager {
  public static readonly MAX_ACTIVE_TERMINALS_PER_WORKSPACE = 10;

  private sessions = new Map<string, ExecutionSessionImpl>();
  private terminationLocks = new Set<string>();
  private reservations = new Map<string, number>();

  public getWorkspaceSessionCount(workspaceId: string): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.context.workspaceId === workspaceId) {
        count++;
      }
    }
    return count;
  }

  public reserveSlot(workspaceId: string): void {
    const active = this.getWorkspaceSessionCount(workspaceId);
    const reserved = this.reservations.get(workspaceId) || 0;

    if (active + reserved >= ProcessManager.MAX_ACTIVE_TERMINALS_PER_WORKSPACE) {
      throw new Error(
        `TERMINAL_RESOURCE_LIMIT_EXCEEDED: Maximum number of active terminals (${ProcessManager.MAX_ACTIVE_TERMINALS_PER_WORKSPACE}) reached for this workspace.`
      );
    }

    this.reservations.set(workspaceId, reserved + 1);
  }

  public releaseReservation(workspaceId: string): void {
    const reserved = this.reservations.get(workspaceId) || 0;
    if (reserved > 0) {
      this.reservations.set(workspaceId, reserved - 1);
    }
  }

  public register(session: ExecutionSessionImpl): void {
    // Commit the reservation (move from reserved to active atomically)
    this.releaseReservation(session.context.workspaceId);

    this.sessions.set(session.id, session);

    // Normal exit cleanup
    session.process.onExit(() => {
      this.sessions.delete(session.id);
    });
  }

  public get(sessionId: string): ExecutionSessionImpl | undefined {
    return this.sessions.get(sessionId);
  }

  public remove(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  public has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  public list(): ExecutionSessionImpl[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Requests graceful process termination first and waits up to gracePeriodMs.
   * If the process tree has not exited after the grace period, forcefully terminates
   * the entire process tree (including Windows child processes via taskkill /T /F).
   */
  public async terminateSessionSafely(
    sessionId: string,
    gracePeriodMs = 0
  ): Promise<SafeTerminationResult> {
    if (this.terminationLocks.has(sessionId)) {
      return {
        exitedGracefully: false,
        terminationResult: `Termination already in progress for session ${sessionId}`,
      };
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        exitedGracefully: true,
        terminationResult: 'Process already exited before termination was required',
      };
    }

    if (session.state === 'exited') {
      this.sessions.delete(sessionId);
      return {
        exitedGracefully: true,
        pid: session.process?.pid,
        terminationResult: 'Process exited normally',
      };
    }

    this.terminationLocks.add(sessionId);
    const pid = session.process?.pid;

    try {
      if (session.state === 'running' || session.state === 'starting') {
        session.state = 'killed';
      }

      const waitForProcessExit = (timeoutMs: number): Promise<boolean> => {
        if (timeoutMs <= 0) {
          return Promise.resolve(false);
        }

        return new Promise<boolean>((resolve) => {
          let settled = false;
          let timer: ReturnType<typeof setTimeout> | null = null;
          let exitSub: { dispose?: () => void } | undefined;

          const done = (exited: boolean) => {
            if (settled) return;
            settled = true;
            if (timer) {
              clearTimeout(timer);
              timer = null;
            }
            try {
              exitSub?.dispose?.();
            } catch {
              // Ignore dispose failures on mock processes
            }
            resolve(exited);
          };

          try {
            exitSub = session.process.onExit(() => done(true)) as any;
          } catch {
            done(false);
            return;
          }

          timer = setTimeout(() => done(false), timeoutMs);
        });
      };

      // Phase 1: Graceful termination attempt when a grace period is configured
      if (gracePeriodMs > 0) {
        try {
          // Send Ctrl+C interrupt to PTY if writable
          if (typeof session.process?.write === 'function') {
            session.process.write('\x03');
          }
        } catch {
          // Ignore PTY write failures on dying processes
        }

        if (session.backendKind === 'local' && pid) {
          if (process.platform === 'win32') {
            try {
              // Graceful taskkill without /F gives console children a chance to exit
              await execFileAsync('taskkill', ['/PID', pid.toString(), '/T']);
            } catch {
              // Non-GUI / non-console child trees may reject soft taskkill; wait out grace or escalate
            }
          } else {
            try {
              process.kill(-pid, 'SIGTERM');
            } catch {
              try {
                process.kill(pid, 'SIGTERM');
              } catch {
                // Ignore if already gone
              }
            }
          }
        }

        const exitedGracefully = await waitForProcessExit(gracePeriodMs);
        if (exitedGracefully) {
          return {
            exitedGracefully: true,
            pid,
            terminationResult: pid
              ? `Gracefully terminated process tree (PID ${pid}) within ${gracePeriodMs}ms grace period`
              : `Gracefully terminated session within ${gracePeriodMs}ms grace period`,
          };
        }
      }

      // Phase 2: Forced process-tree termination
      if (session.backendKind === 'local' && process.platform === 'win32') {
        if (pid) {
          try {
            await execFileAsync('taskkill', ['/PID', pid.toString(), '/T', '/F']);
          } catch {
            // taskkill throws if process already exited or access denied
          }
        }
        try {
          session.process.kill();
        } catch {
          // Ignore
        }
        return {
          exitedGracefully: false,
          pid,
          terminationResult: pid
            ? gracePeriodMs > 0
              ? `Forcefully terminated Windows process tree (PID ${pid}) after ${gracePeriodMs}ms grace period`
              : `Forcefully terminated Windows process tree (PID ${pid})`
            : 'Forcefully terminated Windows execution session',
        };
      }

      if (session.backendKind === 'local' && pid) {
        try {
          process.kill(-pid, 'SIGKILL');
        } catch {
          try {
            process.kill(pid, 'SIGKILL');
          } catch {
            // Ignore
          }
        }
      }

      try {
        session.process.kill('SIGKILL');
      } catch {
        // Ignore
      }

      return {
        exitedGracefully: false,
        pid,
        terminationResult: pid
          ? gracePeriodMs > 0
            ? `Forcefully terminated process (PID ${pid}) with SIGKILL after ${gracePeriodMs}ms grace period`
            : `Forcefully terminated process (PID ${pid}) with SIGKILL`
          : `Forcefully terminated session ${sessionId}`,
      };
    } finally {
      this.sessions.delete(sessionId);
      this.terminationLocks.delete(sessionId);
    }
  }

  public async terminateTree(sessionId: string): Promise<void> {
    await this.terminateSessionSafely(sessionId, 0);
  }

  public async cleanupWorkspace(workspaceId: string): Promise<void> {
    const toTerminate: string[] = [];
    for (const session of this.sessions.values()) {
      if (session.context.workspaceId === workspaceId) {
        toTerminate.push(session.id);
      }
    }

    await Promise.all(toTerminate.map((id) => this.terminateTree(id)));
  }

  public async terminateAll(): Promise<void> {
    const toTerminate = Array.from(this.sessions.keys());
    await Promise.all(toTerminate.map((id) => this.terminateTree(id)));
  }
}
