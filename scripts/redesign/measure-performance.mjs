import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

// Rebuild the current legacy application, then profile three independent browser
// contexts. Writes only ignored dist output and the two performance reports.
// Run from the repository: node scripts/redesign/measure-performance.mjs
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const reportDirectory = resolve(root, 'documents/redesign/baseline');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const sourcePaths = ['src', 'css', 'public', 'app.html', 'package.json', 'package-lock.json', 'vite.config.ts'];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const summary = (values) => ({
  median: median(values),
  min: Math.min(...values),
  max: Math.max(...values),
  mad: median(values.map((value) => Math.abs(value - median(values))))
});

async function runNode(args) {
  await new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolveRun() : reject(new Error(`${args[0]} exited ${code}`))));
  });
}

async function collectSample(browser, origin, index) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: 'en-US',
    storageState: {
      cookies: [],
      origins: [{ origin, localStorage: [{ name: 'pendulum-lab/ui/audience-mode', value: 'research' }] }]
    }
  });
  try {
    const page = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.addInitScript(() => {
      const observeReady = () => {
        if (window.__modernLab?.diagnostics().time > 0 && document.getElementById('main')) {
          window.__s01ReadyMs = performance.now();
        } else requestAnimationFrame(observeReady);
      };
      requestAnimationFrame(observeReady);
    });
    await page.goto(`${origin}/app.html`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => Number.isFinite(window.__s01ReadyMs), undefined, { timeout: 30000 });
    const startup = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      return {
        engineAdvancingMs: window.__s01ReadyMs,
        domContentLoadedMs: nav.domContentLoadedEventEnd,
        loadMs: nav.loadEventEnd,
        paints: performance.getEntriesByType('paint').map(({ name, startTime }) => ({ name, startTime })),
        config: window.__modernLab.readConfig(),
        devicePixelRatio,
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency
      };
    });
    // Initial bootstrap/lazy mounts settle before the steady-state sampling window.
    await page.waitForTimeout(2000);
    const cdp = await context.newCDPSession(page);
    const heapBefore = await cdp.send('Runtime.getHeapUsage');
    const steady = await page.evaluate(async () => {
      const start = performance.now();
      const initialTime = window.__modernLab.diagnostics().time;
      const frames = [];
      const ticks = [];
      let raf;
      const observe = (timestamp) => {
        ticks.push(timestamp);
        raf = requestAnimationFrame(observe);
      };
      raf = requestAnimationFrame(observe);
      for (let i = 0; i < 20; i += 1) {
        await new Promise((resolveTick) => setTimeout(resolveTick, 250));
        frames.push({ elapsedMs: performance.now() - start, ...window.__modernLab.diagnostics() });
      }
      cancelAnimationFrame(raf);
      return {
        elapsedMs: performance.now() - start,
        simulationSecondsAdvanced: window.__modernLab.diagnostics().time - initialTime,
        rafCallbackCount: ticks.length,
        rafCallbacksPerSecond: ((ticks.length - 1) * 1000) / (ticks.at(-1) - ticks[0]),
        frames
      };
    });
    const heapAfter = await cdp.send('Runtime.getHeapUsage');
    await page.evaluate(() => window.__modernShell.switchTo('rqa'));
    await page.waitForFunction(() => Boolean(window.__modernTabs?.rqa));
    await page.locator('#tab-rqa').waitFor({ state: 'visible' });
    const analysis = await page.evaluate(async () => {
      const status = document.getElementById('rqaStatus');
      const dimension = Number(document.getElementById('rqaDim').value);
      const delay = Number(document.getElementById('rqaDelay').value);
      const started = performance.now();
      let initialStatus;
      const result = await new Promise((resolveResult, reject) => {
        const timeout = setTimeout(() => {
          observer.disconnect();
          reject(new Error('RQA did not complete within 30 seconds'));
        }, 30000);
        const observer = new MutationObserver(() => {
          const message = status.textContent ?? '';
          if (message.startsWith('error:')) {
            clearTimeout(timeout);
            observer.disconnect();
            reject(new Error(message));
          } else if (message.startsWith('done')) {
            clearTimeout(timeout);
            observer.disconnect();
            resolveResult({
              durationMs: performance.now() - started,
              status: message,
              determinism: document.getElementById('rqaDET').textContent,
              recurrenceRate: document.getElementById('rqaRR').textContent,
              longestDiagonal: document.getElementById('rqaLmax').textContent
            });
          }
        });
        observer.observe(status, { childList: true, characterData: true, subtree: true });
        document.getElementById('rqaStart').click();
        initialStatus = status.textContent;
      });
      return { ...result, initialStatus, dimension, delay };
    });
    assert.deepEqual(pageErrors, [], 'legacy application raised a page error');
    assert.deepEqual(consoleErrors, [], 'legacy application raised a console error');
    assert(steady.simulationSecondsAdvanced > 0, 'simulation failed to advance');
    assert(steady.frames.every((frame) => Number.isFinite(frame.fps) && frame.fps > 0));
    assert(Number.isFinite(Number.parseFloat(analysis.determinism)));
    return { index, startup, steady, heapBefore, heapAfter, analysis, pageErrors, consoleErrors };
  } finally {
    await context.close();
  }
}

function markdown(report) {
  const e = report.environment;
  const a = report.aggregates;
  const row = (label, value) =>
    `| ${label} | ${value.median.toFixed(3)} | ${value.min.toFixed(3)}–${value.max.toFixed(3)} | ${value.mad.toFixed(3)} |`;
  return [
    '# S01 legacy 앱 성능 기준선',
    '',
    `실측 UTC: ${report.measuredAt}. 대상: 기존 app.html, production build, ${report.samples.length}개 독립 browser context.`,
    '',
    '## 재실행',
    '',
    '```sh',
    'node scripts/redesign/measure-performance.mjs',
    '```',
    '',
    '설치된 Vite/Playwright/Chromium만 사용한다. 스크립트는 npm run build의 세 명령을 순서대로 실행한 뒤 localhost preview를 시작한다. 사용자 브라우저 프로필은 읽지 않는다. 완료 또는 오류 시 임시 browser/server를 닫는다.',
    '다른 benchmark/build/test를 멈춘 같은 장치에서 다시 측정한다. 자동 성능 합격선이나 개선 주장은 없으며 S30 비교의 출발점이다.',
    '',
    '## 환경과 입력',
    '',
    `- Git HEAD: \`${e.commit}\`; branch: \`${e.branch}\`.`,
    `- src tree: \`${e.sourceTree}\`; 측정 시작/끝 application 입력 변경 검사: 통과.`,
    `- 제품: ${e.packageVersion}; Node ${e.node}; Playwright ${e.playwright}; Vite ${e.vite}.`,
    `- OS: ${e.os}; arch: ${e.arch}; CPU: ${e.cpu}; 논리 CPU: ${e.logicalCpus}; RAM: ${(e.totalMemoryBytes / 2 ** 30).toFixed(2)} GiB.`,
    `- Browser: headless Chromium ${e.browser}; 1440×900 CSS px; DPR 1; locale en-US; research audience, 나머지 fresh storage.`,
    `- lockfile SHA-256: \`${e.lockfileSha256}\`.`,
    `- 빌드 app.html SHA-256: \`${e.builtAppSha256}\`.`,
    '- 전체 설정, 런타임 품질/backend, 20개 개별 프레임 진단, raw 메모리와 RQA 결과는 performance-baseline.json에 보존한다.',
    '',
    '## 측정 결과',
    '',
    '| 지표 | 중앙값 | 최소–최대 | MAD (unscaled) |',
    '|---|---:|---:|---:|',
    row('시작: navigation → engine time > 0 + main canvas 존재 (ms)', a.startupMs),
    row('DOMContentLoaded (ms)', a.domContentLoadedMs),
    row('load (ms)', a.loadMs),
    row('앱 FPS (각 실행의 20회 진단 평균)', a.applicationFps),
    row('headless rAF callback/s', a.rafCallbacksPerSecond),
    row('physics ms/frame (각 실행의 20회 평균)', a.physicsMsPerFrame),
    row('render ms/frame (각 실행의 20회 평균)', a.renderMsPerFrame),
    row('측정 종료 JS heap (MiB)', a.heapMiB),
    row('5초 구간 JS heap 변화 (MiB)', a.heapDeltaMiB),
    row('RQA click → 결과/plot 완료 (ms)', a.rqaMs),
    '',
    '## 측정 정의와 한계',
    '',
    ...report.limitations.map((item) => `- ${item}`),
    '',
    'RQA 경로: src/app/RqaTab.ts → src/runtime/ChaosClient.ts → src/workers/chaosJobHandlers.ts. 기존 UI 기본 dimension/delay 값을 읽고 target recurrence rate 0.1을 사용한다. 기존 worker 기본값은 dt=0.01, sampleEvery=20, samples=360, transientSteps=2000이며 uncertainty block 4개다. 각 결과에 worker 사용 여부를 나타내는 computing 상태를 기록한다.',
    '',
    '검증: 3/3 실험에서 simulation time 증가, 유한한 FPS/DET, pageerror 0, console error 0. 성능 측정은 수치 정확성/누수 부재/실제 디스플레이 FPS 검증을 대신하지 않는다.',
    ''
  ].join('\n');
}

assert.equal(git('diff', '--name-only', 'HEAD', '--', ...sourcePaths), '', 'application inputs must match HEAD');
assert.equal(
  git('ls-files', '--others', '--exclude-standard', '--', ...sourcePaths),
  '',
  'untracked application inputs'
);
const sourceCommit = git('rev-parse', 'HEAD');
await runNode(['node_modules/vite/bin/vite.js', 'build']);
await runNode(['scripts/copy-legacy-assets.mjs']);
await runNode(['--import', 'tsx', 'scripts/audit-public-artifacts.ts', '--root', 'dist/reports']);
let server;
let browser;
try {
  server = await preview({ root, preview: { host: '127.0.0.1', port: 4179, strictPort: true } });
  browser = await chromium.launch({ headless: true });
  const origin = 'http://127.0.0.1:4179';
  const samples = [];
  for (let index = 1; index <= 3; index += 1) {
    console.log(`S01 performance sample ${index}/3`);
    samples.push(await collectSample(browser, origin, index));
  }
  assert.equal(git('rev-parse', 'HEAD'), sourceCommit, 'HEAD changed during measurement');
  assert.equal(git('diff', '--name-only', 'HEAD', '--', ...sourcePaths), '', 'application changed during measurement');
  const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const aggregate = (getter) => summary(samples.map(getter));
  const report = {
    schemaVersion: 'pendulum-redesign-performance/v1',
    measuredAt: new Date().toISOString(),
    environment: {
      commit: sourceCommit,
      branch: git('branch', '--show-current'),
      sourceTree: git('rev-parse', 'HEAD:src'),
      dirtyPathsAtEnd: git('status', '--porcelain').split('\n').filter(Boolean),
      applicationInputsMatchHead: true,
      packageVersion: JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version,
      lockfileSha256: sha256(await readFile(resolve(root, 'package-lock.json'))),
      builtAppSha256: sha256(await readFile(resolve(root, 'dist/app.html'))),
      os: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      cpu: os.cpus()[0]?.model ?? 'unavailable',
      logicalCpus: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      node: process.version,
      browser: browser.version(),
      playwright: JSON.parse(await readFile(resolve(root, 'node_modules/@playwright/test/package.json'), 'utf8'))
        .version,
      vite: JSON.parse(await readFile(resolve(root, 'node_modules/vite/package.json'), 'utf8')).version,
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      headless: true,
      buildCommands: [
        'vite build',
        'node scripts/copy-legacy-assets.mjs',
        'tsx scripts/audit-public-artifacts.ts --root dist/reports'
      ]
    },
    procedure: {
      samples: 3,
      settleMs: 2000,
      diagnosticSamples: 20,
      intervalMs: 250,
      audience: 'research',
      url: `${origin}/app.html`
    },
    aggregates: {
      startupMs: aggregate((s) => s.startup.engineAdvancingMs),
      domContentLoadedMs: aggregate((s) => s.startup.domContentLoadedMs),
      loadMs: aggregate((s) => s.startup.loadMs),
      applicationFps: aggregate((s) => average(s.steady.frames.map((f) => f.fps))),
      rafCallbacksPerSecond: aggregate((s) => s.steady.rafCallbacksPerSecond),
      physicsMsPerFrame: aggregate((s) => average(s.steady.frames.map((f) => f.physicsMsPerFrame))),
      renderMsPerFrame: aggregate((s) => average(s.steady.frames.map((f) => f.renderMsPerFrame))),
      heapMiB: aggregate((s) => s.heapAfter.usedSize / 2 ** 20),
      heapDeltaMiB: aggregate((s) => (s.heapAfter.usedSize - s.heapBefore.usedSize) / 2 ** 20),
      rqaMs: aggregate((s) => s.analysis.durationMs)
    },
    samples,
    limitations: [
      '첫 샘플부터 fresh context/cache/storage를 사용하지만 browser process, OS 파일 cache와 build는 공유한다. 완전한 cold-device 또는 실제 네트워크 측정이 아니다.',
      'Startup은 navigation 시작부터 기존 engine이 진행하고 main canvas가 존재한 시점까지다. 전체 lazy 연구 UI 완료/첫 사용자 입력 가능 시간을 뜻하지 않는다. FCP와 load 타이밍은 raw 보고서에 별도로 남긴다.',
      '앱 FPS는 기존 RenderScheduler의 최근 30 frame 이동 평균을 250ms마다 읽어 실행별 평균을 낸 값이다. 별도 rAF callback rate도 함께 기록하지만 headless 예약/실행 빈도이며 실제 디스플레이에 보인 frame 수가 아니다.',
      'CDP Runtime.getHeapUsage의 main renderer V8 usedSize를 사용한다. GC 강제 실행 없이 두 시점을 기록하므로 음수 변화도 가능하다. 전체 browser/worker/GPU/OS 메모리나 누수 검사를 대표하지 않는다.',
      'RQA 시간은 lazy tab mount 이후 UI click부터 기존 결과 DOM/plot 갱신까지의 end-to-end 시간이다. worker 전달, observable 생성, 계산, 결과 렌더를 포함하며 순수 알고리즘 시간이나 모든 분석의 비용을 대표하지 않는다.',
      '3회 짧은 실행의 장치별 기준선이며 thermal/background task/브라우저 버전에 따른 변동이 있다. S30 회귀 한계와 실제 장치/모바일/장시간 검증은 별도다.',
      'S01 측정 스크립트/문서/fixture 작성 중의 dirty worktree를 명시하되 application 입력은 시작/끝 HEAD 일치를 검사했다. 원본 앱, 엔진, worker, API와 사용자 데이터는 변경하지 않았다.'
    ]
  };
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(resolve(reportDirectory, 'performance-baseline.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(resolve(reportDirectory, 'performance-baseline.md'), markdown(report));
  console.log(JSON.stringify(report.aggregates, null, 2));
} finally {
  await browser?.close();
  if (server)
    await new Promise((resolveClose, reject) =>
      server.httpServer.close((error) => (error ? reject(error) : resolveClose()))
    );
}
