import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseContractJson } from '../../../src/product/persistence/json';
import { canonicalJson, DATA_LIMITS, inspectSafeData } from '../../../src/product/persistence/safe-data';

describe('untrusted contract data', () => {
  it('makes a deep isolated snapshot and stable recursively sorted JSON', () => {
    const source = { z: [{ b: 2, a: '한국어' }], a: true };
    const result = inspectSafeData(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(canonicalJson(result.value)).toBe('{"a":true,"z":[{"a":"한국어","b":2}]}');
    source.z[0]!.b = 99;
    expect(result.value).toEqual({ z: [{ a: '한국어', b: 2 }], a: true });
  });

  it('never invokes getters or toJSON while rejecting programmatic non-JSON input', () => {
    let calls = 0;
    const getter = Object.defineProperty({}, 'value', {
      get() {
        calls++;
        return 1;
      },
      enumerable: true
    });
    const toJSON = {
      toJSON() {
        calls++;
        return {};
      }
    };
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const symbol = { [Symbol('private')]: 1 };
    const hidden = Object.defineProperty({}, 'private', { value: 1 });
    const extraArray = Object.assign([1], { extra: 2 });
    for (const source of [
      getter,
      toJSON,
      cycle,
      symbol,
      hidden,
      extraArray,
      new Array(3),
      new Date(),
      new Float64Array(2),
      new Map(),
      { value: undefined },
      { value: BigInt(1) },
      { value: NaN },
      { value: Infinity },
      { value: -0 },
      { value: '\ud800' },
      Object.create({ inherited: 1 })
    ]) {
      expect(inspectSafeData(source).ok).toBe(false);
    }
    expect(calls).toBe(0);
  });

  it.each([
    '{"__proto__":{"polluted":true}}',
    '{"constructor":{}}',
    '{"prototype":{}}',
    '{"x":1,"x":2}',
    '{"x":1,"\\u0078":2}',
    '{"a":{"x":1,"x":2}}',
    '[1,]',
    '{"x":1,}',
    '{"x":1} trailing',
    '{"x":1e999}',
    '{"x":-0}',
    '{"x":"\\ud800"}',
    '{"x":undefined}',
    '{"x":01}',
    '{"x":+1}',
    '\ufeff{}',
    '{"x":"unclosed}',
    '[',
    '',
    '{"x":true false}'
  ])('rejects malformed/ambiguous JSON without changing prototypes: %s', (text) => {
    const result = parseContractJson(text);
    expect(result.ok).toBe(false);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('does not read array properties through proxy get traps', () => {
    let reads = 0;
    const array = new Proxy([1, 2], {
      get() {
        reads++;
        throw new Error('property getter');
      }
    });
    expect(inspectSafeData(array)).toEqual({ ok: true, value: [1, 2] });
    expect(reads).toBe(0);
  });

  it('bounds strings, arrays, object width, nesting, and JSON bytes', () => {
    let deep: unknown = 1;
    for (let i = 0; i < DATA_LIMITS.depth + 1; i++) deep = { child: deep };
    const cases = [
      'x'.repeat(DATA_LIMITS.string + 1),
      Array(DATA_LIMITS.array + 1).fill(1),
      Object.fromEntries(Array.from({ length: DATA_LIMITS.keys + 1 }, (_, i) => [`k${i}`, i])),
      deep
    ];
    for (const input of cases) expect(inspectSafeData(input).ok).toBe(false);
    expect(parseContractJson(' '.repeat(DATA_LIMITS.bytes + 1)).ok).toBe(false);
    expect(parseContractJson('['.repeat(1000) + '0' + ']'.repeat(1000)).ok).toBe(false);
  });

  it('round trips randomized safe nested data with deterministic insertion order', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.stringMatching(/^q[a-z]{1,12}$/), fc.array(fc.integer(), { maxLength: 12 }), { maxKeys: 15 }),
        (input) => {
          const snapshot = inspectSafeData(input);
          expect(snapshot.ok).toBe(true);
          if (!snapshot.ok) return;
          const text = canonicalJson(snapshot.value);
          expect(parseContractJson(text)).toEqual(snapshot);
          const reordered = inspectSafeData(Object.fromEntries(Object.entries(input).reverse()));
          expect(reordered.ok && canonicalJson(reordered.value)).toBe(text);
        }
      ),
      { seed: 3003, numRuns: 150 }
    );
  });
});
