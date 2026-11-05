import { ExecutionSessionImpl } from './ExecutionSession';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

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

  public async terminateTree(sessionId: string): Promise<void> {
    if (this.terminationLocks.has(sessionId)) {
      return; // Prevent duplicate concurrent termination calls
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      return; // Already exited or removed
    }

    this.terminationLocks.add(sessionId);

    try {
      // Mark as killed so we don't accidentally treat this as a normal exit state later if needed
      if (session.state === 'running' || session.state === 'starting') {
        session.state = 'killed';
      }

      if (session.backendKind === 'local' && process.platform === 'win32') {
        // Native Windows Process-Tree Termination
        const pid = session.process.pid;
        if (pid) {
          try {
            await execFileAsync('taskkill', ['/PID', pid.toString(), '/T', '/F']);
          } catch (e: any) {
            // taskkill throws if process already exited or access denied.
            // Safe to ignore. Process might have died concurrently.
          }
        } else {
          // Fallback if pid is inexplicably missing
          session.process.kill();
        }
      } else {
        // Docker backend or non-Windows local backend
        session.process.kill();
      }
    } finally {
      this.sessions.delete(sessionId);
      this.terminationLocks.delete(sessionId);
    }
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
