/** Read-only, redacted known-pattern scan of Git-tracked working-tree files. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface SecretFinding {
  path: string;
  line: number;
  rule: string;
}

// Never store matching values, snippets, credentials, or secret fingerprints.
const rules: ReadonlyArray<readonly [string, RegExp]> = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g],
  ['github-classic-token', /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g],
  ['github-fine-grained-token', /\bgithub_pat_[A-Za-z0-9_]{60,255}\b/g],
  ['aws-access-id', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['openai-api-key', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,255}\b/g],
  ['slack-token', /\bxox[baprs]-[0-9A-Za-z-]{20,255}\b/g],
  ['npm-token', /\bnpm_[A-Za-z0-9]{36}\b/g],
  ['url-userinfo', /https?:\/\/[^\s/:@"'<>]+:[^\s/@"'<>]{8,}@[A-Za-z0-9.-]+/g]
];

export function scanSecretText(path: string, source: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const [rule, pattern] of rules) {
    for (const match of source.matchAll(new RegExp(pattern.source, pattern.flags))) {
      findings.push({ path, line: source.slice(0, match.index).split('\n').length, rule });
    }
  }
  return findings.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
}

export function scanTrackedSecrets(root: string) {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .sort();
  const findings: SecretFinding[] = [];
  const binaryFiles: string[] = [];
  const digest = createHash('sha256');
  let textFiles = 0;
  let textBytes = 0;
  for (const path of files) {
    const bytes = readFileSync(resolve(root, path)); // Missing/unreadable files fail the scan.
    digest.update(path).update('\0').update(createHash('sha256').update(bytes).digest()).update('\0');
    if (bytes.includes(0)) {
      binaryFiles.push(path);
      continue;
    }
    textFiles++;
    textBytes += bytes.length;
    findings.push(...scanSecretText(path, bytes.toString('utf8')));
  }
  return {
    schemaVersion: 'pendulum-secret-scan/v1',
    capturedAt: new Date().toISOString(),
    sourceCommit: git('rev-parse', 'HEAD'),
    trackedContentSha256: digest.digest('hex'),
    scope: 'All Git-tracked working-tree text files; binary files listed separately; no history or ignored files.',
    rules: rules.map(([name]) => name),
    trackedFiles: files.length,
    textFiles,
    textBytes,
    binaryFiles,
    findings,
    limitations: [
      'Known credential formats only; no entropy analysis, provider validation, or detection of arbitrary passwords.',
      'Zero findings means no matches for these rules, not proof that all secrets are absent.',
      'Git history, ignored files, binary contents, and external services are outside this local scan.'
    ]
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const report = scanTrackedSecrets(process.cwd());
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.findings.length ? 1 : 0;
}
