import { mkdir, writeFile } from 'node:fs/promises';
import { runAllValidationChecks } from '../src/validation/validationSuite';

const report = runAllValidationChecks();
const rows = report.value ?? [];
const markdown = [
  '# Pendulum Lab Validation Report',
  '',
  `Generated: ${new Date().toISOString()}`,
  `Overall: ${report.ok ? 'PASS' : 'FAIL'}`,
  '',
  '| Test | Status | Measured | Threshold |',
  '|---|---|---:|---|',
  ...rows.map((row) => `| ${row.id} | ${row.status} | ${row.measured} | ${row.threshold} |`)
].join('\n');

await mkdir('reports', { recursive: true });
await writeFile('reports/validation-report.json', JSON.stringify(report, null, 2));
await writeFile('reports/validation-report.md', `${markdown}\n`);
