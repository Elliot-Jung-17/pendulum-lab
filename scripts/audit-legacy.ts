import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

type Counts = {
  innerHTML: number;
  onclick: number;
  inlineWorkerBlob: number;
  evalLike: number;
  dynamicScript: number;
  globalRuntimeExports: number;
};

const rootDirs = ['js', 'src'];
const weights: Counts = {
  innerHTML: 2,
  onclick: 2,
  inlineWorkerBlob: 8,
  evalLike: 20,
  dynamicScript: 12,
  globalRuntimeExports: 5
};

async function collectFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    // Directory absent (e.g. the legacy `js/` was archived) — nothing to scan.
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(path));
    else if (/\.(js|ts|html|css)$/.test(entry.name)) files.push(path);
  }
  return files;
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function score(counts: Counts): number {
  return Object.entries(counts).reduce((sum, [key, value]) => sum + value * weights[key as keyof Counts], 0);
}

const counts: Counts = {
  innerHTML: 0,
  onclick: 0,
  inlineWorkerBlob: 0,
  evalLike: 0,
  dynamicScript: 0,
  globalRuntimeExports: 0
};
const files: Record<string, Counts> = {};

for (const dir of rootDirs) {
  for (const file of await collectFiles(dir)) {
    const text = await readFile(file, 'utf8');
    const fileCounts: Counts = {
      innerHTML: countMatches(text, /\binnerHTML\b/g),
      onclick: countMatches(text, /\.onclick\b/g),
      inlineWorkerBlob: countMatches(text, /new\s+Blob\s*\(\s*\[\s*workerSrc/g),
      evalLike: countMatches(text, /\beval\s*\(|new\s+Function\b/g),
      dynamicScript: countMatches(text, /createElement\s*\(\s*['"]script['"]\s*\)/g),
      globalRuntimeExports: countMatches(text, /(?:globalThis|window)\.(App|Physics|Validation|WorkerMgr)\s*=/g)
    };
    files[relative('.', file)] = fileCounts;
    for (const key of Object.keys(counts) as Array<keyof Counts>) counts[key] += fileCounts[key];
  }
}

let baseline: { counts: Counts; weightedScore: number } | null = null;
try {
  baseline = JSON.parse(await readFile('reports/legacy-risk-baseline.json', 'utf8')) as { counts: Counts; weightedScore: number };
} catch {
  baseline = null;
}

const weightedScore = score(counts);
const baselineScore = baseline?.weightedScore ?? weightedScore;
const delta = weightedScore - baselineScore;
const pass = baseline ? weightedScore < baselineScore : true;
const report = {
  generatedAt: new Date().toISOString(),
  pass,
  counts,
  weights,
  weightedScore,
  baselineScore,
  delta,
  files
};

const markdown = [
  '# Legacy Risk Audit',
  '',
  `Generated: ${report.generatedAt}`,
  `Status: ${pass ? 'PASS' : 'FAIL'}`,
  `Weighted score: ${weightedScore} (${delta <= 0 ? '' : '+'}${delta} vs baseline)`,
  '',
  '| Metric | Count | Weight | Weighted | Baseline |',
  '|---|---:|---:|---:|---:|',
  ...Object.keys(counts).map((key) => {
    const metric = key as keyof Counts;
    return `| ${metric} | ${counts[metric]} | ${weights[metric]} | ${counts[metric] * weights[metric]} | ${baseline?.counts?.[metric] ?? 'n/a'} |`;
  })
].join('\n');

await mkdir('reports', { recursive: true });
await writeFile('reports/legacy-risk-report.json', JSON.stringify(report, null, 2));
await writeFile('reports/legacy-risk-report.md', `${markdown}\n`);

console.log(markdown);
if (!pass) process.exitCode = 1;
