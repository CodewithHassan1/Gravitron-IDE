import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
// tests/terminal/events.test.ts

import { TerminalEventBus } from '../../src/services/terminal/events/TerminalEventBus';
import { TerminalEventType } from '../../src/services/terminal/types/events';

describe('TerminalEventBus', () => {
  let bus: TerminalEventBus;

  beforeEach(() => {
    bus = new TerminalEventBus();
  });

  afterEach(() => {
    bus.dispose();
  });

  it('should deliver events synchronously to listeners', () => {
    let received = false;
    bus.on(TerminalEventType.TerminalClosed, (payload) => {
      received = true;
      expect(payload.terminalId).toBe('123');
    });

    bus.emit(TerminalEventType.TerminalClosed, { terminalId: '123', timestamp: Date.now() });
    expect(received).toBe(true);
  });

  it('should deep freeze payloads to prevent mutation', () => {
    let receivedPayload: any;
    bus.on(TerminalEventType.TerminalCreated, (payload) => {
      receivedPayload = payload;
      // Ensure listener cannot mutate
      expect(() => {
        (payload as any).terminalId = 'mutated';
      }).toThrow();
    });

    bus.emit(TerminalEventType.TerminalCreated, {
      terminalId: 'abc',
      timestamp: Date.now(),
      metadata: {
        id: 'abc',
        name: 'test',
        cwd: '/',
        executable: 'sh',
        args: [],
        env: {},
      },
    });

    expect(Object.isFrozen(receivedPayload)).toBe(true);
    expect(Object.isFrozen(receivedPayload.metadata)).toBe(true);
  });

  it('should properly cleanup listeners on disposal', () => {
    let count = 0;
    const disposable = bus.on(TerminalEventType.TerminalFocused, () => {
      count++;
    });

    bus.emit(TerminalEventType.TerminalFocused, { terminalId: 't1', timestamp: Date.now() });
    expect(count).toBe(1);

    disposable.dispose();
    bus.emit(TerminalEventType.TerminalFocused, { terminalId: 't1', timestamp: Date.now() });
    expect(count).toBe(1);
  });
});
