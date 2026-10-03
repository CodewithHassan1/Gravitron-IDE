// src/services/terminal/events/TerminalEventBus.ts

import { IDisposable } from '../types';
import { TerminalEventType, TerminalEventPayloads } from '../types/events';

type EventListener<T> = (payload: T) => void;

export class TerminalEventBus implements IDisposable {
  private listeners: Map<TerminalEventType, Set<EventListener<any>>> = new Map();

  public on<T extends TerminalEventType>(
    event: T,
    listener: EventListener<TerminalEventPayloads[T]>
  ): IDisposable {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    const listenersForEvent = this.listeners.get(event)!;
    listenersForEvent.add(listener);

    return {
      dispose: () => {
        listenersForEvent.delete(listener);
        if (listenersForEvent.size === 0) {
          this.listeners.delete(event);
        }
      }
    };
  }

  public emit<T extends TerminalEventType>(
    event: T,
    payload: TerminalEventPayloads[T]
  ): void {
    const listenersForEvent = this.listeners.get(event);
    if (!listenersForEvent || listenersForEvent.size === 0) return;

    // Deep freeze the payload to guarantee immutability across all listeners
    const frozenPayload = this.deepFreeze(payload);

    // Synchronous deterministic dispatch
    for (const listener of Array.from(listenersForEvent)) {
      try {
        listener(frozenPayload);
      } catch (e) {
        console.error(`TerminalEventBus: Error in listener for event ${event}:`, e);
      }
    }
  }

  public clearAllListeners(): void {
    this.listeners.clear();
  }

  public dispose(): void {
    this.clearAllListeners();
  }

  private deepFreeze<T>(obj: T): Readonly<T> {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Object.isFrozen(obj)) {
      return obj as Readonly<T>;
    }

    Object.freeze(obj);

    Object.getOwnPropertyNames(obj).forEach((prop) => {
      const propVal = (obj as any)[prop];
      if (
        propVal !== null &&
        (typeof propVal === 'object' || typeof propVal === 'function') &&
        !Object.isFrozen(propVal)
      ) {
        this.deepFreeze(propVal);
      }
    });

    return obj as Readonly<T>;
  }
}
