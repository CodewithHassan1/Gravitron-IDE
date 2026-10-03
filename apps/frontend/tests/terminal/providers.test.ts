import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
// tests/terminal/providers.test.ts

import { AbstractTerminalProvider } from '../../src/services/terminal/providers/terminal/AbstractTerminalProvider';
import { MemoryTerminalStream } from '../../src/services/terminal/providers/stream/MemoryTerminalStream';
import { TerminalDescriptor, ITerminalStream } from '../../src/services/terminal/types';

import { MockTransport } from '../../src/services/terminal/providers/transport/MockTransport';
import { TerminalEvents } from '../../src/services/terminal/events/TerminalEvents';
import { TerminalEventType } from '../../src/services/terminal/types/events';

class MockTerminalProvider extends AbstractTerminalProvider {
  public id = 'mock';
  constructor() {
    super(new MockTransport());
  }
}

describe('TerminalProviders', () => {
  it('AbstractTerminalProvider returns default capabilities', async () => {
    const provider = new MockTerminalProvider();
    expect(provider.capabilities.supportsResize).toBe(true);
    expect(provider.capabilities.supportsMouse).toBe(false);
    expect(await provider.validateEnvironment()).toBe(true);
    provider.dispose();
  });

  it('proves that repeated provider initialization/destruction does not leak listeners', () => {
    const getListenerCount = () => {
      const listeners = (TerminalEvents as any).listeners;
      const set = listeners.get(TerminalEventType.TerminalResized);
      return set ? set.size : 0;
    };

    const initialCount = getListenerCount();

    for (let i = 0; i < 1000; i++) {
      const provider = new MockTerminalProvider();
      provider.dispose();
    }

    const finalCount = getListenerCount();
    expect(finalCount).toBe(initialCount);
  });

  it('MemoryTerminalStream echoes data and supports disposal', async () => {
    const stream = new MemoryTerminalStream();
    let received: Uint8Array | null = null;
    
    stream.onData((data) => {
      received = data;
    });

    const payload = new Uint8Array([1, 2, 3]);
    await stream.write(payload);
    
    expect(received).toEqual(payload);

    stream.dispose();
    await stream.write(new Uint8Array([4]));
    expect(received).toEqual(payload); // should not have changed
  });
});
