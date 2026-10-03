// src/services/terminal/registry/TerminalRegistryImpl.ts

import { TerminalRegistry } from './TerminalRegistry';
import { TerminalSession } from '../session/TerminalSession';
import { IDisposable } from '../types';

export class TerminalRegistryImpl implements TerminalRegistry {
  private sessions: Map<string, TerminalSession> = new Map();
  // We keep an ordered array for deterministic ordering (e.g. tabs)
  private sessionOrder: string[] = [];
  private activeId: string | null = null;
  
  private registryListeners: Set<(sessions: ReadonlyArray<Readonly<TerminalSession>>) => void> = new Set();
  private activeListeners: Set<(session: Readonly<TerminalSession> | undefined) => void> = new Set();

  public getSessions(): ReadonlyArray<Readonly<TerminalSession>> {
    const list = this.sessionOrder.map(id => this.sessions.get(id)!).filter(Boolean);
    return Object.freeze(list);
  }

  public getSession(id: string): Readonly<TerminalSession> | undefined {
    return this.sessions.get(id);
  }

  public getActiveSession(): Readonly<TerminalSession> | undefined {
    if (!this.activeId) return undefined;
    return this.sessions.get(this.activeId);
  }

  public setActiveSession(id: string): void {
    if (this.activeId === id) return;
    if (this.sessions.has(id)) {
      this.activeId = id;
      this.sessions.get(id)!.focus();
      this.notifyActiveChanged();
    }
  }

  public addSession(session: TerminalSession): void {
    if (this.sessions.has(session.id)) {
      throw new Error(`TerminalSession with id ${session.id} already exists in registry.`);
    }
    this.sessions.set(session.id, session);
    this.sessionOrder.push(session.id);
    
    if (this.activeId === null) {
      this.activeId = session.id;
      this.notifyActiveChanged();
    }
    this.notifyRegistryChanged();
  }

  public hasSession(id: string): boolean {
    return this.sessions.has(id);
  }

  public replaceSession(id: string, session: TerminalSession): void {
    if (!this.sessions.has(id)) {
      throw new Error(`TerminalSession with id ${id} does not exist in registry.`);
    }
    const oldSession = this.sessions.get(id)!;
    oldSession.dispose();
    this.sessions.set(id, session);
    
    if (this.activeId === id) {
      this.notifyActiveChanged();
    }
    this.notifyRegistryChanged();
  }

  public removeSession(id: string): void {
    if (!this.sessions.has(id)) return;
    
    const session = this.sessions.get(id)!;
    session.dispose(); // Registry owns the session lifecycle
    this.sessions.delete(id);
    
    const idx = this.sessionOrder.indexOf(id);
    if (idx !== -1) {
      this.sessionOrder.splice(idx, 1);
    }

    if (this.activeId === id) {
      this.activeId = this.sessionOrder.length > 0 ? this.sessionOrder[this.sessionOrder.length - 1] : null;
      this.notifyActiveChanged();
    }

    this.notifyRegistryChanged();
  }

  public onRegistryChanged(listener: (sessions: ReadonlyArray<Readonly<TerminalSession>>) => void): IDisposable {
    this.registryListeners.add(listener);
    return {
      dispose: () => this.registryListeners.delete(listener)
    };
  }

  public onActiveSessionChanged(listener: (session: Readonly<TerminalSession> | undefined) => void): IDisposable {
    this.activeListeners.add(listener);
    return {
      dispose: () => this.activeListeners.delete(listener)
    };
  }

  private notifyRegistryChanged(): void {
    const sessions = this.getSessions();
    for (const listener of Array.from(this.registryListeners)) {
      try {
        listener(sessions);
      } catch(e) {
        console.error(e);
      }
    }
  }

  private notifyActiveChanged(): void {
    const active = this.getActiveSession();
    for (const listener of Array.from(this.activeListeners)) {
      try {
        listener(active);
      } catch(e) {
        console.error(e);
      }
    }
  }

  public dispose(): void {
    // Destroy all sessions
    for (const session of Array.from(this.sessions.values())) {
      session.dispose();
    }
    this.sessions.clear();
    this.sessionOrder = [];
    this.activeId = null;
    
    this.registryListeners.clear();
    this.activeListeners.clear();
  }
}
