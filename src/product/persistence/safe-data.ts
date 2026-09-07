import { failure, success, type ContractResult } from '../contracts/validation';

export const DATA_LIMITS = Object.freeze({
  bytes: 256 * 1024,
  depth: 24,
  nodes: 32768,
  array: 4096,
  keys: 256,
  string: 4096
});
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** Plain data only: no user callbacks, getters, toJSON, inherited state or lossy JSON values. */
export function inspectSafeData(input: unknown): ContractResult<JsonValue> {
  let nodes = 0;
  let bytes = 0;
  const ancestors = new Set<object>();
  const encoder = new TextEncoder();
  function visit(value: unknown, depth: number): JsonValue {
    if (++nodes > DATA_LIMITS.nodes || depth > DATA_LIMITS.depth) throw new Error('Data exceeds structural limits.');
    if (value === null || typeof value === 'boolean') {
      bytes += 5;
      return value;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || Object.is(value, -0))
        throw new Error('Numbers must be finite; negative zero is not canonical.');
      bytes += 24;
      return value;
    }
    if (typeof value === 'string') {
      if (
        value.length > DATA_LIMITS.string ||
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)
      ) {
        throw new Error('String exceeds limits or contains invalid Unicode.');
      }
      bytes += encoder.encode(JSON.stringify(value)).length;
      if (bytes > DATA_LIMITS.bytes) throw new Error('Data exceeds byte limit.');
      return value;
    }
    if (typeof value !== 'object') throw new Error('Only JSON data values are supported.');
    const prototype = Object.getPrototypeOf(value);
    const array = Array.isArray(value);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
      throw new Error('Only plain objects and arrays are supported.');
    }
    if (ancestors.has(value)) throw new Error('Cyclic data is unsupported.');
    ancestors.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    const length = array ? (descriptors.length?.value as number) : 0;
    const expected = array ? length + 1 : keys.length;
    if (
      array
        ? !Number.isSafeInteger(length) || length < 0 || length > DATA_LIMITS.array || keys.length !== expected
        : keys.length > DATA_LIMITS.keys
    ) {
      throw new Error('Object/array exceeds limits or has sparse/extra entries.');
    }
    const output: JsonValue[] | { [key: string]: JsonValue } = array ? [] : {};
    for (const key of keys) {
      if (typeof key !== 'string' || forbidden.has(key)) throw new Error('Unsafe object key.');
      if (array && key === 'length') continue;
      const descriptor = descriptors[key]!;
      if (!('value' in descriptor) || !descriptor.enumerable)
        throw new Error('Accessors and hidden properties are unsupported.');
      if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length)) throw new Error('Invalid array key.');
      visit(key, depth + 1);
      const child = visit(descriptor.value, depth + 1);
      Object.defineProperty(output, key, { value: child, enumerable: true, writable: true, configurable: true });
    }
    ancestors.delete(value);
    return output;
  }
  try {
    const value = visit(input, 0);
    if (bytes > DATA_LIMITS.bytes) return failure('size-limit', '$', 'Use a file for larger data.', 'export-file');
    return success(value);
  } catch {
    return failure(
      'unsafe-data',
      '$',
      'Malformed, unsafe, or oversized data; preserve the original and correct the input.',
      'keep-original'
    );
  }
}

/** Stable across object insertion order. Call only after inspectSafeData has accepted a snapshot. */
export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`)
    .join(',')}}`;
}
