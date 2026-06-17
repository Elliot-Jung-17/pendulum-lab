import { chromium } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BenchmarkMetrics } from '../src/types/domain';

const originalUrl = process.env.ORIGINAL_URL ?? 'http://127.0.0.1:5173/';
const candidateUrl = process.env.CANDIDATE_URL ?? 'http://127.0.0.1:5173/';
const localDevOrigin = 'http://127.0.0.1:5173';
const failOnRegression = process.env.BENCHMARK_FAIL_ON_REGRESSION === '1';
const maxFpsDropFraction = numberFromEnv('BENCHMARK_MAX_FPS_DROP_FRACTION', 0.25);
const maxPhysicsSlowdownFraction = numberFromEnv('BENCHMARK_MAX_PHYSICS_SLOWDOWN_FRACTION', 0.25);
const maxMemoryGrowthBytes = numberFromEnv('BENCHMARK_MAX_MEMORY_GROWTH_BYTES', 50_000_000);

interface BenchmarkDelta {
  metric: 'fps' | 'physicsMsPerFrame' | 'memoryBytes' | 'workerLatencyMs';
  original: number | null;
  candidate: number | null;
  delta: number | null;
  relativeDelta: number | null;
  threshold: number;
  direction: 'higher-is-better' | 'lower-is-better';
  status: 'pass' | 'warn' | 'missing';
}

interface BenchmarkComparison {
  originalUrl: string;
  candidateUrl: string;
  sameUrl: boolean;
  failOnRegression: boolean;
  deltas: BenchmarkDelta[];
  status: 'pass' | 'warn';
}

function numberFromEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function reachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

async function waitForServer(url: string, timeoutMs = 20_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await reachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for benchmark server at ${url}`);
}

function usesDefaultLocalServer(url: string): boolean {
  try {
    return new URL(url).origin === localDevOrigin;
  } catch {
    return false;
  }
}

async function ensureBenchmarkServer(): Promise<ChildProcess | null> {
  if (!usesDefaultLocalServer(originalUrl) && !usesDefaultLocalServer(candidateUrl)) return null;
  if (await reachable(localDevOrigin)) return null;

  const viteCli = join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
  const server = spawn(process.execPath, [viteCli, '--host', '127.0.0.1', '--port', '5173'], {
    stdio: 'ignore',
    shell: false
  });
  await waitForServer(localDevOrigin);
  return server;
}

async function sample(url: string, label: string): Promise<BenchmarkMetrics> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(4_000);
    return await page.evaluate((sampleLabel) => {
      const lab = (window as unknown as { __modernLab?: { diagnostics(): { fps: number; physicsMsPerFrame: number } } }).__modernLab;
      const diag = lab ? lab.diagnostics() : null;
      const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
      return {
        label: sampleLabel,
        url: location.href,
        fps: typeof diag?.fps === 'number' ? diag.fps : null,
        physicsMsPerFrame: typeof diag?.physicsMsPerFrame === 'number' ? diag.physicsMsPerFrame : null,
        memoryBytes: typeof memory?.usedJSHeapSize === 'number' ? memory.usedJSHeapSize : null,
        workerLatencyMs: null
      };
    }, label);
  } finally {
    await browser.close();
  }
}

function relativeDelta(original: number, candidate: number): number | null {
  if (original === 0) return null;
  return (candidate - original) / Math.abs(original);
}

function compareMetric(
  original: BenchmarkMetrics,
  candidate: BenchmarkMetrics,
  metric: BenchmarkDelta['metric'],
  threshold: number,
  direction: BenchmarkDelta['direction']
): BenchmarkDelta {
  const a = original[metric];
  const b = candidate[metric];
  if (a === null || b === null) {
    return { metric, original: a, candidate: b, delta: null, relativeDelta: null, threshold, direction, status: 'missing' };
  }
  const delta = b - a;
  const rel = relativeDelta(a, b);
  const failed = metric === 'memoryBytes'
    ? delta > threshold
    : direction === 'higher-is-better'
    ? rel !== null && rel < -threshold
    : rel !== null
      ? rel > threshold
      : delta > threshold;
  return { metric, original: a, candidate: b, delta, relativeDelta: rel, threshold, direction, status: failed ? 'warn' : 'pass' };
}

function compareResults(results: BenchmarkMetrics[]): BenchmarkComparison {
  const original = results.find((row) => row.label === 'original') ?? results[0]!;
  const candidate = results.find((row) => row.label === 'candidate') ?? results[1] ?? original;
  const deltas = [
    compareMetric(original, candidate, 'fps', maxFpsDropFraction, 'higher-is-better'),
    compareMetric(original, candidate, 'physicsMsPerFrame', maxPhysicsSlowdownFraction, 'lower-is-better'),
    compareMetric(original, candidate, 'memoryBytes', maxMemoryGrowthBytes, 'lower-is-better'),
    compareMetric(original, candidate, 'workerLatencyMs', maxPhysicsSlowdownFraction, 'lower-is-better')
  ];
  return {
    originalUrl,
    candidateUrl,
    sameUrl: originalUrl === candidateUrl,
    failOnRegression,
    deltas,
    status: deltas.some((delta) => delta.status === 'warn') ? 'warn' : 'pass'
  };
}

function formatNumber(value: number | null): string {
  if (value === null) return 'n/a';
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  return value.toPrecision(4);
}

function formatPercent(value: number | null): string {
  return value === null ? 'n/a' : `${(value * 100).toFixed(2)}%`;
}

function markdown(rows: BenchmarkMetrics[]): string {
  const comparison = compareResults(rows);
  const lines = [
    '# Pendulum Lab Benchmark Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '| Build | FPS | Physics ms/frame | Memory bytes | Worker latency ms | URL |',
    '|---|---:|---:|---:|---:|---|'
  ];
  for (const row of rows) {
    lines.push(`| ${row.label} | ${row.fps ?? 'n/a'} | ${row.physicsMsPerFrame ?? 'n/a'} | ${row.memoryBytes ?? 'n/a'} | ${row.workerLatencyMs ?? 'n/a'} | ${row.url} |`);
  }
  lines.push(
    '',
    '## Original vs candidate',
    '',
    `Status: ${comparison.status.toUpperCase()}${comparison.sameUrl ? ' (same URL sampled twice)' : ''}`,
    '',
    '| Metric | Direction | Original | Candidate | Delta | Relative delta | Status |',
    '|---|---|---:|---:|---:|---:|---|'
  );
  for (const delta of comparison.deltas) {
    lines.push(
      `| ${delta.metric} | ${delta.direction} | ${formatNumber(delta.original)} | ${formatNumber(delta.candidate)} | ${formatNumber(delta.delta)} | ${formatPercent(delta.relativeDelta)} | ${delta.status} |`
    );
  }
  return `${lines.join('\n')}\n`;
}

const server = await ensureBenchmarkServer();
try {
  const results = [await sample(originalUrl, 'original'), await sample(candidateUrl, 'candidate')];
  const comparison = compareResults(results);
  await mkdir('reports', { recursive: true });
  await writeFile('reports/benchmark-report.json', JSON.stringify({ generatedAt: new Date().toISOString(), results, comparison }, null, 2));
  await writeFile('reports/benchmark-report.md', markdown(results));
  console.log(markdown(results));
  if (failOnRegression && comparison.status === 'warn') {
    throw new Error('Benchmark regression threshold exceeded; see reports/benchmark-report.md');
  }
} finally {
  server?.kill();
}
