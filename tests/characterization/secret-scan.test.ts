import { describe, expect, it } from 'vitest';
import { scanSecretText } from '../../scripts/redesign/secret-scan';

describe('redacted baseline secret scan', () => {
  it('finds known token families and line numbers without returning secret values', () => {
    const synthetic = ['gh' + 'p_' + 'A'.repeat(36), 'A' + 'KIA' + 'B'.repeat(16)];
    const result = scanSecretText('sample.txt', `header\n${synthetic[0]}\n${synthetic[1]}`);
    expect(result).toEqual([
      { path: 'sample.txt', line: 2, rule: 'github-classic-token' },
      { path: 'sample.txt', line: 3, rule: 'aws-access-id' }
    ]);
    for (const token of synthetic) expect(JSON.stringify(result)).not.toContain(token);
  });

  it('detects private key headers, URL credentials, and repeat scans consistently', () => {
    const sample = '-----BEGIN ' + 'PRIVATE KEY-----\nhttps://user:' + 'A'.repeat(16) + '@example.invalid';
    const expected = [
      { path: 'keys.txt', line: 1, rule: 'private-key' },
      { path: 'keys.txt', line: 2, rule: 'url-userinfo' }
    ];
    expect(scanSecretText('keys.txt', sample)).toEqual(expected);
    expect(scanSecretText('keys.txt', sample)).toEqual(expected);
  });

  it('ignores environment placeholders and ordinary public URLs', () => {
    expect(scanSecretText('config.txt', 'GH_TOKEN=${TOKEN}\nhttps://github.com/example/repo\nghp_example')).toEqual([]);
  });
});
