import { describe, expect, test } from 'vitest';
import { csvCell, dataUrlByteEstimate, hashText } from '../src/research/researchExportUtils';

describe('research export utilities', () => {
  test('hashText is deterministic and sensitive to content', () => {
    expect(hashText('pendulum figure')).toBe(hashText('pendulum figure'));
    expect(hashText('pendulum figure')).not.toBe(hashText('pendulum figure updated'));
  });

  test('dataUrlByteEstimate estimates base64 payload bytes', () => {
    expect(dataUrlByteEstimate('data:text/plain;base64,SGVsbG8=')).toBe(5);
    expect(dataUrlByteEstimate('SGVsbG8=')).toBe(5);
  });

  test('csvCell quotes commas, quotes, and line breaks', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell('a\nb')).toBe('"a\nb"');
  });
});
