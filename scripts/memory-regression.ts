import { mkdir, readFile, writeFile } from 'node:fs/promises';

interface BenchmarkMetricRow {
  label: string;
  url: string;
  memoryBytes: number | null;
}

interface BenchmarkReport {
  generatedAt?: string;
  results?: BenchmarkMetricRow[];
}

interface MemoryBaseline {
  schemaVersion: 1;
  createdAt: string;
  sourceReport: string;
  label: string;
  url: string;
  memoryBytes: number;
  maxGrowthBytes: number;
}

const benchmarkPath = process.env.MEMORY_BENCHMARK_REPORT ?? 'reports/benchmark-report.json';
const baselinePath = process.env.MEMORY_BASELINE_FILE ?? 'reports/memory-baseline.json';
const failOnRegression = process.env.MEMORY_FAIL_ON_REGRESSION === '1';
const maxGrowthBytes = numberFromEnv('MEMORY_MAX_GROWTH_BYTES', 50_000_000);

function numberFromEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

function candidateMemory(report: BenchmarkReport): BenchmarkMetricRow | null {
  return report.results?.find((row) => row.label === 'candidate' && typeof row.memoryBytes === 'number')
    ?? report.results?.find((row) => typeof row.memoryBytes === 'number')
    ?? null;
}

function markdown(status: 'created' | 'pass' | 'warn' | 'missing', row: BenchmarkMetricRow | null, baseline: MemoryBaseline | null): string {
  const lines = [
    '# Memory Regression Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Status: ${status.toUpperCase()}`,
    '',
    '| Field | Value |',
    '|---|---|',
    `| benchmark report | \`${benchmarkPath}\` |`,
    `| baseline file | \`${baselinePath}\` |`,
    `| current label | ${row?.label ?? 'n/a'} |`,
    `| current memory bytes | ${row?.memoryBytes ?? 'n/a'} |`,
    `| baseline memory bytes | ${baseline?.memoryBytes ?? 'n/a'} |`,
    `| allowed growth bytes | ${baseline?.maxGrowthBytes ?? maxGrowthBytes} |`
  ];
  if (row && baseline && typeof row.memoryBytes === 'number') {
    lines.push(`| delta bytes | ${row.memoryBytes - baseline.memoryBytes} |`);
  }
  return `${lines.join('\n')}\n`;
}

await mkdir('reports', { recursive: true });
const report = await readJson<BenchmarkReport>(benchmarkPath);
const row = report ? candidateMemory(report) : null;

if (!row || typeof row.memoryBytes !== 'number') {
  await writeFile('reports/memory-regression-report.md', markdown('missing', row, null));
  console.log(markdown('missing', row, null));
  if (failOnRegression) throw new Error('Memory metric missing; run npm run benchmark in a Chromium environment.');
  process.exit(0);
}

const existing = await readJson<MemoryBaseline>(baselinePath);
if (!existing) {
  const baseline: MemoryBaseline = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    sourceReport: benchmarkPath,
    label: row.label,
    url: row.url,
    memoryBytes: row.memoryBytes,
    maxGrowthBytes
  };
  await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  await writeFile('reports/memory-regression-report.md', markdown('created', row, baseline));
  console.log(markdown('created', row, baseline));
  process.exit(0);
}

const status = row.memoryBytes - existing.memoryBytes > existing.maxGrowthBytes ? 'warn' : 'pass';
await writeFile('reports/memory-regression-report.md', markdown(status, row, existing));
console.log(markdown(status, row, existing));
if (failOnRegression && status === 'warn') {
  throw new Error('Memory regression threshold exceeded; see reports/memory-regression-report.md');
}
