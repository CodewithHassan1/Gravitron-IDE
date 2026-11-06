import { describe, it, expect } from 'vitest';
import { ServiceContainer } from '../src/ServiceContainer';
import { IService, ILifecycleService } from '../src/services/IService';
import { ServiceId } from '../src/services/ServiceIds';

class MockService implements ILifecycleService {
  constructor(
    public id: ServiceId,
    public dependencies: ServiceId[] = []
  ) {}
  async initialize() {}
  async start() {}
  async stop() {}
  async dispose() {}
  async health() {
    return true;
  }
}

describe('ServiceContainer', () => {
  it('registers and retrieves a service', () => {
    const container = new ServiceContainer();
    const s1 = new MockService(Symbol.for('S1'));
    container.register(s1);
    expect(container.get(Symbol.for('S1'))).toBe(s1);
  });

  it('rejects duplicate service ID', () => {
    const container = new ServiceContainer();
    container.register(new MockService(Symbol.for('S1')));
    expect(() => container.register(new MockService(Symbol.for('S1')))).toThrow(
      'already registered'
    );
  });

  it('rejects self-dependency', () => {
    const container = new ServiceContainer();
    expect(() => container.register(new MockService(Symbol.for('S1'), [Symbol.for('S1')]))).toThrow(
      'self-dependency'
    );
  });

  it('rejects duplicate dependencies declared in the same service', () => {
    const container = new ServiceContainer();
    expect(() =>
      container.register(new MockService(Symbol.for('S1'), [Symbol.for('S2'), Symbol.for('S2')]))
    ).toThrow('duplicate dependencies');
  });

  it('detects missing dependencies during topological sort', () => {
    const container = new ServiceContainer();
    container.register(new MockService(Symbol.for('S1'), [Symbol.for('MissingService')]));
    expect(() => container.getSortedLifecycleServices()).toThrow(
      'Missing dependency Symbol(MissingService)'
    );
  });

  it('detects cyclic dependencies', () => {
    const container = new ServiceContainer();
    container.register(new MockService(Symbol.for('S1'), [Symbol.for('S2')]));
    container.register(new MockService(Symbol.for('S2'), [Symbol.for('S1')]));
    expect(() => container.getSortedLifecycleServices()).toThrow('Cyclic dependency detected');
  });

  it('sorts correctly based on dependencies', () => {
    const container = new ServiceContainer();
    container.register(new MockService(Symbol.for('S3'), [Symbol.for('S1'), Symbol.for('S2')]));
    container.register(new MockService(Symbol.for('S2'), [Symbol.for('S1')]));
    container.register(new MockService(Symbol.for('S1'), []));

    const sorted = container.getSortedLifecycleServices();
    expect(sorted.map((s) => s.id)).toEqual([Symbol.for('S1'), Symbol.for('S2'), Symbol.for('S3')]);
  });
});
