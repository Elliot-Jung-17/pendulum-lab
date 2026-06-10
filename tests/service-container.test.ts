import { describe, expect, it, vi } from 'vitest';
import { ServiceContainer } from '../src/runtime/ServiceContainer';

interface TestServices {
  config: { name: string };
  counter: number;
  derived: string;
}

describe('ServiceContainer', () => {
  it('registers and resolves a value', () => {
    const container = new ServiceContainer<TestServices>();
    container.registerValue('config', { name: 'pendulum' });
    expect(container.resolve('config')).toEqual({ name: 'pendulum' });
    expect(container.has('config')).toBe(true);
  });

  it('constructs singletons lazily and only once', () => {
    const container = new ServiceContainer<TestServices>();
    const factory = vi.fn(() => 42);
    container.register('counter', factory);
    expect(factory).not.toHaveBeenCalled(); // lazy
    expect(container.resolve('counter')).toBe(42);
    expect(container.resolve('counter')).toBe(42);
    expect(factory).toHaveBeenCalledTimes(1); // cached
  });

  it('rebuilds transient (non-singleton) services on each resolve', () => {
    const container = new ServiceContainer<TestServices>();
    let n = 0;
    container.register('counter', () => (n += 1), { singleton: false });
    expect(container.resolve('counter')).toBe(1);
    expect(container.resolve('counter')).toBe(2);
  });

  it('lets factories resolve their own dependencies from the container', () => {
    const container = new ServiceContainer<TestServices>();
    container.registerValue('config', { name: 'lab' });
    container.register('derived', (c) => `system:${c.resolve('config').name}`);
    expect(container.resolve('derived')).toBe('system:lab');
  });

  it('throws on unknown tokens but tryResolve returns undefined', () => {
    const container = new ServiceContainer<TestServices>();
    expect(() => container.resolve('config')).toThrow(/no registration/);
    expect(container.tryResolve('config')).toBeUndefined();
  });

  it('re-registration invalidates the cached singleton', () => {
    const container = new ServiceContainer<TestServices>();
    container.registerValue('counter', 1);
    expect(container.resolve('counter')).toBe(1);
    container.register('counter', () => 99);
    expect(container.resolve('counter')).toBe(99);
  });

  it('reports its registered tokens and supports reset', () => {
    const container = new ServiceContainer<TestServices>();
    container.registerValue('config', { name: 'x' });
    container.registerValue('counter', 0);
    expect(container.tokens().sort()).toEqual(['config', 'counter']);
    container.reset();
    expect(container.has('config')).toBe(false);
    expect(container.tokens()).toEqual([]);
  });
});
