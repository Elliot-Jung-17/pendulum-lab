import { failure, type ContractResult } from '../contracts/validation';
import { DATA_LIMITS, inspectSafeData, type JsonValue } from './safe-data';

/** Strict bounded JSON scanner also rejects duplicate keys (including escaped spellings). */
export function parseContractJson(input: unknown): ContractResult<JsonValue> {
  if (typeof input !== 'string') return failure('invalid-json', '$', 'Expected JSON text.', 'keep-original');
  const text = input;
  if (text.length > DATA_LIMITS.bytes || new TextEncoder().encode(text).length > DATA_LIMITS.bytes) {
    return failure('size-limit', '$', 'JSON exceeds the file contract limit.', 'export-file');
  }
  let offset = 0;
  let nodes = 0;
  function whitespace() {
    while (/\s/.test(text.charAt(offset)) && offset < text.length) offset++;
  }
  function stringToken(): string {
    const start = offset++;
    while (offset < text.length) {
      const character = text.charAt(offset++);
      if (character === '\\') offset++;
      else if (character === '"') return JSON.parse(text.slice(start, offset)) as string;
    }
    throw new Error('Unterminated string.');
  }
  function scan(depth: number): void {
    if (depth > DATA_LIMITS.depth || ++nodes > DATA_LIMITS.nodes) throw new Error('Structure limit.');
    whitespace();
    const character = text.charAt(offset);
    if (character === '"') {
      stringToken();
      return;
    }
    if (character === '{' || character === '[') {
      offset++;
      whitespace();
      const end = character === '{' ? '}' : ']';
      if (text.charAt(offset) === end) {
        offset++;
        return;
      }
      const keys = new Set<string>();
      let count = 0;
      while (offset < text.length) {
        if (++count > (character === '{' ? DATA_LIMITS.keys : DATA_LIMITS.array)) throw new Error('Collection limit.');
        whitespace();
        if (character === '{') {
          if (text.charAt(offset) !== '"') throw new Error('Expected key.');
          const key = stringToken();
          if (keys.has(key)) throw new Error('Duplicate key.');
          keys.add(key);
          whitespace();
          if (text.charAt(offset++) !== ':') throw new Error('Expected colon.');
        }
        scan(depth + 1);
        whitespace();
        const delimiter = text.charAt(offset++);
        if (delimiter === end) return;
        if (delimiter !== ',') throw new Error('Expected delimiter.');
      }
      throw new Error('Unterminated collection.');
    }
    const scalar = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(offset));
    if (!scalar) throw new Error('Invalid scalar.');
    offset += scalar[0].length;
  }
  try {
    scan(0);
    whitespace();
    if (offset !== text.length) throw new Error('Trailing data.');
    return inspectSafeData(JSON.parse(text) as unknown);
  } catch {
    return failure('invalid-json', '$', 'JSON is malformed, ambiguous, or exceeds structural limits.', 'keep-original');
  }
}
