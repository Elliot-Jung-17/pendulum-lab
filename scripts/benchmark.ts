import { chromium } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BenchmarkMetrics } from '../src/types/domain';

const originalUrl = process.env.ORIGINAL_URL ?? 'http://127.0.0.1:5173/';
const candidateUrl = process.env.CANDIDATE_URL ?? 'http://127.0.0.1:5173/';
const localDevOrigin = 'http://127.0.0.1:5173';

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

function markdown(rows: BenchmarkMetrics[]): string {
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
  return `${lines.join('\n')}\n`;
}

const server = await ensureBenchmarkServer();
try {
  const results = [await sample(originalUrl, 'original'), await sample(candidateUrl, 'candidate')];
  await mkdir('reports', { recursive: true });
  await writeFile('reports/benchmark-report.json', JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  await writeFile('reports/benchmark-report.md', markdown(results));
  console.log(markdown(results));
} finally {
  server?.kill();
}
