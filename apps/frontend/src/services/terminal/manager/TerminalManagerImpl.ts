// src/services/terminal/manager/TerminalManagerImpl.ts

import { TerminalManager, TerminalOptions } from './TerminalManager';
import { TerminalRegistry } from '../registry/TerminalRegistry';
import { TerminalRegistryImpl } from '../registry/TerminalRegistryImpl';
import { TerminalSession } from '../session/TerminalSession';
import { TerminalSessionImpl } from '../session/TerminalSessionImpl';
import { TerminalProvider } from '../providers/terminal/TerminalProvider';
import { SessionPersistence } from '../persistence/SessionPersistence';
import { TerminalScheduler } from '../scheduler/TerminalScheduler';
import { TerminalMetadata, TerminalSessionState, TerminalSnapshot } from '../types';
import { TerminalEvents } from '../events/TerminalEvents';
import { TerminalEventType } from '../types/events';
import { TerminalProtocol } from '@ag/protocol';

export class TerminalManagerImpl implements TerminalManager {
  private registry: TerminalRegistryImpl;
  private isDisposed = false;
  private activeWorkspaceId: string | null = null;

  constructor(
    private readonly provider: TerminalProvider,
    private readonly persistence: SessionPersistence,
    private readonly scheduler: TerminalScheduler
  ) {
    this.registry = new TerminalRegistryImpl();

    // Setup persistence debouncing on registry change
    this.registry.onRegistryChanged(() => {
      this.scheduler.debounce('persist', () => this.persistSessions(), 1000);
    });
    this.registry.onActiveSessionChanged(() => {
      this.scheduler.debounce('persist', () => this.persistSessions(), 1000);
    });
  }

  public async createTerminal(options: TerminalOptions = {}): Promise<Readonly<TerminalSession>> {
    if (this.isDisposed) throw new Error('TerminalManager is disposed');

    const metadata: TerminalMetadata = {
      id: crypto.randomUUID(), // Canonical UUID as requested
      debugLabel: options.debugLabel || `Terminal ${this.registry.getSessions().length + 1}`,
      name: options.name || 'Terminal',
      cwd: options.cwd,
      executable: options.executable,
      args: options.args ? Object.freeze([...options.args]) : undefined,
      env: options.env ? Object.freeze({ ...options.env }) : undefined,
      profileId: options.profileId,
      workspaceId: options.workspaceId,
    };

    const session = new TerminalSessionImpl(metadata, this.provider);
    this.registry.addSession(session);

    TerminalEvents.emit(TerminalEventType.TerminalCreated, {
      terminalId: metadata.id,
      timestamp: Date.now(),
      metadata: metadata, // metadata is already readonly
    });

    try {
      await session.connect();
    } catch (e) {
      console.error(`[TerminalManager] Failed to connect session ${metadata.id}:`, e);
      // Even if connect fails, we return the session so UI can show error state
    }

    return session;
  }

  public async destroyTerminal(id: string): Promise<void> {
    if (this.isDisposed) throw new Error('TerminalManager is disposed');

    const session = this.registry.getSession(id);
    if (!session) return;

    if (this.provider.kill) {
      await this.provider.kill(id).catch(console.error);
    }

    await session.close(); // Proper shutdown
    this.registry.removeSession(id);
  }

  public getTerminal(id: string): Readonly<TerminalSession> | undefined {
    return this.registry.getSession(id);
  }

  public getRegistry(): TerminalRegistry {
    return this.registry; // Exposed via interface which returns ReadonlyArrays
  }

  public async restoreSessions(workspaceId: string): Promise<void> {
    if (this.isDisposed) throw new Error('TerminalManager is disposed');
    this.activeWorkspaceId = workspaceId;

    const snapshot = await this.persistence.load(workspaceId);
    if (!snapshot || !snapshot.sessions) return;

    let backendSessions: { sessionId: string; state: string; terminalId?: string }[] = [];
    if (this.provider.listSessions) {
      backendSessions = await this.provider.listSessions();
    }

    for (const metadata of snapshot.sessions) {
      if (!this.registry.hasSession(metadata.id)) {
        const backendSession = backendSessions.find((s) => s.terminalId === metadata.id);

        const session = new TerminalSessionImpl(metadata, this.provider);
        this.registry.addSession(session);

        TerminalEvents.emit(TerminalEventType.TerminalCreated, {
          terminalId: metadata.id,
          timestamp: Date.now(),
          metadata: metadata,
        });

        if (backendSession && (session as any).attach) {
          try {
            await (session as any).attach(backendSession.sessionId);
          } catch (e) {
            console.error(`[TerminalManager] Failed to attach session ${metadata.id}`, e);
            await session.connect().catch((err) => console.error(err));
          }
        } else {
          try {
            await session.connect();
          } catch (e) {
            console.error(`[TerminalManager] Failed to connect session ${metadata.id}`, e);
          }
        }
      }
    }

    if (snapshot.activeSessionId) {
      this.registry.setActiveSession(snapshot.activeSessionId);
    }
  }

  private async persistSessions(): Promise<void> {
    if (this.isDisposed || !this.activeWorkspaceId) return;
    const sessions = this.registry.getSessions().map((s) => s.metadata);
    const active = this.registry.getActiveSession();

    const snapshot: TerminalSnapshot = {
      version: 1,
      sessions,
      activeSessionId: active ? active.id : null,
      layout: {},
    };

    await this.persistence.save(this.activeWorkspaceId, snapshot);
  }

  public async destroyAllSessions(): Promise<void> {
    if (this.isDisposed) throw new Error('TerminalManager is disposed');
    const sessions = this.registry.getSessions();
    await Promise.all(sessions.map((s) => this.destroyTerminal(s.id).catch(console.error)));
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    this.scheduler.dispose();
    this.registry.dispose();
    this.provider.dispose();
  }

  public async getProfiles(): Promise<TerminalProtocol.TerminalProfile[]> {
    if (this.provider.getProfiles) {
      return this.provider.getProfiles();
    }
    return [];
  }
}
