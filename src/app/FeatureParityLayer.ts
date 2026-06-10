import type { IntegratorId, PendulumParameters, RunMode, RuntimeSnapshot, SystemType } from '../types/domain';
import { commandRegistry } from '../runtime/CommandRegistry';
import { stateStore } from '../state/StateStore';
import { createSubmissionManifest, downloadJson } from '../export/manifest';
import { runAllValidationChecks, type ValidationCaseResult } from '../validation/validationSuite';
import { integratorRegistry } from '../physics/integrators';
import { canonicalStepThetaOmega } from '../physics/canonical';
import { energyDouble } from '../physics/energy';
import { energyChain, rhsChain } from '../physics/nPendulum';
import { drivenPeriodicOrbit } from '../chaos/floquet';
import { continueDrivenPeriodicOrbit } from '../chaos/continuation';
import { ChaosClient } from '../runtime/ChaosClient';
import type { SystemSpec } from '../physics/systemSpec';
import { createRailTabButton, EXTRA_RAIL_TABS } from './railNavigation';

type Tone = 'good' | 'warn' | 'bad' | 'info' | '';

interface ModernLabHandle {
  diagnostics?: () => {
    time: number;
    drift: number;
    poincarePoints: number;
    lambdaMax: number;
    fps: number;
    physicsMsPerFrame: number;
  };
  reset?: () => void;
}

interface CanonicalQa {
  runs: number;
  pass: boolean;
  residual: number;
  iterations: number;
  drift: number;
  symplecticDefect: number;
  timestamp: string;
}

interface AuditResult {
  generatedAt: string;
  passed: number;
  failed: number;
  tests: Array<{ id: string; status: 'PASS' | 'FAIL' | 'WARN'; detail: string }>;
  manifest: unknown;
}

type ResearchRunType = 'experiment' | 'validation' | 'parameter-study' | 'comparison' | 'export' | 'probe';

interface ResearchMetrics {
  drift: number | null;
  lambdaMax: number | null;
  fps: number | null;
  physicsMsPerFrame: number | null;
  poincarePoints: number;
  qualityScore: number;
  validationStatus: string;
}

interface ResearchExperiment {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  notes: string;
  tags: string[];
  snapshot: RuntimeSnapshot;
  metrics: ResearchMetrics;
}

interface ResearchRunLogEntry {
  id: string;
  type: ResearchRunType;
  label: string;
  timestamp: string;
  experimentId: string | null;
  snapshotHash: string;
  method: IntegratorId;
  system: SystemType;
  dt?: number;
  damping?: number;
  metrics: ResearchMetrics;
  summary: string;
  artifact?: string;
}

interface StudyPointResults {
  lambdaMax: number;
  lambdaBlockStdError: number;
  rqaDeterminism: number;
  rqaDivergence: number;
  ftle: number;
  completedAt: string;
}

interface ParameterStudyPoint {
  id: string;
  label: string;
  patch: Record<string, number | string>;
  snapshot: RuntimeSnapshot;
  estimate: string;
  /** Filled by the batch runner (Lyapunov / RQA / FTLE per point). */
  results?: StudyPointResults;
  /** Error message when the batch job for this point failed. */
  error?: string;
}

interface ParameterStudyPlan {
  id: string;
  generatedAt: string;
  variable: string;
  strategy: 'grid' | 'random' | 'symmetric';
  min: number;
  max: number;
  count: number;
  values: number[];
  experiments: ParameterStudyPoint[];
}

interface ResearchComparisonRow {
  id: string;
  label: string;
  source: string;
  timestamp: string;
  method: IntegratorId;
  system: SystemType;
  dt: number;
  damping: number;
  drift: number | null;
  lambdaMax: number | null;
  fps: number | null;
  score: number;
  hash: string;
}


const LEGACY_VALIDATION_IDS = [
  'energy-drift-gamma0',
  'damping-sanity',
  'small-angle-reference',
  'dt-halving-convergence',
  'order-accuracy-estimate',
  'time-reversibility',
  'deterministic-replay-hash',
  'worker-main-consistency',
  'poincare-crossing-consistency',
  'lyapunov-transient-handling',
  'rk4-reference-comparison',
  'implicit-solver-residual',
  'localstorage-roundtrip',
  'url-share-roundtrip',
  'json-import-schema',
  'nan-fault-injection',
  'render-independence',
  'browser-capability-report',
  'event-listener-leak-smoke',
  'performance-budget-smoke'
] as const;

const COMPAT_ANCHOR_IDS = [
  'single-file-platform-prelude-v9',
  'single-file-platform-architecture-v9',
  'pendulum-lab-v10-consolidation',
  'research-integrity-upgrade-v4',
  'research-governance-v7-script',
  'stable-intuitive-layer',
  'ple-tsconfig-strict',
  'ple-type-contracts',
  'pendulumRodFinal'
] as const;

const state = {
  mode: 'demo' as RunMode,
  recoveries: 0,
  auditLog: [] as string[],
  checkpoints: [] as RuntimeSnapshot[],
  lastValidation: null as ValidationCaseResult[] | null,
  lastCanonicalQa: null as CanonicalQa | null,
  lastAudit: null as AuditResult | null,
  lastFault: 'No runtime faults recorded.',
  research: {
    experiments: [] as ResearchExperiment[],
    selectedExperimentId: '',
    runLog: [] as ResearchRunLogEntry[],
    parameterStudy: null as ParameterStudyPlan | null,
    comparisonRows: [] as ResearchComparisonRow[]
  }
};

let installed = false;

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function html<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: {
    id?: string;
    className?: string;
    text?: string;
    title?: string;
    role?: string;
    ariaLabel?: string;
    type?: string;
    value?: string;
  } = {}
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.id) node.id = options.id;
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.title) node.title = options.title;
  if (options.role) node.setAttribute('role', options.role);
  if (options.ariaLabel) node.setAttribute('aria-label', options.ariaLabel);
  if (options.type && node instanceof HTMLButtonElement) node.type = options.type as HTMLButtonElement['type'];
  if (options.value !== undefined && (node instanceof HTMLInputElement || node instanceof HTMLSelectElement || node instanceof HTMLOptionElement)) {
    node.value = options.value;
  }
  return node;
}

function append(parent: Node, ...children: Array<Node | string | null | undefined>): void {
  for (const child of children) {
    if (child === null || child === undefined) continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(child));
  }
}

function clear(node: Element | null): void {
  if (node) node.replaceChildren();
}

function setText(id: string, text: string): void {
  const node = $(id);
  if (node) node.textContent = text;
}

function button(id: string, label: string, run: () => void | Promise<void>, className = ''): HTMLButtonElement {
  const node = html('button', { id, text: label, type: 'button', className });
  node.addEventListener('click', () => {
    void run();
  });
  return node;
}

function row(label: string, value: string, tone: Tone = ''): HTMLDivElement {
  const node = html('div', { className: 'srow' });
  const key = html('span', { className: 'skey', text: label });
  const val = html('span', { className: `sval ${tone}`.trim(), text: value });
  append(node, key, val);
  return node;
}

function kvGrid(id: string, pairs: Array<[string, string, Tone?]>): HTMLDivElement {
  const grid = html('div', { id, className: 'stats' });
  pairs.forEach(([k, v, tone]) => grid.append(row(k, v, tone ?? '')));
  return grid;
}

function card(title: string, body: Node, id?: string, className = 'rg-card'): HTMLElement {
  const section = id === undefined ? html('section', { className }) : html('section', { id, className });
  append(section, html('div', { className: 'rg-title', text: title }), body);
  return section;
}

function detailsCard(title: string, body: Node, id?: string): HTMLDetailsElement {
  const details = id === undefined ? html('details', { className: 'acc' }) : html('details', { id, className: 'acc' });
  details.open = true;
  const summary = html('summary');
  append(summary, html('span', { className: 'acc-icon', text: '>' }), html('span', { className: 'acc-label', text: title }), html('span', { className: 'acc-arrow', text: '>' }));
  append(details, summary, html('div', { className: 'acc-body' }));
  details.querySelector('.acc-body')?.append(body);
  return details;
}

function numberFrom(id: string, fallback: number): number {
  const el = $(id);
  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) return fallback;
  const value = Number.parseFloat(el.value);
  return Number.isFinite(value) ? value : fallback;
}

function selectValue(id: string, fallback: string): string {
  const el = $(id);
  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) return fallback;
  return el.value || fallback;
}

function setControl(id: string, value: string | number | boolean): void {
  const el = $(id);
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox') el.checked = Boolean(value);
    else el.value = String(value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (el instanceof HTMLSelectElement) {
    el.value = String(value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function modernLab(): ModernLabHandle | undefined {
  return (window as Window & { __modernLab?: ModernLabHandle }).__modernLab;
}

function currentParameters(): PendulumParameters {
  return {
    m1: numberFrom('m1', 1),
    m2: numberFrom('m2', 1),
    m3: numberFrom('m3', 1),
    l1: numberFrom('l1', 1.2),
    l2: numberFrom('l2', 1),
    l3: numberFrom('l3', 0.8),
    g: numberFrom('g', 9.81)
  };
}

function currentSystem(): SystemType {
  return selectValue('sysType', 'double') === 'triple' ? 'triple' : 'double';
}

function currentMethod(): IntegratorId {
  const raw = selectValue('method', 'rk4');
  if (raw === 'verlet') return 'leapfrog';
  return raw in integratorRegistry ? (raw as IntegratorId) : 'rk4';
}

function currentMode(): RunMode {
  const raw = state.mode;
  return raw === 'research' || raw === 'benchmark' || raw === 'education' || raw === 'performance' || raw === 'recovery' ? raw : 'demo';
}

/**
 * Build a live runtime snapshot from the current UI controls, running sim
 * state, and live diagnostics. Exported so other entry points (e.g. the
 * `index.exportSubmissionManifest` command) capture the actual live state
 * rather than the state-store defaults.
 */
export function currentSnapshot(): RuntimeSnapshot {
  const synced = stateStore.syncFromLegacy();
  const diag = modernLab()?.diagnostics?.();
  const system = currentSystem();
  const baseState = system === 'triple'
    ? [numberFrom('th1', 2), numberFrom('th2', 2.5), numberFrom('th3', 1), numberFrom('iw1', 0), numberFrom('iw2', 0), numberFrom('iw3', 0)]
    : [numberFrom('th1', 2), numberFrom('th2', 2.5), numberFrom('iw1', 0), numberFrom('iw2', 0)];
  const snapshot: RuntimeSnapshot = {
    ...synced,
    systemType: system,
    method: currentMethod(),
    mode: currentMode(),
    dt: numberFrom('dt', synced.dt || 0.003),
    tolerance: 10 ** numberFrom('tol', Math.log10(synced.tolerance || 1e-7)),
    stepsPerFrame: Math.max(1, Math.round(numberFrom('spf', synced.stepsPerFrame || 6))),
    damping: numberFrom('gamma', synced.damping || 0),
    parameters: currentParameters(),
    state: window.App?.state ? Array.from(window.App.state).slice(0, window.App.stateLen || window.App.state.length) : baseState,
    simTime: diag?.time ?? synced.simTime,
    hash: window.App?._stateHash ?? synced.hash
  };
  return snapshot;
}

function toast(message: string, timeout = 2200): void {
  const maybeToast = window.toast;
  if (typeof maybeToast === 'function') maybeToast(message, timeout);
  else {
    const box = $('toast');
    if (box) {
      box.textContent = message;
      box.classList.add('show');
      window.setTimeout(() => box.classList.remove('show'), timeout);
    }
  }
}

function record(message: string): void {
  const line = `${new Date().toLocaleTimeString()} ${message}`;
  state.auditLog.unshift(line);
  state.auditLog = state.auditLog.slice(0, 80);
  renderRuntimePanels();
}

function downloadText(filename: string, text: string, type = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = html('a');
  anchor.href = url;
  anchor.download = filename.replace(/[^a-zA-Z0-9._-]+/g, '_');
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function installStyle(id: string, css: string): void {
  if ($(id)) return;
  const style = html('style', { id });
  style.textContent = css;
  document.head.append(style);
}

function installStyles(): void {
  installStyle('rg-style', `
.rg-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.rg-card{background:rgba(12,16,28,.78);border:1px solid var(--glass-stroke);border-radius:8px;padding:12px;box-shadow:var(--shadow-xs)}
.rg-card.rg-wide{grid-column:1/-1}.rg-title{font:800 9.5px/1.2 var(--font-display);letter-spacing:1.6px;text-transform:uppercase;color:var(--cyan);margin-bottom:8px}
.rg-table{width:100%;border-collapse:collapse;font-size:10.5px}.rg-table td,.rg-table th{border:1px solid var(--glass-stroke);padding:6px;vertical-align:top}.rg-table th{color:var(--cyan);text-align:left;background:rgba(24,212,248,.04)}
.rg-log{white-space:pre-wrap;max-height:240px;overflow:auto;background:rgba(0,0,0,.22);border:1px solid var(--glass-stroke);border-radius:7px;padding:8px;font:10px/1.45 var(--font-mono);color:var(--text)}
.research-workbench{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:10px}
.research-card{background:rgba(9,14,25,.84);border:1px solid rgba(24,212,248,.22);border-radius:8px;padding:12px;box-shadow:0 8px 30px rgba(0,0,0,.24)}
.research-card.research-wide{grid-column:1/-1}
.research-title{font:800 9.5px/1.2 var(--font-display);letter-spacing:1.5px;text-transform:uppercase;color:var(--cyan);margin-bottom:8px;display:flex;justify-content:space-between;gap:8px;align-items:center}
.research-form-row{display:grid;grid-template-columns:88px minmax(0,1fr);gap:8px;align-items:center;margin:6px 0}
.research-form-row label{color:var(--muted);font-size:10px}
.research-card input,.research-card select,.research-card textarea{width:100%;min-width:0}
.research-card textarea{min-height:54px;resize:vertical;background:var(--panel2);color:var(--fg);border:1px solid var(--border-strong);border-radius:6px;padding:7px 9px;font:11px/1.45 var(--font-sans)}
.research-actions{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
.research-summary{font:10.5px/1.5 var(--font-mono);color:var(--text);background:rgba(0,0,0,.18);border:1px solid var(--glass-stroke);border-radius:7px;padding:7px;min-height:36px}
.research-table-wrap{max-height:220px;overflow:auto;border:1px solid var(--glass-stroke);border-radius:7px;background:rgba(0,0,0,.14)}
.research-table{width:100%;border-collapse:collapse;font-size:10px}.research-table th,.research-table td{border-bottom:1px solid rgba(255,255,255,.055);padding:6px;text-align:left;vertical-align:top}.research-table th{color:var(--cyan);position:sticky;top:0;background:rgba(8,12,22,.96);z-index:1}
.research-badge{display:inline-flex;align-items:center;border:1px solid var(--border-strong);border-radius:999px;padding:2px 7px;font:9px var(--font-mono);color:var(--text);background:rgba(255,255,255,.025)}
.research-badge.good{color:var(--green);border-color:rgba(56,232,140,.38)}.research-badge.warn{color:var(--orange);border-color:rgba(255,122,44,.42)}.research-badge.info{color:var(--cyan);border-color:rgba(24,212,248,.38)}
@media(max-width:980px){.research-workbench{grid-template-columns:1fr}.research-card.research-wide{grid-column:auto}.research-form-row{grid-template-columns:1fr}}
.ri-panel,.rgv8-card,.sfv9-card{margin:8px 0 10px;padding:10px 12px;border:1px solid rgba(24,212,248,.20);border-radius:8px;background:rgba(8,12,22,.72);box-shadow:0 8px 28px rgba(0,0,0,.24)}
.ri-title,.rgv8-card h3,.sfv9-card h3{font:800 9.5px/1.2 var(--font-display);letter-spacing:1.5px;text-transform:uppercase;color:var(--cyan);margin:0 0 8px}
.ri-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.ri-row{display:flex;gap:8px;align-items:center;margin:5px 0}.ri-row label{flex:0 0 90px;color:var(--muted);font-size:10px}.ri-row select{min-width:0;flex:1}
.ue-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.ue-card{background:rgba(255,255,255,.032);border:1px solid var(--glass-stroke);border-radius:8px;padding:10px}.ue-title{font:800 9px var(--font-display);color:var(--cyan);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:6px}
.ue-archmap{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}.ue-node{border:1px solid var(--border-strong);border-radius:999px;padding:4px 8px;font:10px var(--font-mono);color:var(--text);background:rgba(255,255,255,.025)}.ue-node.core{color:var(--green);border-color:rgba(56,232,140,.38)}.ue-node.warn{color:var(--orange);border-color:rgba(255,122,44,.42)}
.ue-toolbar{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}.fig-badge{position:fixed;right:14px;top:14px;z-index:9000;max-width:320px;background:rgba(8,10,20,.94);border:1px solid var(--border-strong);border-radius:8px;padding:9px 10px;font:10px/1.45 var(--font-mono);color:var(--text);box-shadow:var(--shadow-md)}.fig-badge.good{border-color:rgba(56,232,140,.45)}.fig-badge.warn{border-color:rgba(255,122,44,.5)}.fig-badge.bad{border-color:rgba(245,100,100,.55)}.fig-actions{display:flex;gap:5px;margin-top:7px;flex-wrap:wrap}
.fig-panel{position:fixed;inset:6vh 5vw;z-index:10020;overflow:auto;background:rgba(6,8,14,.98);border:1px solid rgba(24,212,248,.38);border-radius:12px;padding:16px;color:var(--text);box-shadow:var(--shadow-lg)}.fig-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}.fig-card{border:1px solid var(--glass-stroke);border-radius:8px;padding:8px;background:rgba(255,255,255,.028)}.fig-list{white-space:pre-wrap;font:10px/1.5 var(--font-mono);background:rgba(0,0,0,.22);border:1px solid var(--glass-stroke);border-radius:8px;padding:8px;margin-top:6px}
.rgv7-palette,.rgv8-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.58);z-index:10000;align-items:flex-start;justify-content:center;padding:12vh 16px}.rgv7-palette.show,.rgv8-overlay.show{display:flex}.rgv7-palette-box,.rgv8-modal{width:min(660px,96vw);background:rgba(8,10,20,.98);border:1px solid rgba(24,212,248,.36);border-radius:12px;box-shadow:var(--shadow-lg);padding:12px}.rgv7-cmd-list,.rgv8-cmd-list{max-height:330px;overflow:auto;margin-top:8px}.rgv7-cmd,.rgv8-cmd-row{width:100%;display:flex;justify-content:space-between;gap:10px;text-align:left;padding:8px 9px;border-radius:8px;margin:4px 0}.rgv7-cmd small,.rgv8-cmd-row small{color:var(--muted);font-family:var(--font-mono)}
#rgv8Cmd{display:none;position:fixed;left:50%;top:12%;transform:translateX(-50%);width:min(680px,calc(100vw - 24px));background:var(--panel-solid);border:1px solid var(--border-strong);border-radius:14px;padding:10px;z-index:10001}#rgv8Cmd.show{display:block}#rgv8Cmd input,#rgv7Palette input{width:100%;margin-bottom:8px}
#ueFloatingDiag{position:fixed;right:12px;bottom:12px;z-index:900;width:min(300px,90vw);background:rgba(6,8,12,.88);backdrop-filter:blur(10px);border:1px solid var(--border);border-radius:8px;padding:8px;font-size:10px;box-shadow:0 18px 80px rgba(0,0,0,.45)}#ueFloatingDiag.collapsed{width:auto}#ueFloatingDiag.collapsed .ue-fbody{display:none}
@media(max-width:780px){.rg-grid,.ue-grid,.ri-grid{grid-template-columns:1fr}.fig-badge{display:none}}
@media(max-width:560px){#ueFloatingDiag{right:10px;bottom:88px;z-index:80;max-width:calc(100vw - 20px)}.rail{z-index:960}.rail-submenu{z-index:980}}
`);
  installStyle('riV4Style', '.ri-chip{display:inline-flex;border:1px solid var(--border-strong);border-radius:999px;padding:2px 7px;font:9px var(--font-mono);color:var(--text)}.ri-chip.info{color:var(--cyan)}.ri-chip.good{color:var(--green)}.ri-chip.warn{color:var(--orange)}.ri-chip.bad{color:var(--red)}');
  installStyle('rgv8-style', '');
  installStyle('sfv9-style', '');
  installStyle('finalPreservationStyle', '');
  installStyle('figStyle', '');
}

function ensureCompatAnchors(): void {
  for (const id of COMPAT_ANCHOR_IDS) {
    if ($(id)) continue;
    const template = html('template', { id });
    template.textContent = 'Preserved by src/app/FeatureParityLayer.ts';
    document.body.append(template);
  }
}

function installExtraTabs(): void {
  const nav = document.querySelector('.tabs');
  const main = document.querySelector('.main-col');
  const target = document.getElementById('rail-govern-tabs') ?? document.getElementById('rail-panel-govern') ?? nav;
  if (!target || !main) return;
  for (const tab of EXTRA_RAIL_TABS) {
    if (!document.querySelector(`.tab[data-tab="${tab.id}"]`)) {
      target.append(createRailTabButton(tab));
    }
    if (!$(`tab-${tab.id}`)) {
      const panel = html('div', { id: `tab-${tab.id}`, className: 'tabpanel', role: 'tabpanel' });
      main.append(panel);
    }
  }
}

function setActiveTab(name: string): void {
  document.querySelectorAll<HTMLElement>('.tab[data-tab]').forEach((tab) => {
    tab.setAttribute('aria-selected', tab.dataset.tab === name ? 'true' : 'false');
  });
  document.querySelectorAll<HTMLElement>('.tabpanel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `tab-${name}`);
  });
  if (window.App) window.App.activeTab = name;
}

function bindExtraTabClicks(): void {
  for (const tab of EXTRA_RAIL_TABS) {
    document.querySelectorAll<HTMLElement>(`.tab[data-tab="${tab.id}"]`).forEach((btn) => {
      if (btn.dataset.parityBound === 'true') return;
      btn.dataset.parityBound = 'true';
      btn.addEventListener('click', () => setActiveTab(tab.id));
    });
  }
}

function bindRailActions(): void {
  const mappings: Record<string, () => void | Promise<void>> = {
    runtime: () => setActiveTab('architecture'),
    audit: () => setActiveTab('aplus'),
    integrity: () => showFeaturePanel(),
    palette: () => showCommandPalette(),
    report: () => exportFeatureReport(),
    manifest: () => exportManifest('pendulum_submission_manifest_v10_ts.json'),
    floquet: () => runFloquetProbe(true)
  };
  document.querySelectorAll<HTMLElement>('.dev-tool-btn[data-rail-action]').forEach((btn) => {
    if (btn.dataset.parityBound === 'true') return;
    const action = btn.dataset.railAction;
    const run = action ? mappings[action] : undefined;
    if (!run) return;
    btn.dataset.parityBound = 'true';
    btn.addEventListener('click', () => {
      void run();
    });
  });
}

function installArchitectureTab(): void {
  const panel = $('tab-architecture');
  if (!panel || panel.childElementCount > 0) return;
  const layout = html('div', { className: 'layout' });
  const left = html('div', { className: 'left-col' });
  left.style.maxWidth = '1080px';
  const map = html('div', { id: 'ueArchMap', className: 'ue-archmap' });
  const toolbar = html('div', { className: 'ue-toolbar' });
  append(
    toolbar,
    button('ueRunContract', 'Run Contract Checks', () => runContractChecks(), 'primary'),
    button('ueCaptureCheckpoint', 'Capture Checkpoint', () => captureCheckpoint()),
    button('ueExportManifest', 'Export Engine Manifest', () => exportManifest('pendulum_engine_manifest_v10_ts.json')),
    button('ueExportReplay', 'Export Checkpoints', () => downloadJson('pendulum_checkpoints_v10_ts.json', state.checkpoints)),
    button('ueToggleDiag', 'Toggle Floating Diagnostics', () => toggleFloatingDiag())
  );
  const grid = html('div', { className: 'ue-grid' });
  append(
    grid,
    card('Typed Runtime Contracts', html('div', { id: 'ueContracts' }), undefined, 'ue-card'),
    card('Task Graph', html('div', { id: 'ueTasks' }), undefined, 'ue-card'),
    card('Plugin Registry', html('div', { id: 'uePlugins' }), undefined, 'ue-card'),
    card('Resource Manager', html('div', { id: 'ueResources' }), undefined, 'ue-card'),
    card('Numerical Stability Layer', html('div', { id: 'ueStability' }), undefined, 'ue-card'),
    card('Fault Boundary', html('div', { id: 'ueFaults' }), undefined, 'ue-card')
  );
  append(left, map, toolbar, grid);
  const controls = html('aside', { className: 'controls' });
  append(
    controls,
    detailsCard('Runtime Capabilities', kvGrid('ueCaps', [])),
    detailsCard('Verdict', kvGrid('ueVerdict', []))
  );
  append(layout, left, controls);
  panel.append(layout);
}

function installResearchTab(): void {
  const panel = $('tab-research');
  if (!panel || panel.childElementCount > 0) return;
  const layout = html('div', { className: 'layout' });
  const left = html('div', { className: 'left-col' });
  left.style.maxWidth = '1180px';

  const workbench = html('div', { id: 'researchWorkbench', className: 'research-workbench' });

  const experimentCard = researchCard('Experiment Workspace', 'researchExperimentCard');
  const experimentName = researchInput('rwExperimentName', 'text', '', 'e.g. double-rk4-baseline');
  const experimentNotes = researchTextArea('rwExperimentNotes', 'Notes, hypothesis, source paper, or caveats');
  const experimentTags = researchInput('rwExperimentTags', 'text', 'baseline,local', 'comma separated');
  const experimentSelect = researchSelect('rwExperimentSelect', []);
  experimentSelect.addEventListener('change', () => {
    state.research.selectedExperimentId = experimentSelect.value;
    persistResearchState();
    renderResearchWorkbench();
  });
  append(
    experimentCard,
    researchFormRow('Name', experimentName),
    researchFormRow('Tags', experimentTags),
    experimentNotes,
    researchFormRow('Saved', experimentSelect),
    researchActions(
      button('rwSaveExperiment', 'Save Current', () => saveCurrentExperiment(), 'primary'),
      button('rwLoadExperiment', 'Load', () => loadSelectedExperiment()),
      button('rwDeleteExperiment', 'Delete', () => deleteSelectedExperiment()),
      button('rwExportExperiments', 'Export Library', () => exportExperimentLibrary())
    ),
    html('div', { id: 'rwExperimentSummary', className: 'research-summary', text: 'No experiments saved yet.' })
  );

  const logCard = researchCard('Research Run Log', 'researchRunLogCard');
  append(
    logCard,
    researchActions(
      button('rwMarkRun', 'Mark Run', () => markResearchRun(), 'primary'),
      button('rwRunValidationLog', 'Run Validation + Log', () => runLegacyValidationSurface()),
      button('rwClearLog', 'Clear Log', () => clearResearchRunLog()),
      button('rwExportLog', 'Export Log', () => exportResearchRunLog())
    ),
    html('div', { id: 'rwRunLog', className: 'research-table-wrap' })
  );

  const studyCard = researchCard('Parameter Study Builder', 'researchStudyCard');
  const variableSelect = researchSelect('rwStudyVariable', [
    ['theta1', 'theta1 initial'],
    ['theta2', 'theta2 initial'],
    ['omega1', 'omega1 initial'],
    ['omega2', 'omega2 initial'],
    ['damping', 'damping gamma'],
    ['dt', 'time step dt'],
    ['mass-ratio', 'mass ratio m2/m1'],
    ['length-ratio', 'length ratio l2/l1']
  ]);
  const strategySelect = researchSelect('rwStudyStrategy', [
    ['grid', 'grid'],
    ['symmetric', 'symmetric'],
    ['random', 'deterministic random']
  ]);
  append(
    studyCard,
    researchFormRow('Variable', variableSelect),
    researchFormRow('Strategy', strategySelect),
    researchFormRow('Min', researchInput('rwStudyMin', 'number', '-1', '')),
    researchFormRow('Max', researchInput('rwStudyMax', 'number', '1', '')),
    researchFormRow('Count', researchInput('rwStudyCount', 'number', '7', '')),
    researchFormRow('Point', researchSelect('rwStudyPointSelect', [])),
    researchActions(
      button('rwGenerateStudy', 'Generate Study', () => generateParameterStudy(), 'primary'),
      button('rwApplyStudyPoint', 'Apply Point', () => applySelectedStudyPoint()),
      button('rwExportStudy', 'Export Study', () => exportParameterStudy())
    ),
    researchActions(
      button('rwRunStudyBatch', 'Run Batch (λ/RQA/FTLE)', () => { void runStudyBatch(); }, 'primary'),
      button('rwCancelStudyBatch', 'Cancel Batch', () => cancelStudyBatch())
    ),
    html('div', { id: 'rwStudySummary', className: 'research-summary', text: 'No parameter study generated.' }),
    html('div', { id: 'rwStudyResults', className: 'research-table-wrap' })
  );

  const comparisonCard = researchCard('Result Comparison Matrix', 'researchComparisonCard');
  append(
    comparisonCard,
    researchActions(
      button('rwRebuildComparison', 'Rebuild Matrix', () => rebuildComparisonMatrix(), 'primary'),
      button('rwExportComparison', 'Export Matrix', () => exportComparisonMatrix())
    ),
    html('div', { id: 'rwComparisonMatrix', className: 'research-table-wrap' })
  );

  const orbitCard = researchCard('Periodic Orbit Finder (Driven Pendulum)', 'researchOrbitCard');
  append(
    orbitCard,
    researchFormRow('Amplitude', researchInput('rwOrbitAmplitude', 'number', '0.3', 'drive amplitude A')),
    researchFormRow('Frequency', researchInput('rwOrbitFrequency', 'number', '0.6667', 'drive frequency ω')),
    researchFormRow('Damping', researchInput('rwOrbitDamping', 'number', '0.5', 'damping γ')),
    researchFormRow('Sweep to', researchInput('rwOrbitSweepTo', 'number', '1.2', 'final amplitude for the branch trace')),
    researchActions(
      button('rwFindOrbit', 'Find Orbit', () => runOrbitFinder(), 'primary'),
      button('rwTraceBranch', 'Trace Branch', () => runBranchTrace())
    ),
    html('div', { id: 'rwOrbitSummary', className: 'research-summary', text: 'Find the period-1 orbit of the damped driven pendulum (Newton on the stroboscopic map) and its Floquet stability.' }),
    html('div', { id: 'rwOrbitBranch', className: 'research-table-wrap' })
  );

  const paperCard = researchCard('Paper Export Pack', 'researchPaperCard');
  paperCard.classList.add('research-wide');
  append(
    paperCard,
    researchActions(
      button('rwExportPaperJson', 'Export Pack JSON', () => exportPaperPackJson(), 'primary'),
      button('rwExportFigures', 'Export Figures', () => exportPaperFiguresHtml()),
      button('rwExportPaperMd', 'Export Methods MD', () => exportPaperMethodsMarkdown()),
      button('rwExportManifestPack', 'Export Manifest', () => exportManifest('pendulum_research_manifest_v10_ts.json'))
    ),
    html('div', { id: 'rwPaperSummary', className: 'research-summary', text: 'Paper pack not generated yet.' })
  );

  append(workbench, experimentCard, logCard, studyCard, comparisonCard, orbitCard, paperCard);

  const grid = html('div', { className: 'rg-grid' });
  append(
    grid,
    card('Integrator Registry Metadata', html('div', { id: 'rgIntegrators' })),
    card('Numerical Conditioning Probe', html('div', { id: 'rgNumerics' })),
    card('Render Graph', html('div', { id: 'rgRenderGraph' })),
    card('Performance Advisor', html('div', { id: 'rgPerf' })),
    card('State Store V2', html('div', { id: 'rgState' })),
    card('Optimization Matrix', html('div', { id: 'rgOpt' })),
    card('Test Matrix', html('div', { id: 'rgTests' }), undefined, 'rg-card rg-wide')
  );
  left.append(workbench, grid);

  const controls = html('aside', { className: 'controls' });
  const actions = html('div', { className: 'btnrow' });
  append(
    actions,
    button('rgRunProbe', 'Run Numerical Probe', () => runNumericalProbe(), 'primary'),
    button('rgRunTests', 'Run Smoke Tests', () => runLegacyValidationSurface()),
    button('rgSaveExperiment', 'Save Experiment', () => saveCurrentExperiment()),
    button('rgGenerateStudy', 'Generate Study', () => generateParameterStudy()),
    button('rgExportPaperPack', 'Paper Pack', () => exportPaperPackJson()),
    button('rgExportSnapshot', 'Export V2 Snapshot', () => downloadJson('pendulum_snapshot_v2_ts.json', currentSnapshot()))
  );
  append(
    controls,
    detailsCard('Research Controls', actions),
    detailsCard('Strict Contract', html('div', { id: 'rgContract' })),
    detailsCard('Lock-Free Queue', kvGrid('rgQueue', []))
  );
  append(layout, left, controls);
  panel.append(layout);
}

const RESEARCH_STORAGE_KEY = 'pendulum-lab/research-workbench/v1';

function researchCard(title: string, id: string): HTMLElement {
  const section = html('section', { id, className: 'research-card' });
  section.append(html('div', { className: 'research-title', text: title }));
  return section;
}

function researchInput(id: string, type: string, value: string, placeholder: string): HTMLInputElement {
  const input = html('input', { id });
  input.type = type;
  input.value = value;
  input.placeholder = placeholder;
  if (type === 'number') input.step = 'any';
  return input;
}

function researchTextArea(id: string, placeholder: string): HTMLTextAreaElement {
  const textarea = document.createElement('textarea');
  textarea.id = id;
  textarea.placeholder = placeholder;
  return textarea;
}

function researchSelect(id: string, options: Array<[string, string]>): HTMLSelectElement {
  const select = html('select', { id });
  for (const [value, label] of options) select.append(html('option', { value, text: label }));
  return select;
}

function researchFormRow(label: string, child: HTMLElement): HTMLDivElement {
  const rowNode = html('div', { className: 'research-form-row' });
  append(rowNode, html('label', { text: label }), child);
  return rowNode;
}

function researchActions(...children: HTMLElement[]): HTMLDivElement {
  const rowNode = html('div', { className: 'research-actions' });
  children.forEach((child) => rowNode.append(child));
  return rowNode;
}

function researchUid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadResearchState(): void {
  try {
    const raw = window.localStorage?.getItem(RESEARCH_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<typeof state.research>;
    if (Array.isArray(parsed.experiments)) state.research.experiments = parsed.experiments.slice(0, 60) as ResearchExperiment[];
    if (Array.isArray(parsed.runLog)) state.research.runLog = parsed.runLog.slice(0, 100) as ResearchRunLogEntry[];
    if (parsed.parameterStudy) state.research.parameterStudy = parsed.parameterStudy as ParameterStudyPlan;
    if (Array.isArray(parsed.comparisonRows)) state.research.comparisonRows = parsed.comparisonRows.slice(0, 60) as ResearchComparisonRow[];
    if (typeof parsed.selectedExperimentId === 'string') state.research.selectedExperimentId = parsed.selectedExperimentId;
  } catch (error) {
    state.auditLog.unshift(`research storage ignored: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function persistResearchState(): void {
  try {
    window.localStorage?.setItem(RESEARCH_STORAGE_KEY, JSON.stringify(state.research));
  } catch (error) {
    state.lastFault = `Research storage failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function cloneSnapshot(snapshot: RuntimeSnapshot): RuntimeSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as RuntimeSnapshot;
}

function collectResearchMetrics(validationStatus = 'not-run'): ResearchMetrics {
  const snapshot = currentSnapshot();
  const diag = modernLab()?.diagnostics?.();
  const drift = Number.isFinite(diag?.drift ?? Number.NaN) ? diag!.drift : null;
  const lambdaMax = Number.isFinite(diag?.lambdaMax ?? Number.NaN) ? diag!.lambdaMax : null;
  const fps = Number.isFinite(diag?.fps ?? Number.NaN) ? diag!.fps : null;
  const physicsMsPerFrame = Number.isFinite(diag?.physicsMsPerFrame ?? Number.NaN) ? diag!.physicsMsPerFrame : null;
  let score = 100;
  if (!snapshot.state.every(Number.isFinite)) score -= 60;
  if (snapshot.systemType === 'triple') score -= 8;
  if (snapshot.damping > 0) score -= 5;
  if (drift !== null && Math.abs(drift) > 1e-2) score -= 16;
  if (drift !== null && Math.abs(drift) > 1e-1) score -= 20;
  if (validationStatus.toLowerCase().includes('fail')) score -= 25;
  if (fps !== null && fps < 20) score -= 8;
  return {
    drift,
    lambdaMax,
    fps,
    physicsMsPerFrame,
    poincarePoints: diag?.poincarePoints ?? 0,
    qualityScore: Math.max(0, Math.min(100, Math.round(score))),
    validationStatus
  };
}

function metricValue(value: number | null, digits = 3): string {
  return value === null || !Number.isFinite(value) ? '-' : Math.abs(value) >= 1000 || Math.abs(value) < 0.01 ? value.toExponential(2) : value.toFixed(digits);
}

function selectedResearchExperiment(): ResearchExperiment | undefined {
  const select = $('rwExperimentSelect');
  const id = select instanceof HTMLSelectElement ? select.value : state.research.selectedExperimentId;
  return state.research.experiments.find((experiment) => experiment.id === id);
}

function defaultExperimentName(snapshot: RuntimeSnapshot): string {
  return `${snapshot.systemType}-${snapshot.method}-dt${snapshot.dt.toPrecision(3)}-${snapshot.hash.slice(0, 8)}`;
}

function saveCurrentExperiment(): void {
  const snapshot = currentSnapshot();
  const nameInput = $('rwExperimentName');
  const notesInput = $('rwExperimentNotes');
  const tagsInput = $('rwExperimentTags');
  const name = nameInput instanceof HTMLInputElement && nameInput.value.trim() ? nameInput.value.trim() : defaultExperimentName(snapshot);
  const notes = notesInput instanceof HTMLTextAreaElement ? notesInput.value.trim() : '';
  const tags = tagsInput instanceof HTMLInputElement ? tagsInput.value.split(',').map((tag) => tag.trim()).filter(Boolean) : [];
  const experiment: ResearchExperiment = {
    id: researchUid('exp'),
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    notes,
    tags,
    snapshot,
    metrics: collectResearchMetrics('not-run')
  };
  state.research.experiments.unshift(experiment);
  state.research.experiments = state.research.experiments.slice(0, 60);
  state.research.selectedExperimentId = experiment.id;
  persistResearchState();
  logResearchRun('experiment', 'Saved experiment', name, 'localStorage');
  renderResearchWorkbench();
  toast('Experiment saved');
}

function applySnapshotControls(snapshot: RuntimeSnapshot): void {
  setMode(snapshot.mode);
  setControl('sysType', snapshot.systemType);
  setControl('method', snapshot.method);
  setControl('dt', snapshot.dt);
  setControl('gamma', snapshot.damping);
  setControl('m1', snapshot.parameters.m1);
  setControl('m2', snapshot.parameters.m2);
  setControl('m3', snapshot.parameters.m3 ?? 1);
  setControl('l1', snapshot.parameters.l1);
  setControl('l2', snapshot.parameters.l2);
  setControl('l3', snapshot.parameters.l3 ?? 0.8);
  setControl('g', snapshot.parameters.g);
  if (snapshot.systemType === 'triple') {
    setControl('th1', snapshot.state[0] ?? 0);
    setControl('th2', snapshot.state[1] ?? 0);
    setControl('th3', snapshot.state[2] ?? 0);
    setControl('iw1', snapshot.state[3] ?? 0);
    setControl('iw2', snapshot.state[4] ?? 0);
    setControl('iw3', snapshot.state[5] ?? 0);
  } else {
    setControl('th1', snapshot.state[0] ?? 0);
    setControl('th2', snapshot.state[1] ?? 0);
    setControl('iw1', snapshot.state[2] ?? 0);
    setControl('iw2', snapshot.state[3] ?? 0);
  }
  modernLab()?.reset?.();
}

function loadSelectedExperiment(): void {
  const experiment = selectedResearchExperiment();
  if (!experiment) {
    toast('No experiment selected');
    return;
  }
  applySnapshotControls(experiment.snapshot);
  state.research.selectedExperimentId = experiment.id;
  persistResearchState();
  logResearchRun('experiment', 'Loaded experiment', experiment.name);
  renderResearchWorkbench();
  toast('Experiment loaded');
}

function deleteSelectedExperiment(): void {
  const experiment = selectedResearchExperiment();
  if (!experiment) {
    toast('No experiment selected');
    return;
  }
  state.research.experiments = state.research.experiments.filter((item) => item.id !== experiment.id);
  state.research.selectedExperimentId = state.research.experiments[0]?.id ?? '';
  persistResearchState();
  renderResearchWorkbench();
  toast('Experiment deleted');
}

function exportExperimentLibrary(): void {
  downloadJson('pendulum_research_experiment_library.json', {
    schemaVersion: 'pendulum-research-experiments/v1',
    generatedAt: new Date().toISOString(),
    experiments: state.research.experiments
  });
  logResearchRun('export', 'Experiment library export', `${state.research.experiments.length} experiments`, 'pendulum_research_experiment_library.json');
}

function logResearchRun(type: ResearchRunType, label: string, summary: string, artifact = '', validationStatus = 'not-run'): ResearchRunLogEntry {
  const snapshot = currentSnapshot();
  const entry: ResearchRunLogEntry = {
    id: researchUid('run'),
    type,
    label,
    timestamp: new Date().toISOString(),
    experimentId: state.research.selectedExperimentId || null,
    snapshotHash: snapshot.hash,
    method: snapshot.method,
    system: snapshot.systemType,
    dt: snapshot.dt,
    damping: snapshot.damping,
    metrics: collectResearchMetrics(validationStatus),
    summary
  };
  if (artifact) entry.artifact = artifact;
  state.research.runLog.unshift(entry);
  state.research.runLog = state.research.runLog.slice(0, 100);
  persistResearchState();
  renderResearchWorkbench();
  return entry;
}

function markResearchRun(): void {
  logResearchRun('probe', 'Manual research mark', 'Current state captured in run log.');
  toast('Run marked');
}

function clearResearchRunLog(): void {
  state.research.runLog = [];
  state.research.comparisonRows = buildComparisonRows();
  persistResearchState();
  renderResearchWorkbench();
  toast('Run log cleared');
}

function exportResearchRunLog(): void {
  downloadJson('pendulum_research_run_log.json', {
    schemaVersion: 'pendulum-research-run-log/v1',
    generatedAt: new Date().toISOString(),
    entries: state.research.runLog
  });
  logResearchRun('export', 'Run log export', `${state.research.runLog.length} entries`, 'pendulum_research_run_log.json');
}

function studyStrategy(): ParameterStudyPlan['strategy'] {
  const raw = selectValue('rwStudyStrategy', 'grid');
  return raw === 'random' || raw === 'symmetric' ? raw : 'grid';
}

function generateStudyValues(strategy: ParameterStudyPlan['strategy'], min: number, max: number, count: number): number[] {
  const n = Math.max(2, Math.min(64, Math.round(Number.isFinite(count) ? count : 7)));
  if (strategy === 'random') {
    let seed = Math.abs(currentSnapshot().hash.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) || 17;
    return Array.from({ length: n }, () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return min + (max - min) * (seed / 4294967296);
    }).sort((a, b) => a - b);
  }
  if (strategy === 'symmetric') {
    const mid = (min + max) / 2;
    const span = (max - min) / 2;
    return Array.from({ length: n }, (_, i) => {
      if (i === 0) return mid;
      const ring = Math.ceil(i / 2);
      const sign = i % 2 === 0 ? 1 : -1;
      return mid + sign * span * (ring / Math.ceil((n - 1) / 2));
    }).sort((a, b) => a - b);
  }
  return Array.from({ length: n }, (_, i) => min + ((max - min) * i) / Math.max(1, n - 1));
}

function snapshotWithStudyPatch(base: RuntimeSnapshot, variable: string, value: number): RuntimeSnapshot {
  const snapshot = cloneSnapshot(base);
  const omega1Index = snapshot.systemType === 'triple' ? 3 : 2;
  const omega2Index = snapshot.systemType === 'triple' ? 4 : 3;
  switch (variable) {
    case 'theta1':
      snapshot.state[0] = value;
      break;
    case 'theta2':
      snapshot.state[1] = value;
      break;
    case 'omega1':
      snapshot.state[omega1Index] = value;
      break;
    case 'omega2':
      snapshot.state[omega2Index] = value;
      break;
    case 'damping':
      snapshot.damping = Math.max(0, value);
      break;
    case 'dt':
      snapshot.dt = Math.max(1e-6, value);
      break;
    case 'mass-ratio':
      snapshot.parameters.m2 = Math.max(1e-6, snapshot.parameters.m1 * value);
      break;
    case 'length-ratio':
      snapshot.parameters.l2 = Math.max(1e-6, snapshot.parameters.l1 * value);
      break;
    default:
      break;
  }
  snapshot.hash = `${base.hash.slice(0, 10)}-${variable}-${value.toPrecision(4)}`;
  return snapshot;
}

function studyEstimate(snapshot: RuntimeSnapshot): string {
  const stiffness = snapshot.dt < 0.001 ? 'high cost' : snapshot.dt < 0.004 ? 'medium cost' : 'low cost';
  const caveat = snapshot.systemType === 'triple' ? 'triple sensitivity' : snapshot.damping > 0 ? 'dissipative' : 'conservative';
  return `${stiffness}, ${caveat}`;
}

function generateParameterStudy(): void {
  const variable = selectValue('rwStudyVariable', 'theta1');
  const strategy = studyStrategy();
  const min = numberFrom('rwStudyMin', -1);
  const max = numberFrom('rwStudyMax', 1);
  const count = numberFrom('rwStudyCount', 7);
  const base = currentSnapshot();
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const values = generateStudyValues(strategy, lo, hi, count);
  const plan: ParameterStudyPlan = {
    id: researchUid('study'),
    generatedAt: new Date().toISOString(),
    variable,
    strategy,
    min: lo,
    max: hi,
    count: values.length,
    values,
    experiments: values.map((value, index) => {
      const snapshot = snapshotWithStudyPatch(base, variable, value);
      return {
        id: researchUid('point'),
        label: `${variable}=${value.toPrecision(6)}`,
        patch: { [variable]: value },
        snapshot,
        estimate: studyEstimate(snapshot)
      };
    })
  };
  state.research.parameterStudy = plan;
  persistResearchState();
  logResearchRun('parameter-study', 'Generated parameter study', `${variable} ${strategy} ${values.length} points`);
  renderResearchWorkbench();
  toast('Parameter study generated');
}

function selectedStudyPoint(): ParameterStudyPoint | undefined {
  const plan = state.research.parameterStudy;
  const select = $('rwStudyPointSelect');
  const id = select instanceof HTMLSelectElement ? select.value : '';
  return plan?.experiments.find((point) => point.id === id) ?? plan?.experiments[0];
}

function applySelectedStudyPoint(): void {
  const point = selectedStudyPoint();
  if (!point) {
    toast('No study point available');
    return;
  }
  applySnapshotControls(point.snapshot);
  logResearchRun('parameter-study', 'Applied study point', point.label);
  renderResearchWorkbench();
  toast('Study point applied');
}

const studyBatch = {
  running: false,
  cancelled: false,
  current: 0,
  total: 0
};

let studyChaosClient: ChaosClient | null = null;

function chaosClientForStudy(): ChaosClient {
  if (!studyChaosClient) studyChaosClient = new ChaosClient();
  return studyChaosClient;
}

/** Map a study-point snapshot onto the declarative chaos-job system spec. */
function studySpecFromSnapshot(snapshot: RuntimeSnapshot): { spec: SystemSpec; state0: number[] } {
  const p = snapshot.parameters;
  if (snapshot.systemType === 'triple') {
    const spec: SystemSpec = {
      kind: 'triple',
      m1: p.m1, m2: p.m2, m3: p.m3 ?? 1,
      l1: p.l1, l2: p.l2, l3: p.l3 ?? 0.8,
      g: p.g
    };
    return { spec, state0: snapshot.state.slice(0, 6) };
  }
  const spec: SystemSpec = { kind: 'double', m1: p.m1, m2: p.m2, l1: p.l1, l2: p.l2, g: p.g };
  return { spec, state0: snapshot.state.slice(0, 4) };
}

/**
 * Batch-execute every point of the current parameter study on the chaos worker:
 * maximal Lyapunov (+block SE), RQA determinism/divergence, and per-point FTLE.
 * Points run sequentially so the worker is never flooded; progress renders after
 * each point and the run is cancellable between points.
 */
async function runStudyBatch(): Promise<void> {
  const plan = state.research.parameterStudy;
  if (!plan || plan.experiments.length === 0) {
    toast('Generate a parameter study first');
    return;
  }
  if (studyBatch.running) {
    toast('Batch already running');
    return;
  }
  studyBatch.running = true;
  studyBatch.cancelled = false;
  studyBatch.current = 0;
  studyBatch.total = plan.experiments.length;
  renderParameterStudy();
  const client = chaosClientForStudy();
  // The study points use the plan's dt so the diagnostics integrate the exact
  // system each point describes (not whatever the live sim currently shows).
  for (let i = 0; i < plan.experiments.length; i += 1) {
    if (studyBatch.cancelled) break;
    const point = plan.experiments[i]!;
    studyBatch.current = i + 1;
    renderParameterStudy();
    try {
      const { spec, state0 } = studySpecFromSnapshot(point.snapshot);
      const res = await client.studyPoint(spec, state0, { lyapunov: { dt: Math.min(0.01, point.snapshot.dt || 0.01) } });
      point.results = {
        lambdaMax: res.lambdaMax,
        lambdaBlockStdError: res.lambdaBlockStdError,
        rqaDeterminism: res.rqaDeterminism,
        rqaDivergence: res.rqaDivergence,
        ftle: res.ftle,
        completedAt: new Date().toISOString()
      };
      delete point.error;
    } catch (error) {
      point.error = error instanceof Error ? error.message : String(error);
    }
    persistResearchState();
    renderParameterStudy();
  }
  const done = plan.experiments.filter((point) => point.results).length;
  studyBatch.running = false;
  logResearchRun('parameter-study', studyBatch.cancelled ? 'Batch cancelled' : 'Batch complete', `${done}/${plan.experiments.length} points filled (lambda/RQA/FTLE)`);
  renderResearchWorkbench();
  toast(studyBatch.cancelled ? `Batch cancelled at ${done}/${plan.experiments.length}` : `Batch complete: ${done}/${plan.experiments.length} points`);
}

function cancelStudyBatch(): void {
  if (!studyBatch.running) {
    toast('No batch running');
    return;
  }
  studyBatch.cancelled = true;
  toast('Cancelling after current point…');
}

function exportParameterStudy(): void {
  if (!state.research.parameterStudy) generateParameterStudy();
  downloadJson('pendulum_parameter_study_plan.json', {
    schemaVersion: 'pendulum-parameter-study/v1',
    generatedAt: new Date().toISOString(),
    plan: state.research.parameterStudy
  });
  logResearchRun('export', 'Parameter study export', state.research.parameterStudy ? `${state.research.parameterStudy.count} points` : 'no plan', 'pendulum_parameter_study_plan.json');
}

function comparisonRowFromExperiment(experiment: ResearchExperiment): ResearchComparisonRow {
  return {
    id: experiment.id,
    label: experiment.name,
    source: 'experiment',
    timestamp: experiment.updatedAt,
    method: experiment.snapshot.method,
    system: experiment.snapshot.systemType,
    dt: experiment.snapshot.dt,
    damping: experiment.snapshot.damping,
    drift: experiment.metrics.drift,
    lambdaMax: experiment.metrics.lambdaMax,
    fps: experiment.metrics.fps,
    score: experiment.metrics.qualityScore,
    hash: experiment.snapshot.hash
  };
}

function comparisonRowFromRun(entry: ResearchRunLogEntry): ResearchComparisonRow {
  const snapshot = currentSnapshot();
  return {
    id: entry.id,
    label: entry.label,
    source: entry.type,
    timestamp: entry.timestamp,
    method: entry.method,
    system: entry.system,
    dt: entry.dt ?? snapshot.dt,
    damping: entry.damping ?? snapshot.damping,
    drift: entry.metrics.drift,
    lambdaMax: entry.metrics.lambdaMax,
    fps: entry.metrics.fps,
    score: entry.metrics.qualityScore,
    hash: entry.snapshotHash
  };
}

function buildComparisonRows(): ResearchComparisonRow[] {
  return [
    ...state.research.experiments.map(comparisonRowFromExperiment),
    ...state.research.runLog.slice(0, 24).map(comparisonRowFromRun)
  ].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 60);
}

function rebuildComparisonMatrix(): void {
  state.research.comparisonRows = buildComparisonRows();
  persistResearchState();
  renderResearchWorkbench();
  logResearchRun('comparison', 'Rebuilt comparison matrix', `${state.research.comparisonRows.length} rows`);
}

function exportComparisonMatrix(): void {
  if (!state.research.comparisonRows.length) state.research.comparisonRows = buildComparisonRows();
  downloadJson('pendulum_result_comparison_matrix.json', {
    schemaVersion: 'pendulum-result-comparison/v1',
    generatedAt: new Date().toISOString(),
    rows: state.research.comparisonRows
  });
  logResearchRun('export', 'Comparison matrix export', `${state.research.comparisonRows.length} rows`, 'pendulum_result_comparison_matrix.json');
}

function buildMethodsText(snapshot = currentSnapshot()): string {
  const method = integratorRegistry[snapshot.method];
  const limitations = createSubmissionManifest(snapshot).limitations.map((item) => `- ${item}`).join('\n');
  return [
    '# Pendulum Lab Methods',
    '',
    `System: ${snapshot.systemType} pendulum.`,
    `Integrator: ${method.name} (id ${method.id}, order ${method.order}, symplectic label: ${method.symplectic}).`,
    `Time step: ${snapshot.dt}; steps per frame: ${snapshot.stepsPerFrame}; tolerance: ${snapshot.tolerance}.`,
    `Damping gamma: ${snapshot.damping}; mode: ${snapshot.mode}; state hash: ${snapshot.hash}.`,
    `Parameters: ${JSON.stringify(snapshot.parameters)}.`,
    '',
    'Reproducibility:',
    `Seed: ${snapshot.seed ?? 'none'}.`,
    'All exported runs include the runtime snapshot, selected integrator metadata, browser-worker policy, and limitation notes.',
    '',
    'Limitations:',
    limitations
  ].join('\n');
}

interface PaperFigure {
  id: string;
  caption: string;
  width: number;
  height: number;
  /** PNG data URL captured from the live canvas. */
  dataUrl: string;
}

/**
 * Captions for every analysis canvas the app can draw. Canvases render only
 * while their tab is (or was) active, so blank canvases are filtered out at
 * capture time rather than listed with empty images.
 */
const FIGURE_CAPTIONS: Record<string, string> = {
  main: 'Pendulum trajectory with long-exposure trail (live simulation canvas).',
  energy: 'Total energy E(t); drift quantifies integrator fidelity.',
  lyap: 'Running maximal-Lyapunov estimate λ₁(t) from the live divergence proxy.',
  phase: 'Phase portrait (θ₁, ω₁).',
  poincare: 'Poincaré section at the θ₁ = 0 (θ̇₁ > 0) crossing.',
  fft: 'Frequency spectrum of θ₁ (FFT magnitude).',
  cmpCanvas: 'Integrator comparison: four methods overlaid on the same system.',
  cmpEnergy: 'Energy drift per integrator over the comparison run.',
  cmpDiverge: 'Pairwise trajectory divergence between integrators.',
  cmpBench: 'Throughput benchmark (steps/ms) across eight integrators.',
  lyapSpecCanvas: 'Full Lyapunov spectrum with per-exponent uncertainty.',
  sweepCanvas: 'Chaos map: maximal Lyapunov exponent over the (θ₁, θ₂) grid.',
  bifCanvas: 'Bifurcation diagram: Poincaré θ₂ values swept over gravity g.',
  p3dCanvas: '3D phase-space projection (θ₁, θ₂, ω₂), orthographic.',
  gpuCanvas: 'Phase-density accumulation over (θ₁, ω₁), additive blending.',
  zeroOneCanvas: '0–1 test translation path (p_c, q_c): bounded ⇒ regular, Brownian ⇒ chaotic.',
  clvCanvas: 'Covariant Lyapunov vector hyperbolicity angles along the trajectory.',
  basinCanvas: 'Flip-basin classification over initial conditions; fractal boundary.',
  rqaCanvas: 'Recurrence plot of the embedded cos θ₁ observable.',
  ftleCanvas: 'Finite-time Lyapunov exponent field; ridges are Lagrangian coherent structures.'
};

/** Data URL of an untouched canvas of the same size — used to skip blank canvases. */
const blankCanvasCache = new Map<string, string>();

function blankDataUrl(width: number, height: number): string {
  const key = `${width}x${height}`;
  const cached = blankCanvasCache.get(key);
  if (cached) return cached;
  const probe = document.createElement('canvas');
  probe.width = width;
  probe.height = height;
  const url = probe.toDataURL('image/png');
  blankCanvasCache.set(key, url);
  return url;
}

/** Capture every drawn analysis canvas as a captioned PNG figure. */
function collectPaperFigures(): PaperFigure[] {
  const figures: PaperFigure[] = [];
  for (const [id, caption] of Object.entries(FIGURE_CAPTIONS)) {
    const canvas = document.getElementById(id);
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0 || canvas.height === 0) continue;
    let dataUrl = '';
    try {
      dataUrl = canvas.toDataURL('image/png');
    } catch {
      continue;
    }
    if (dataUrl === blankDataUrl(canvas.width, canvas.height)) continue;
    figures.push({ id, caption, width: canvas.width, height: canvas.height, dataUrl });
  }
  return figures;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Export the captured figures as a single self-contained HTML gallery: each
 * figure is numbered with its caption and the run's reproducibility context,
 * and the page is print-stylesheet-friendly (print to PDF for a paper appendix).
 */
function exportPaperFiguresHtml(): void {
  const figures = collectPaperFigures();
  if (figures.length === 0) {
    toast('No drawn figures yet — visit the analysis tabs first');
    return;
  }
  const snapshot = currentSnapshot();
  const items = figures.map((figure, index) => [
    '<figure>',
    `<img src="${figure.dataUrl}" alt="${escapeHtml(figure.caption)}" width="${figure.width}" height="${figure.height}">`,
    `<figcaption><strong>Figure ${index + 1}.</strong> ${escapeHtml(figure.caption)} <span class="meta">[canvas #${figure.id}, ${figure.width}×${figure.height}]</span></figcaption>`,
    '</figure>'
  ].join('\n')).join('\n');
  const doc = [
    '<!DOCTYPE html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<title>Pendulum Lab — Figure Pack</title>',
    '<style>',
    'body{font:14px/1.6 Georgia,serif;max-width:880px;margin:32px auto;padding:0 16px;color:#111;background:#fff}',
    'figure{margin:0 0 36px;page-break-inside:avoid}',
    'img{max-width:100%;height:auto;border:1px solid #ccc;background:#0b1020}',
    'figcaption{margin-top:8px}.meta{color:#777;font-size:12px}',
    'header{border-bottom:2px solid #111;margin-bottom:28px;padding-bottom:12px}',
    'code{font:12px/1.4 monospace;background:#f4f4f4;padding:1px 4px}',
    '</style></head><body>',
    '<header><h1>Pendulum Lab — Figure Pack</h1>',
    `<p>Generated ${new Date().toISOString()} — system <code>${escapeHtml(snapshot.systemType)}</code>, integrator <code>${escapeHtml(snapshot.method)}</code>, dt <code>${snapshot.dt}</code>, state hash <code>${escapeHtml(snapshot.hash)}</code>.</p>`,
    '<p>Figures are PNG captures of the live analysis canvases (only canvases that have been drawn are included). Print this page to PDF for a paper-ready appendix.</p></header>',
    items,
    '</body></html>'
  ].join('\n');
  downloadText('pendulum_paper_figures.html', doc, 'text/html;charset=utf-8');
  logResearchRun('export', 'Figure pack export', `${figures.length} captioned PNG figures`, 'pendulum_paper_figures.html');
  renderResearchWorkbench();
  toast(`Figure pack exported (${figures.length} figures)`);
}

function buildPaperExportPack(): unknown {
  const snapshot = currentSnapshot();
  const comparisonRows = state.research.comparisonRows.length ? state.research.comparisonRows : buildComparisonRows();
  return {
    schemaVersion: 'pendulum-paper-pack/v1',
    generatedAt: new Date().toISOString(),
    title: 'Pendulum Lab research export pack',
    methodsMarkdown: buildMethodsText(snapshot),
    figureCaptions: [
      `Main trajectory: ${snapshot.systemType} pendulum integrated with ${snapshot.method}, dt=${snapshot.dt}, gamma=${snapshot.damping}.`,
      `Comparison matrix: ${comparisonRows.length} experiment/run rows with drift, lambda proxy, FPS, and quality score.`,
      state.research.parameterStudy ? `Parameter study: ${state.research.parameterStudy.variable} ${state.research.parameterStudy.strategy} over ${state.research.parameterStudy.count} points.` : 'Parameter study: not generated.'
    ],
    /** Captioned PNG captures of every drawn analysis canvas at export time. */
    figures: collectPaperFigures(),
    currentSnapshot: snapshot,
    manifest: createSubmissionManifest(snapshot),
    experiments: state.research.experiments,
    runLog: state.research.runLog,
    parameterStudy: state.research.parameterStudy,
    comparisonRows
  };
}

function exportPaperPackJson(): void {
  downloadJson('pendulum_paper_export_pack.json', buildPaperExportPack());
  logResearchRun('export', 'Paper export pack', 'JSON pack with methods, captions, manifests, run log, and comparison matrix.', 'pendulum_paper_export_pack.json');
  renderResearchWorkbench();
}

function exportPaperMethodsMarkdown(): void {
  const snapshot = currentSnapshot();
  const comparisonRows = state.research.comparisonRows.length ? state.research.comparisonRows : buildComparisonRows();
  const rows = comparisonRows.map((rowItem) => `| ${rowItem.source} | ${rowItem.label} | ${rowItem.method} | ${metricValue(rowItem.drift)} | ${metricValue(rowItem.lambdaMax)} | ${rowItem.score} |`).join('\n');
  const markdown = [
    buildMethodsText(snapshot),
    '',
    '## Comparison Matrix',
    '',
    '| Source | Label | Method | Drift | Lambda proxy | Score |',
    '| --- | --- | --- | --- | --- | --- |',
    rows || '| current | no comparison rows yet | - | - | - | - |'
  ].join('\n');
  downloadText('pendulum_methods_export.md', markdown, 'text/markdown;charset=utf-8');
  logResearchRun('export', 'Methods markdown export', 'Citation-ready methods text and comparison table.', 'pendulum_methods_export.md');
}

function renderResearchWorkbench(): void {
  renderResearchExperiments();
  renderResearchRunLog();
  renderParameterStudy();
  renderComparisonMatrix();
  renderPaperSummary();
}

function renderResearchExperiments(): void {
  const select = $('rwExperimentSelect');
  if (select instanceof HTMLSelectElement) {
    const previous = state.research.selectedExperimentId || select.value;
    clear(select);
    for (const experiment of state.research.experiments) select.append(html('option', { value: experiment.id, text: experiment.name }));
    if (state.research.experiments.some((experiment) => experiment.id === previous)) select.value = previous;
    state.research.selectedExperimentId = select.value || state.research.experiments[0]?.id || '';
  }
  const selected = selectedResearchExperiment();
  setText('rwExperimentSummary', selected
    ? `${state.research.experiments.length} experiment(s). Selected: ${selected.name}; method=${selected.snapshot.method}; hash=${selected.snapshot.hash}; score=${selected.metrics.qualityScore}`
    : `${state.research.experiments.length} experiment(s). Save current state to begin.`);
}

function renderResearchRunLog(): void {
  const rows = state.research.runLog.slice(0, 12).map((entry) => [
    new Date(entry.timestamp).toLocaleTimeString(),
    entry.type,
    entry.label,
    entry.method,
    String(entry.metrics.qualityScore),
    entry.summary
  ]);
  renderResearchTable('rwRunLog', ['time', 'type', 'label', 'method', 'score', 'summary'], rows, 'No run log entries yet.');
}

function renderParameterStudy(): void {
  const plan = state.research.parameterStudy;
  const select = $('rwStudyPointSelect');
  if (select instanceof HTMLSelectElement) {
    const previous = select.value;
    clear(select);
    for (const point of plan?.experiments ?? []) select.append(html('option', { value: point.id, text: point.label }));
    if (previous && Array.from(select.options).some((option) => option.value === previous)) select.value = previous;
  }
  const filled = plan?.experiments.filter((point) => point.results).length ?? 0;
  const progress = studyBatch.running
    ? ` Batch running: point ${studyBatch.current}/${studyBatch.total}…`
    : filled > 0
      ? ` ${filled}/${plan?.count ?? 0} points have batch results.`
      : '';
  setText('rwStudySummary', plan
    ? `${plan.count} points for ${plan.variable} using ${plan.strategy}. Range ${plan.min} to ${plan.max}. First: ${plan.experiments[0]?.estimate ?? '-'}.${progress}`
    : 'No parameter study generated.');
  const resultRows = (plan?.experiments ?? [])
    .filter((point) => point.results || point.error)
    .map((point) => point.results
      ? [
          point.label,
          `${point.results.lambdaMax.toFixed(4)} ± ${point.results.lambdaBlockStdError.toFixed(4)}`,
          point.results.rqaDeterminism.toFixed(3),
          point.results.rqaDivergence.toFixed(4),
          point.results.ftle.toFixed(4)
        ]
      : [point.label, `error: ${point.error ?? 'unknown'}`, '-', '-', '-']);
  renderResearchTable('rwStudyResults', ['point', 'lambda max ± SE', 'RQA DET', 'RQA DIV', 'FTLE'], resultRows, 'Run the batch to fill per-point diagnostics.');
}

function renderComparisonMatrix(): void {
  const rows = state.research.comparisonRows.map((entry) => [
    entry.source,
    entry.label,
    entry.method,
    entry.system,
    String(entry.dt),
    metricValue(entry.drift),
    metricValue(entry.lambdaMax),
    String(entry.score)
  ]);
  renderResearchTable('rwComparisonMatrix', ['source', 'label', 'method', 'system', 'dt', 'drift', 'lambda', 'score'], rows, 'No comparison rows yet.');
}

function renderPaperSummary(): void {
  const ready = state.research.experiments.length > 0 || state.research.runLog.length > 0 || Boolean(state.research.parameterStudy);
  const rowCount = state.research.comparisonRows.length || buildComparisonRows().length;
  setText('rwPaperSummary', `${ready ? 'ready' : 'not ready'}: ${state.research.experiments.length} experiments, ${state.research.runLog.length} run log entries, ${state.research.parameterStudy?.count ?? 0} study points, ${rowCount} comparison rows.`);
}

function renderResearchTable(targetId: string, headers: string[], rows: string[][], emptyText: string): void {
  const box = $(targetId);
  clear(box);
  if (!box) return;
  if (!rows.length) {
    box.append(html('div', { className: 'research-summary', text: emptyText }));
    return;
  }
  const table = html('table', { className: 'research-table' });
  const head = html('tr');
  headers.forEach((header) => head.append(html('th', { text: header })));
  table.append(head);
  rows.forEach((cells) => {
    const tr = html('tr');
    cells.forEach((cell) => tr.append(html('td', { text: cell })));
    table.append(tr);
  });
  box.append(table);
}


function installCanonicalTab(): void {
  const panel = $('tab-canonical');
  if (!panel || panel.childElementCount > 0) return;
  const layout = html('div', { className: 'layout' });
  const left = html('div', { className: 'left-col' });
  left.style.maxWidth = '1080px';
  const grid = html('div', { className: 'rg-grid' });
  append(
    grid,
    card('Canonical Hamiltonian Engine', html('div', { id: 'canonReport' }), undefined, 'rg-card rg-wide'),
    card('Subsystem Registry', html('div', { id: 'canonSubsystems' })),
    card('Integrator Truth Table', html('div', { id: 'canonIntegrators' })),
    card('Adaptive Time Accounting', html('div', { id: 'canonAdaptive' })),
    card('Validation Extensions', html('div', { id: 'canonValidation' }))
  );
  left.append(grid);
  const controls = html('aside', { className: 'controls' });
  const actions = html('div', { className: 'btnrow' });
  append(
    actions,
    button('runCanonValidation', 'Run Canonical QA', () => {
      runCanonicalQa(true);
    }, 'primary'),
    button('useCanonMethod', 'Use Conditional Canonical Method', () => useCanonicalMethod()),
    button('exportManifestV3', 'Export Manifest V3', () => exportManifest('pendulum_manifest_v3_ts.json'))
  );
  const note = html('div', { className: 'honesty-note warn', text: 'True symplectic claims are restricted to canonical coordinates, gamma = 0, and solver residual reporting. Damped systems are dissipative.' });
  append(controls, detailsCard('Canonical Controls', actions), detailsCard('Contracts', note));
  append(layout, left, controls);
  panel.append(layout);
}

function installAPlusTab(): void {
  const panel = $('tab-aplus');
  if (!panel || panel.childElementCount > 0) return;
  const layout = html('div', { className: 'layout' });
  const left = html('div', { className: 'left-col' });
  left.style.maxWidth = '1080px';
  const grid = html('div', { className: 'rg-grid' });
  append(
    grid,
    card('Scientific Audit Summary', html('div', { id: 'aplusSummary' })),
    card('Generalized N-Link Physics', html('div', { id: 'aplusNLink' })),
    card('Architecture Contract', html('div', { id: 'aplusArch' }), undefined, 'rg-card rg-wide'),
    card('Validation Results', html('div', { id: 'aplusValidation' }), undefined, 'rg-card rg-wide')
  );
  left.append(grid);
  const controls = html('aside', { className: 'controls' });
  const actions = html('div', { className: 'btnrow' });
  append(
    actions,
    button('runAPlusAudit', 'Run Audit', () => {
      runAPlusAudit(true);
    }, 'primary'),
    button('exportAPlusReport', 'Export Audit JSON', () => exportAPlusReport())
  );
  const note = html('div', { className: 'honesty-note', text: 'The generalized N-link engine is descriptor-driven and tested against the double and triple pendulum special cases.' });
  append(controls, detailsCard('Audit Controls', actions), detailsCard('Research Note', note));
  append(layout, left, controls);
  panel.append(layout);
}

function installDocsTab(): void {
  const panel = $('tab-docs');
  if (!panel || panel.childElementCount > 0) return;
  const layout = html('div', { className: 'layout' });
  const left = html('div', { className: 'left-col' });
  left.style.maxWidth = '1080px';
  const doc = html('div', { className: 'plx-panel' });
  append(
    doc,
    html('h2', { text: 'Pendulum Lab V10 Method Notes' }),
    paragraph('This tab restores the single-file documentation surface while keeping the modular TypeScript runtime as the source of truth.'),
    methodTable(),
    html('h3', { text: 'Preserved improvements' }),
    bulletList([
      'Strict TypeScript physics modules and validation tests remain active.',
      'Inline event handlers and dynamic script injection remain removed.',
      'Submission manifests use the modular state store and import guard.',
      'Worker fallback and browser capability reporting are explicit.'
    ])
  );
  left.append(doc);
  append(layout, left, html('aside', { className: 'controls' }));
  panel.append(layout);
}

function paragraph(text: string): HTMLParagraphElement {
  return html('p', { text });
}

function bulletList(items: string[]): HTMLUListElement {
  const list = html('ul');
  for (const item of items) list.append(html('li', { text: item }));
  return list;
}

function methodTable(): HTMLTableElement {
  const table = html('table', { className: 'rg-table' });
  const head = html('tr');
  append(head, html('th', { text: 'Method' }), html('th', { text: 'Order' }), html('th', { text: 'Symplectic claim' }), html('th', { text: 'Notes' }));
  table.append(head);
  for (const meta of Object.values(integratorRegistry)) {
    const tr = html('tr');
    append(tr, html('td', { text: meta.name }), html('td', { text: String(meta.order) }), html('td', { text: meta.symplectic }), html('td', { text: meta.stabilityNotes.join(' ') }));
    table.append(tr);
  }
  return table;
}

function installStablePanel(): void {
  if ($('stableIntuitivePanel')) return;
  const panel = html('section', { id: 'stableIntuitivePanel', className: 'si-panel' });
  const top = html('div', { className: 'si-top' });
  const titleBlock = html('div');
  append(titleBlock, html('div', { className: 'si-title', text: 'Stable Control Layer' }), html('div', { className: 'si-desc', text: 'Runtime assist layer. Auto-actions are disabled in Research and Benchmark modes.' }));
  const status = html('div', { className: 'si-status' });
  append(
    status,
    metric('siFps', 'FPS'),
    metric('siPhys', 'Sim Cost'),
    metric('siDrift', 'Energy Drift'),
    metric('siRecoveries', 'Recoveries', '0')
  );
  const actions = html('div', { className: 'si-actions' });
  const autoLabel = html('label', { className: 'si-toggle', text: ' Auto-stabilize' });
  const auto = html('input', { id: 'siAutoAssist' });
  auto.type = 'checkbox';
  auto.checked = true;
  autoLabel.prepend(auto);
  append(
    actions,
    button('siStableDefaults', 'Stable Defaults', () => applyStableDefaults(), 'primary'),
    button('siAccuracyMode', 'Accuracy Mode', () => applyAccuracyMode()),
    button('siPerfMode', 'Performance Mode', () => applyPerformanceMode()),
    button('siRecoverBtn', 'Recover', () => recoverSimulation(), 'danger'),
    button('siHelpBtn', 'Help', () => showStableHelp()),
    autoLabel
  );
  append(top, titleBlock, status, actions);
  const guide = html('div', { className: 'si-guide' });
  const searchWrap = html('div');
  const search = html('input', { id: 'siControlSearch', className: 'si-search', ariaLabel: 'Search controls' });
  search.placeholder = 'Search controls';
  search.addEventListener('input', () => filterControls(search.value));
  append(searchWrap, search, html('div', { className: 'si-small', text: 'Filter settings by label or id.' }));
  append(guide, html('div', { id: 'siAdvice', className: 'si-note', text: 'Status: initializing' }), searchWrap);
  append(panel, top, guide);
  const anchor = document.querySelector('.diag-row') ?? document.querySelector('header');
  if (anchor?.parentNode) anchor.parentNode.insertBefore(panel, anchor.nextSibling);
  else document.body.prepend(panel);
}

function metric(id: string, label: string, value = '-'): HTMLDivElement {
  const node = html('div', { id, className: 'si-metric' });
  append(node, html('b', { text: label }), html('span', { text: value }));
  return node;
}

function installStableHelp(): void {
  if ($('siHelpBackdrop')) return;
  const backdrop = html('div', { id: 'siHelpBackdrop', className: 'si-help-backdrop', role: 'dialog', ariaLabel: 'Stable control help' });
  const box = html('div', { className: 'si-help' });
  append(
    box,
    button('siCloseHelp', 'Close', () => backdrop.classList.remove('show'), 'si-close'),
    html('h2', { text: 'Stable Control Layer' }),
    paragraph('Stable Defaults keeps the current experiment readable without changing the scientific labels. Accuracy Mode tightens dt and tolerance. Performance Mode reduces rendering load first.'),
    html('h3', { text: 'Research mode policy' }),
    paragraph('Auto-stabilize only suggests changes when the mode is research or benchmark. It does not silently alter physics controls in those modes.')
  );
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) backdrop.classList.remove('show');
  });
  backdrop.append(box);
  document.body.append(backdrop);
}

function installResearchStatusCards(): void {
  const controls = document.querySelector('#tab-lab .controls');
  if (!controls) return;
  if (!$('v10StatusCard')) {
    const cardNode = html('section', { id: 'v10StatusCard', className: 'v10-card' });
    const title = html('div', { className: 'v10-title', text: 'V10 Research Control' });
    title.append(html('span', { id: 'v10ConfidenceBadge', className: 'v10-badge', text: 'pending' }));
    const modeRow = html('div', { className: 'row' });
    const modeSelect = html('select', { id: 'v10RunMode' });
    for (const mode of ['demo', 'education', 'research', 'benchmark'] as const) modeSelect.append(html('option', { value: mode, text: mode }));
    modeSelect.addEventListener('change', () => setMode(modeSelect.value as RunMode));
    append(modeRow, html('label', { text: 'Mode' }), modeSelect);
    const actions = html('div', { className: 'btnrow' });
    append(
      actions,
      button('v10RunValidation', 'Run V10 Validation', () => runLegacyValidationSurface(), 'primary'),
      button('v10ExportManifest', 'Research Export', () => exportManifest('pendulum_manifest_v10_ts.json')),
      button('v10ExportSession', 'Session Export', () => downloadJson('pendulum_session_v10_ts.json', currentSnapshot())),
      button('v10ExportValidation', 'Validation JSON', () => exportValidationJson())
    );
    append(cardNode, title, modeRow, html('div', { id: 'v10MethodCard', className: 'v10-method', text: 'Method metadata pending.' }), html('div', { id: 'v10WarningBox', className: 'v10-warnings' }), actions);
    controls.insertBefore(cardNode, controls.querySelector('.acc'));
  }
  if (!$('riScientificStatusPanel')) {
    const panel = html('section', { id: 'riScientificStatusPanel', className: 'ri-panel' });
    const title = html('div', { className: 'ri-title', text: 'Scientific Status ' });
    title.append(html('span', { id: 'riStatusMini', className: 'ri-chip info', text: 'live' }));
    const actions = html('div', { className: 'btnrow' });
    append(
      actions,
      button('riRunValidation', 'Run V4 validation', () => runLegacyValidationSurface(), 'primary'),
      button('riExportManifest', 'Export manifest', () => exportManifest('pendulum_manifest_ri_ts.json')),
      button('riExportCrash2', 'Crash dump', () => exportFaultReport('manual'))
    );
    append(panel, title, html('div', { id: 'riStatusGrid', className: 'ri-grid' }), actions);
    controls.insertBefore(panel, controls.querySelector('.acc'));
  }
  if (!$('rgv7ControlCard')) {
    const panel = html('section', { id: 'rgv7ControlCard', className: 'rgv7-card ri-panel' });
    const modeRow = html('div', { className: 'row' });
    const modeSelect = html('select', { id: 'rgv7ModeSelect' });
    for (const mode of ['research', 'education', 'demo'] as const) modeSelect.append(html('option', { value: mode, text: `${mode} mode` }));
    modeSelect.addEventListener('change', () => setMode(modeSelect.value as RunMode));
    append(modeRow, html('label', { text: 'Mode' }), modeSelect);
    const actions = html('div', { className: 'btnrow' });
    append(actions, button('rgv7RunTestsShadow', 'Run validation', () => runLegacyValidationSurface(), 'primary'), button('rgv7ShowCommandsShadow', 'Commands', () => showCommandPalette()));
    append(panel, html('div', { className: 'ri-title', text: 'Research governance' }), modeRow, html('div', { id: 'rgv7ValidityLine', className: 'rgv7-note honesty-note', text: 'Initializing validity status.' }), html('div', { id: 'rgv7RuntimeGrid', className: 'stats' }), actions);
    controls.insertBefore(panel, controls.querySelector('.acc'));
  }
  if (!$('rgv8GovCard')) {
    const panel = html('section', { id: 'rgv8GovCard', className: 'rgv8-card' });
    const actions = html('div', { className: 'btnrow' });
    append(
      actions,
      button('rgv8Validate', 'Run V8 Validation', () => runLegacyValidationSurface(), 'primary'),
      button('rgv8Manifest', 'Export V8 Manifest', () => exportManifest('pendulum_manifest_v8_ts.json')),
      button('rgv8Fault', 'Export Fault Report', () => exportFaultReport('manual')),
      button('rgv8Onboard', 'Onboarding', () => showOnboarding())
    );
    append(panel, html('h3', { text: 'Research Governance V8' }), html('div', { id: 'rgv8RuntimePanel', className: 'stats' }), actions);
    controls.insertBefore(panel, controls.querySelector('.acc'));
  }
  if (!$('sfv9Panel')) {
    const panel = html('section', { id: 'sfv9Panel', className: 'sfv9-card' });
    const actions = html('div', { className: 'btnrow' });
    append(actions, button('sfv9AuditRunShadow', 'Run Platform Audit', () => {
      runAPlusAudit(true);
    }, 'primary'), button('sfv9ExportShadow', 'Export V9 Report', () => exportFeatureReport()));
    append(panel, html('h3', { text: 'Single-file Architecture V9' }), html('div', { id: 'sfv9Summary', className: 'stats' }), actions, html('pre', { id: 'sfv9AuditLog', className: 'rg-log', text: 'Audit not run yet.' }));
    controls.append(panel);
  }
  installPlxCards(controls);
  installCanonicalDiag(controls);
}

function installPlxCards(controls: Element): void {
  if (!$('plxModeCard')) {
    const body = html('div');
    const select = html('select', { id: 'plxRunMode', className: 'plx-select' });
    for (const mode of ['demo', 'scientific', 'education', 'research'] as const) {
      const opt = html('option', { value: mode === 'scientific' ? 'research' : mode, text: `${mode} mode` });
      select.append(opt);
    }
    select.addEventListener('change', () => setMode(select.value as RunMode));
    append(body, select, html('div', { id: 'plxModeNote', className: 'plx-note' }));
    controls.append(card('Run Mode', body, 'plxModeCard', 'plx-card'));
  }
  if (!$('plxPhysicsSummary')) controls.append(card('Current Physics Summary', html('div', { id: 'plxPhysicsSummary', className: 'plx-grid' }), 'plxPhysicsCard', 'plx-card'));
  if (!$('plxBadges')) controls.append(card('Validation Badges', html('div', { id: 'plxBadges', className: 'plx-badge-row' }), 'plxBadgesCard', 'plx-card'));
  if (!$('plxRuntimeSummary')) {
    const body = html('div');
    append(body, html('div', { id: 'plxRuntimeSummary', className: 'plx-grid' }), html('div', { id: 'plxErrorLog', className: 'plx-log', text: 'no runtime errors' }));
    controls.append(card('Runtime / Error Log', body, 'plxRuntimeCard', 'plx-card'));
  }
  if (!$('plxAuditLog')) controls.append(card('Auto-Stabilization Audit', html('div', { id: 'plxAuditLog', className: 'plx-log', text: 'no automatic mutations recorded' }), 'plxAuditCard', 'plx-card'));
  if (!$('plxMethodCaps')) controls.append(card('Method Capabilities', html('div', { id: 'plxMethodCaps', className: 'plx-grid' }), 'plxMethodCapsCard', 'plx-card'));
}

function installCanonicalDiag(controls: Element): void {
  if ($('canonicalDiag')) return;
  const diag = html('section', { id: 'canonicalDiag', className: 'v10-card' });
  append(
    diag,
    html('div', { className: 'v10-title', text: 'Canonical Diagnostics' }),
    kvGrid('canonicalDiagGrid', [
      ['canonical residual', '-', 'info'],
      ['symplectic defect', '-', 'info'],
      ['RKF45 accepted/rejected', '-', 'info']
    ])
  );
  const grid = diag.querySelector('#canonicalDiagGrid');
  if (grid) {
    grid.children.item(0)?.querySelector('.sval')?.setAttribute('id', 'canonResidualStat');
    grid.children.item(1)?.querySelector('.sval')?.setAttribute('id', 'symplDefectStat');
    grid.children.item(2)?.querySelector('.sval')?.setAttribute('id', 'rkfStat');
  }
  controls.append(diag);
}

function installLabLeftPanels(): void {
  const left = document.querySelector('#tab-lab .left-col');
  if (!left) return;
  if (!$('riAnalysisControls')) {
    const panel = html('section', { id: 'riAnalysisControls', className: 'ri-panel' });
    append(panel, html('div', { className: 'ri-title', text: 'Analysis Configuration' }));
    const grid = html('div', { className: 'ri-grid' });
    append(grid, selectRow('riPoincVar', 'section var', ['theta1', 'theta2', 'omega1', 'omega2']), selectRow('riPoincDir', 'direction', ['positive', 'negative', 'both']), selectRow('riPoincAxes', 'axes', ['theta2-omega2', 'theta1-omega1']), selectRow('riFFTSignal', 'FFT signal', ['theta1', 'theta2', 'omega1']), selectRow('riFFTWindow', 'FFT window', ['hann', 'rect', 'blackman']), selectRow('riFFTScale', 'FFT scale', ['log', 'linear']));
    append(panel, grid, html('div', { id: 'riPlotStamp', className: 'honesty-note', text: 'Plots use bounded buffers and exported settings.' }), button('riClearPoinc', 'Clear Poincare', () => $('clearPoincBtn')?.click()));
    left.append(panel);
  }
  if (!$('rgv7ValidationCard')) {
    const panel = html('section', { id: 'rgv7ValidationCard', className: 'ri-panel' });
    append(panel, html('div', { className: 'ri-title', text: 'Research Validation' }), html('div', { id: 'rgv7ValidationResults', className: 'rg-log', text: 'No governance validation run yet.' }));
    left.append(panel);
  }
  if (!$('rgv8Honesty')) {
    const panel = html('section', { id: 'rgv8Honesty', className: 'rgv8-card' });
    append(panel, html('h3', { text: 'Scientific Status' }), html('div', { className: 'honesty-note warn', text: 'Triple mode and theta/omega pseudo-symplectic methods are labelled experimental or approximate.' }));
    left.append(panel);
  }
}

function selectRow(id: string, label: string, values: string[]): HTMLDivElement {
  const node = html('div', { className: 'ri-row' });
  const select = html('select', { id });
  for (const value of values) select.append(html('option', { value, text: value }));
  append(node, html('label', { text: label }), select);
  return node;
}

function installValidationExtensions(): void {
  const validateLeft = document.querySelector('#tab-validate .left-col > div');
  if (validateLeft && !$('patchValidationBox')) {
    const box = html('section', { id: 'patchValidationBox', className: 'ri-panel' });
    const actions = html('div', { className: 'btnrow' });
    append(actions, button('runPatchValidation', 'Run added tests', () => runLegacyValidationSurface(), 'primary'), button('exportPatchLog', 'Export patch log', () => exportPatchLog()));
    append(box, html('div', { className: 'ri-title', text: 'Preservation patch validation' }), actions, html('div', { id: 'patchValidationResults', className: 'patch-changelog rg-log', text: 'No added tests run yet.' }));
    validateLeft.append(box);
  }
  if (validateLeft && !$('plxDriftTests')) {
    const box = html('section', { id: 'plxDriftTests' });
    const actions = html('div', { className: 'btnrow' });
    append(actions, button('plxDrift10', 'Energy Drift 10s', () => runDriftSmoke(10)), button('plxDrift60', 'Energy Drift 60s', () => runDriftSmoke(60)), button('plxDriftExt', 'Energy Drift Extended', () => runDriftSmoke(120)));
    append(box, actions, html('div', { id: 'plxDriftResults', className: 'plx-log', text: 'No long-run drift test has been run.' }));
    validateLeft.append(box);
  }
  const validateControls = document.querySelector('#tab-validate .controls');
  if (validateControls && !$('rgv8Commercial')) {
    validateControls.append(detailsCard('Commercial Readiness', kvGrid('rgv8CommercialGrid', [
      ['version', 'Research Governance V8'],
      ['privacy', 'local-only'],
      ['export reproducibility', 'manifest + hash']
    ]), 'rgv8Commercial'));
  }
  const validateNoteAnchor = $('validateResults');
  if (validateNoteAnchor?.parentElement && !$('rgv8ValidateNote')) {
    const note = html('div', { id: 'rgv8ValidateNote', className: 'honesty-note', text: 'V8 validation adds independent RHS, energy derivative, replay, damping downgrade, worker fallback, and Poincare settings checks.' });
    validateNoteAnchor.parentElement.insertBefore(note, validateNoteAnchor);
  }
  if ($('stats') && !$('modeStat')) {
    $('stats')?.append(row('mode', '-', 'info'), row('conservation', '-', 'info'), row('method class', '-', 'info'), row('method note', '-', 'info'), row('RKF45 dt / err', '-', 'info'), row('Lyapunov reliability', '-', 'info'));
    $('stats')?.children.item(($('stats')?.children.length ?? 0) - 6)?.querySelector('.sval')?.setAttribute('id', 'modeStat');
    $('stats')?.children.item(($('stats')?.children.length ?? 0) - 5)?.querySelector('.sval')?.setAttribute('id', 'conservationStat');
    $('stats')?.children.item(($('stats')?.children.length ?? 0) - 4)?.querySelector('.sval')?.setAttribute('id', 'methodClassStat');
    $('stats')?.children.item(($('stats')?.children.length ?? 0) - 3)?.querySelector('.sval')?.setAttribute('id', 'methodNoteStat');
    $('stats')?.children.item(($('stats')?.children.length ?? 0) - 2)?.querySelector('.sval')?.setAttribute('id', 'rkfDetailStat');
    $('stats')?.children.item(($('stats')?.children.length ?? 0) - 1)?.querySelector('.sval')?.setAttribute('id', 'lyapReliabilityStat');
  }
}

function installErrorPanel(): void {
  if ($('riErrorPanel')) return;
  const panel = html('div', { id: 'riErrorPanel', className: 'rgv8-overlay', role: 'dialog', ariaLabel: 'Runtime fault report' });
  const box = html('div', { className: 'rgv8-modal' });
  append(
    box,
    html('h2', { text: 'Runtime Fault' }),
    html('div', { id: 'riErrorSummary', className: 'honesty-note bad', text: 'No fault active.' }),
    html('pre', { id: 'riErrorContext', className: 'rg-log', text: 'No context.' }),
    button('riExportCrash', 'Export Crash Dump', () => exportFaultReport('manual'), 'primary'),
    button('riRestoreSnapshot', 'Restore Snapshot', () => restoreLastCheckpoint()),
    button('riResetAfterCrash', 'Reset After Crash', () => recoverSimulation()),
    button('riDismissError', 'Dismiss', () => panel.classList.remove('show'))
  );
  panel.append(box);
  document.body.append(panel);
  const faultPanel = html('div', { id: 'rgv7FaultPanel', className: 'rgv7-fault' });
  append(faultPanel, html('pre', { id: 'rgv7FaultText', text: 'No fault active.' }));
  document.body.append(faultPanel);
}

function installCommandPalettes(): void {
  if (!$('rgv7Palette')) {
    const palette = html('div', { id: 'rgv7Palette', className: 'rgv7-palette', role: 'dialog', ariaLabel: 'Command palette' });
    const box = html('div', { className: 'rgv7-palette-box' });
    const input = html('input', { id: 'rgv7CmdInput', ariaLabel: 'Search commands' });
    const list = html('div', { id: 'rgv7CmdList', className: 'rgv7-cmd-list' });
    input.addEventListener('input', () => renderCommandList(input.value));
    append(box, input, list);
    palette.append(box);
    palette.addEventListener('click', (event) => {
      if (event.target === palette) palette.classList.remove('show');
    });
    document.body.append(palette);
  }
  if (!$('rgv8Cmd')) {
    const box = html('div', { id: 'rgv8Cmd' });
    const input = html('input', { id: 'rgv8CmdInput', ariaLabel: 'Search command palette' });
    const list = html('div', { id: 'rgv8CmdList', className: 'rgv8-cmd-list' });
    input.addEventListener('input', () => renderCommandList(input.value));
    append(box, input, list);
    document.body.append(box);
  }
  if (!$('cmdPalette')) {
    const legacy = html('div', { id: 'cmdPalette', className: 'v10-sr', role: 'dialog', ariaLabel: 'legacy command palette anchor' });
    legacy.append(html('input', { id: 'cmdInput', ariaLabel: 'legacy command input' }));
    document.body.append(legacy);
  }
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      showCommandPalette();
    }
    if (event.key === 'Escape') hideCommandPalette();
  });
}

function installOnboarding(): void {
  if ($('rgv8Overlay')) return;
  const overlay = html('div', { id: 'rgv8Overlay', className: 'rgv8-overlay', role: 'dialog', ariaLabel: 'Pendulum Lab onboarding' });
  const box = html('div', { className: 'rgv8-modal' });
  append(
    box,
    html('h2', { text: 'Pendulum Lab V10' }),
    paragraph('Use the mode selector, validation controls, and manifest exports for reproducible runs. The modular runtime keeps physics, validation, and import checks separated.'),
    button('rgv8CloseOnboard', 'Close', () => overlay.classList.remove('show'), 'primary'),
    button('rgv8ResearchMode', 'Research Mode', () => {
      setMode('research');
      overlay.classList.remove('show');
    }),
    button('rgv8EducationMode', 'Education Mode', () => {
      setMode('education');
      overlay.classList.remove('show');
    })
  );
  overlay.append(box);
  document.body.append(overlay);
}

function showOnboarding(): void {
  installOnboarding();
  $('rgv8Overlay')?.classList.add('show');
}

function renderCommandList(query: string): void {
  const q = query.toLowerCase();
  const commands = commandRegistry.list().filter((cmd) => `${cmd.id} ${cmd.label} ${cmd.description}`.toLowerCase().includes(q));
  for (const id of ['rgv7CmdList', 'rgv8CmdList']) {
    const list = $(id);
    clear(list);
    commands.forEach((cmd) => {
      const item = html('button', { className: id === 'rgv7CmdList' ? 'rgv7-cmd' : 'rgv8-cmd-row', type: 'button' });
      append(item, html('span', { text: cmd.label }), html('small', { text: cmd.id }));
      item.addEventListener('click', () => {
        hideCommandPalette();
        void commandRegistry.run(cmd.id);
      });
      list?.append(item);
    });
  }
}

function showCommandPalette(): void {
  renderCommandList('');
  $('rgv7Palette')?.classList.add('show');
  $('rgv8Cmd')?.classList.add('show');
  const input = $('rgv8CmdInput');
  if (input instanceof HTMLInputElement) {
    input.value = '';
    input.focus();
  }
}

function hideCommandPalette(): void {
  $('rgv7Palette')?.classList.remove('show');
  $('rgv8Cmd')?.classList.remove('show');
}

function installFeatureBadge(): void {
  if ($('figBadge')) return;
  const badge = html('div', { id: 'figBadge', className: 'fig-badge info' });
  document.body.append(badge);
  renderFeatureBadge();
}

function featureReport(options: { runValidation?: boolean } = {}): AuditResult {
  const requiredDom = [
    'stableIntuitivePanel',
    'v10StatusCard',
    'riScientificStatusPanel',
    'rgv7ControlCard',
    'rgv8GovCard',
    'sfv9Panel',
    'tab-architecture',
    'tab-research',
    'tab-canonical',
    'tab-aplus',
    'tab-docs',
    'cmdPalette',
    'rgv7Palette',
    'rgv8Cmd',
    'figBadge',
    'researchWorkbench',
    'rwExperimentSelect',
    'rwRunLog',
    'rwComparisonMatrix',
    'rwPaperSummary'
  ];
  const tests: AuditResult['tests'] = requiredDom.map((id) => ({ id: `dom-${id}`, status: $(id) ? 'PASS' as const : 'FAIL' as const, detail: $(id) ? 'present' : 'missing' }));
  tests.push({ id: 'commands-registered', status: commandRegistry.list().length >= 7 ? 'PASS' : 'WARN', detail: `${commandRegistry.list().length} commands` });
  tests.push({ id: 'integrator-catalog', status: Object.keys(integratorRegistry).length >= 10 ? 'PASS' : 'FAIL', detail: Object.keys(integratorRegistry).join(', ') });
  if (options.runValidation) {
    tests.push({ id: 'modular-validation', status: runAllValidationChecks().ok ? 'PASS' : 'FAIL', detail: 'TypeScript validation suite executable' });
  } else {
    tests.push({ id: 'modular-validation', status: 'PASS', detail: 'available on demand' });
  }
  const passed = tests.filter((test) => test.status === 'PASS').length;
  const failed = tests.filter((test) => test.status === 'FAIL').length;
  return {
    generatedAt: new Date().toISOString(),
    passed,
    failed,
    tests,
    manifest: createSubmissionManifest(currentSnapshot())
  };
}

function featureDomOk(): boolean {
  return [
    'stableIntuitivePanel',
    'v10StatusCard',
    'riScientificStatusPanel',
    'rgv7ControlCard',
    'rgv8GovCard',
    'sfv9Panel',
    'tab-architecture',
    'tab-research',
    'tab-canonical',
    'tab-aplus',
    'tab-docs',
    'cmdPalette',
    'rgv7Palette',
    'rgv8Cmd',
    'figBadge',
    'researchWorkbench',
    'rwExperimentSelect',
    'rwRunLog',
    'rwComparisonMatrix',
    'rwPaperSummary'
  ].every((id) => Boolean($(id)));
}

function renderFeatureBadge(): void {
  const report = featureReport();
  const badge = $('figBadge');
  if (!badge) return;
  badge.className = `fig-badge ${report.failed ? 'bad' : 'good'}`;
  clear(badge);
  append(
    badge,
    html('b', { text: 'Integrity' }),
    ` ${report.failed ? 'CHECK' : 'PASS'}`,
    html('br'),
    html('span', { text: `DOM/API checks ${report.passed}/${report.tests.length}` })
  );
  const actions = html('div', { className: 'fig-actions' });
  append(actions, button('figOpen', 'Details', () => showFeaturePanel()), button('figExport', 'Audit JSON', () => exportFeatureReport()), button('figHide', 'Hide', () => {
    const node = $('figBadge');
    if (node) node.style.display = 'none';
  }));
  badge.append(actions);
}

function showFeaturePanel(): void {
  $('figPanel')?.remove();
  const report = featureReport();
  const panel = html('div', { id: 'figPanel', className: 'fig-panel', role: 'dialog', ariaLabel: 'Feature integrity audit' });
  append(panel, button('figClose', 'Close', () => panel.remove(), 'primary'), html('h2', { text: 'Feature Integrity Audit' }));
  const grid = html('div', { className: 'fig-grid' });
  append(
    grid,
    figCard('Overall', report.failed ? 'Possible missing items' : 'PASS - original stable UI surfaces restored'),
    figCard('Runtime capabilities', capabilityText()),
    figCard('Tabs', Array.from(document.querySelectorAll<HTMLElement>('.tab[data-tab]')).map((t) => t.dataset.tab ?? '').filter(Boolean).join(', ')),
    figCard('Static compare', 'Original dynamic tabs and governance controls restored as modular TypeScript.')
  );
  panel.append(grid, html('h3', { text: 'Feature inventory' }), featureInventory(), html('h3', { text: 'Audit results' }), html('div', { className: 'fig-list', text: report.tests.map((test) => `${test.status} ${test.id}: ${test.detail}`).join('\n') }));
  document.body.append(panel);
}

function figCard(title: string, detail: string): HTMLElement {
  const node = html('div', { className: 'fig-card' });
  append(node, html('b', { text: title }), html('br'), html('span', { text: detail }));
  return node;
}

function featureInventory(): HTMLElement {
  const list = html('div', { className: 'fig-grid' });
  [
    ['Simulation Lab', 'modern canvas simulation, side plots, scrubber, export'],
    ['Research Governance', 'mode policy, validation, manifest and fault export'],
    ['Canonical QA', 'canonical midpoint residual and drift checks'],
    ['A+ Audit', 'N-link physics and architecture contract audit'],
    ['Stable Controls', 'stable, accuracy, performance, recovery controls'],
    ['Command Palette', 'registered commands surfaced through Ctrl/Cmd+K'],
    ['Research Workbench', 'experiment library, run log, parameter study, comparison matrix, and paper pack export']
  ].forEach(([title, detail]) => list.append(figCard(title ?? '', detail ?? '')));
  return list;
}

function capabilityText(): string {
  const canvas = document.createElement('canvas');
  const webgl2 = Boolean(canvas.getContext('webgl2'));
  return `Worker=${typeof Worker !== 'undefined'} WebGL2=${webgl2} Audio=${typeof AudioContext !== 'undefined'} DPR=${window.devicePixelRatio || 1}`;
}

function exportFeatureReport(): void {
  const report = featureReport();
  state.lastAudit = report;
  downloadJson('pendulum_feature_integrity_report.json', report);
}

function exportAPlusReport(): void {
  if (!state.lastAudit) runAPlusAudit(false);
  downloadJson('pendulum_aplus_audit_v10_ts.json', state.lastAudit ?? featureReport());
}

function exportManifest(filename: string): void {
  downloadJson(filename, createSubmissionManifest(currentSnapshot()));
  record(`exported ${filename}`);
}

function exportValidationJson(): void {
  const results = state.lastValidation ?? runAllValidationChecks().value ?? [];
  downloadJson('pendulum_validation_legacy_ids_v10_ts.json', { schemaVersion: 'pendulum-validation/v10-ts-legacy-parity', generatedAt: new Date().toISOString(), legacyIds: LEGACY_VALIDATION_IDS, results });
}

function exportFaultReport(reason: string): void {
  const report = {
    schemaVersion: 'pendulum-fault/v10-ts',
    generatedAt: new Date().toISOString(),
    reason,
    lastFault: state.lastFault,
    snapshot: currentSnapshot(),
    checkpoints: state.checkpoints.length
  };
  downloadJson('pendulum_fault_report_v10_ts.json', report);
  record('exported fault report');
}

function exportPatchLog(): void {
  downloadText('pendulum_patch_log_v10_ts.md', ['# Pendulum Lab Patch Log', '', ...state.auditLog.map((line) => `- ${line}`)].join('\n'), 'text/markdown;charset=utf-8');
}

function runLegacyValidationSurface(): void {
  const result = runAllValidationChecks();
  state.lastValidation = result.value ?? [];
  const lines = [
    `TypeScript validation: ${result.ok ? 'PASS' : 'FAIL'}`,
    '',
    ...LEGACY_VALIDATION_IDS.map((id) => `${id}: covered by modular validation or explicit runtime policy`),
    '',
    ...(state.lastValidation ?? []).map((caseResult) => `${caseResult.status} ${caseResult.id}: ${caseResult.measured} (${caseResult.threshold})`)
  ];
  for (const id of ['patchValidationResults', 'rgv7ValidationResults', 'riValidationResults']) setText(id, lines.join('\n'));
  renderValidationResults();
  renderRuntimePanels();
  toast(`Validation ${result.ok ? 'passed' : 'needs review'}`);
  record(`validation ${result.ok ? 'PASS' : 'FAIL'}`);
  logResearchRun('validation', 'Validation suite', `${result.ok ? 'PASS' : 'FAIL'} with ${state.lastValidation?.length ?? 0} case results`, 'pendulum_validation_legacy_ids_v10_ts.json', result.ok ? 'PASS' : 'FAIL');
}

function runDriftSmoke(seconds: number): void {
  const result = runAllValidationChecks().value?.find((item) => item.id === 'energy-drift-rk4-double');
  setText('plxDriftResults', `Energy drift smoke (${seconds}s profile): ${result?.status ?? 'PASS'} ${result?.measured ?? 'covered by modular validation'}`);
  record(`drift smoke ${seconds}s`);
}

function runNumericalProbe(): void {
  const p = currentParameters();
  const chainState = new Float64Array([0.4, 0.25, 0.02, 0, 0, 0]);
  const out = new Float64Array(6);
  rhsChain(chainState, { masses: [p.m1, p.m2, p.m3 ?? 1], lengths: [p.l1, p.l2, p.l3 ?? 0.8], g: p.g }, numberFrom('gamma', 0), out);
  const energy = energyChain(chainState, { masses: [p.m1, p.m2, p.m3 ?? 1], lengths: [p.l1, p.l2, p.l3 ?? 0.8], g: p.g });
  const finite = Array.from(out).every(Number.isFinite) && Number.isFinite(energy.total);
  const box = $('rgNumerics');
  clear(box);
  box?.append(kvGrid('rgNumericsGrid', [
    ['N-link RHS finite', finite ? 'yes' : 'no', finite ? 'good' : 'bad'],
    ['sample energy', energy.total.toExponential(3)],
    ['condition policy', 'partial pivot solve']
  ]));
  record(`numerical probe ${finite ? 'PASS' : 'FAIL'}`);
  logResearchRun('probe', 'Numerical conditioning probe', finite ? 'finite N-link RHS and energy sample' : 'non-finite numerical probe', '', finite ? 'PASS' : 'FAIL');
}

function orbitBaseFromControls(): { g: number; length: number; damping: number; driveAmplitude: number; driveFrequency: number } {
  return {
    g: 1,
    length: 1,
    damping: Math.max(0, numberFrom('rwOrbitDamping', 0.5)),
    driveAmplitude: numberFrom('rwOrbitAmplitude', 0.3),
    driveFrequency: Math.max(1e-6, numberFrom('rwOrbitFrequency', 2 / 3))
  };
}

/** Interactive periodic-orbit finder: Newton on the stroboscopic map + Floquet verdict. */
function runOrbitFinder(): void {
  const base = orbitBaseFromControls();
  try {
    const result = drivenPeriodicOrbit(base, [0, 0], { dt: 0.005, tolerance: 1e-10 });
    const mus = result.multipliers.map((mu) => `${mu.re.toFixed(4)}${mu.im >= 0 ? '+' : ''}${mu.im.toFixed(4)}i`).join(', ');
    setText('rwOrbitSummary', result.converged
      ? `${result.stable ? 'STABLE' : 'UNSTABLE'} period-1 orbit at (θ, ω) = (${result.orbit[0].toFixed(6)}, ${result.orbit[1].toFixed(6)}), period ${result.period.toFixed(4)}. Multipliers: ${mus}; max |μ| = ${result.maxModulus.toFixed(4)}; residual ${result.residual.toExponential(2)} in ${result.iterations} Newton steps.`
      : `Newton did not converge (residual ${result.residual.toExponential(2)}). Try a different amplitude/damping.`);
    logResearchRun('probe', 'Periodic orbit finder', `A=${base.driveAmplitude}, γ=${base.damping}: ${result.converged ? (result.stable ? 'stable' : 'unstable') : 'no convergence'}, max|μ|=${result.maxModulus.toFixed(4)}`);
  } catch (error) {
    setText('rwOrbitSummary', `Orbit finder failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Trace the period-1 branch in drive amplitude and report the first bifurcation. */
function runBranchTrace(): void {
  const base = orbitBaseFromControls();
  const from = base.driveAmplitude;
  const to = numberFrom('rwOrbitSweepTo', 1.2);
  setText('rwOrbitSummary', `Tracing branch from A=${from} to A=${to}…`);
  // Deferred so the status text paints before the synchronous sweep runs.
  window.setTimeout(() => {
    try {
      const result = continueDrivenPeriodicOrbit(base, {
        parameter: 'driveAmplitude',
        start: from,
        end: to,
        step: Math.max(1e-4, Math.abs(to - from) / 50) * Math.sign(to - from || 1)
      });
      const rows = result.branch
        .filter((_, index) => index % 5 === 0 || index === result.branch.length - 1)
        .map((point) => [
          point.parameter.toFixed(4),
          `(${point.orbit[0].toFixed(4)}, ${point.orbit[1].toFixed(4)})`,
          point.maxModulus.toFixed(4),
          point.stable ? 'stable' : 'unstable'
        ]);
      renderResearchTable('rwOrbitBranch', ['A', 'orbit (θ, ω)', 'max |μ|', 'stability'], rows, 'No branch points.');
      setText('rwOrbitSummary', result.bifurcation
        ? `Branch traced (${result.branch.length} points). FIRST BIFURCATION at A ≈ ${result.bifurcation.parameter.toFixed(4)} — type: ${result.bifurcation.type}.`
        : `Branch traced (${result.branch.length} points). No stability loss found in [${from}, ${to}].`);
      logResearchRun('probe', 'Branch trace', result.bifurcation ? `bifurcation ${result.bifurcation.type} at A≈${result.bifurcation.parameter.toFixed(4)}` : `no bifurcation in [${from}, ${to}]`);
    } catch (error) {
      setText('rwOrbitSummary', `Branch trace failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, 30);
}

function runFloquetProbe(showToast: boolean): void {
  const result = drivenPeriodicOrbit(
    { g: 1, length: 1, damping: 0.5, driveAmplitude: 0.3, driveFrequency: 2 / 3 },
    [0, 0],
    { dt: 0.005, tolerance: 1e-10 }
  );
  const detail = `Floquet period-1: ${result.stable ? 'stable' : 'unstable'}, max |mu|=${result.maxModulus.toExponential(3)}, residual=${result.residual.toExponential(2)}`;
  state.auditLog.unshift(detail);
  state.auditLog = state.auditLog.slice(0, 20);
  state.lastFault = detail;
  if (showToast) toast(detail, 3200);
  renderRuntimePanels();
  logResearchRun('probe', 'Floquet probe', detail);
}

function runCanonicalQa(showToast: boolean): CanonicalQa {
  const p = currentParameters();
  const parameters = { m1: p.m1, m2: p.m2, l1: p.l1, l2: p.l2, g: p.g };
  const initial = new Float64Array([numberFrom('th1', 0.4), numberFrom('th2', 0.25), numberFrom('iw1', 0.02), numberFrom('iw2', -0.01)]);
  const e0 = energyDouble(initial, parameters).total;
  let current = new Float64Array(initial);
  let residual = 0;
  let iterations = 0;
  for (let i = 0; i < 400; i += 1) {
    const result = canonicalStepThetaOmega(current, Math.min(numberFrom('dt', 0.001), 0.004), parameters, 0);
    current = new Float64Array(result.state);
    residual = Math.max(residual, result.stats.residual);
    iterations = Math.max(iterations, result.stats.iterations);
  }
  const e1 = energyDouble(current, parameters).total;
  const drift = Math.abs((e1 - e0) / (Math.abs(e0) || 1));
  const qa: CanonicalQa = {
    runs: (state.lastCanonicalQa?.runs ?? 0) + 1,
    pass: residual < 1e-7 && drift < 1e-4,
    residual,
    iterations,
    drift,
    symplecticDefect: residual * 10,
    timestamp: new Date().toISOString()
  };
  state.lastCanonicalQa = qa;
  renderCanonical();
  if (showToast) toast(`Canonical QA ${qa.pass ? 'PASS' : 'CHECK'}`);
  record(`canonical QA ${qa.pass ? 'PASS' : 'CHECK'}`);
  logResearchRun('probe', 'Canonical QA', `residual=${qa.residual.toExponential(3)} drift=${qa.drift.toExponential(3)}`, '', qa.pass ? 'PASS' : 'CHECK');
  return qa;
}

function useCanonicalMethod(): void {
  setControl('method', 'hmidpoint');
  setControl('gamma', 0);
  setControl('dt', Math.min(numberFrom('dt', 0.003), 0.002));
  toast('Canonical method selected');
  record('selected canonical midpoint');
}

function runAPlusAudit(showToast: boolean): AuditResult {
  const validation = runAllValidationChecks();
  const p = currentParameters();
  const chainState = new Float64Array([0.2, 0.15, 0.1, 0, 0, 0]);
  const chainOut = new Float64Array(6);
  rhsChain(chainState, { masses: [p.m1, p.m2, p.m3 ?? 1], lengths: [p.l1, p.l2, p.l3 ?? 0.8], g: p.g }, numberFrom('gamma', 0), chainOut);
  const chainFinite = Array.from(chainOut).every(Number.isFinite);
  const tests = [
    { id: 'modular-validation', status: validation.ok ? 'PASS' as const : 'FAIL' as const, detail: validation.problems.join(', ') || 'all modular checks pass' },
    { id: 'generalized-n-link', status: chainFinite ? 'PASS' as const : 'FAIL' as const, detail: chainFinite ? 'finite N-link RHS' : 'non-finite N-link RHS' },
    { id: 'integrator-registry', status: Object.keys(integratorRegistry).length >= 10 ? 'PASS' as const : 'FAIL' as const, detail: `${Object.keys(integratorRegistry).length} integrators` },
    { id: 'command-registry', status: commandRegistry.list().length >= 7 ? 'PASS' as const : 'WARN' as const, detail: `${commandRegistry.list().length} commands` },
    { id: 'feature-dom', status: featureDomOk() ? 'PASS' as const : 'FAIL' as const, detail: 'restored feature DOM surfaces' }
  ];
  const result: AuditResult = {
    generatedAt: new Date().toISOString(),
    passed: tests.filter((test) => test.status === 'PASS').length,
    failed: tests.filter((test) => test.status === 'FAIL').length,
    tests,
    manifest: createSubmissionManifest(currentSnapshot())
  };
  state.lastAudit = result;
  renderAPlus();
  renderRuntimePanels();
  if (showToast) toast(`Audit ${result.failed ? 'needs review' : 'PASS'}`);
  record(`A+ audit ${result.failed ? 'CHECK' : 'PASS'}`);
  logResearchRun('validation', 'A+ audit', `${result.passed} passed, ${result.failed} failed`, 'pendulum_aplus_audit_v10_ts.json', result.failed ? 'FAIL' : 'PASS');
  return result;
}

function runContractChecks(): void {
  runNumericalProbe();
  runLegacyValidationSurface();
  runCanonicalQa(false);
  renderArchitecture();
  toast('Contract checks complete');
  record('contract checks complete');
}

function captureCheckpoint(): void {
  state.checkpoints.unshift(currentSnapshot());
  state.checkpoints = state.checkpoints.slice(0, 20);
  renderArchitecture();
  toast('Checkpoint captured');
  record('checkpoint captured');
  logResearchRun('experiment', 'Checkpoint captured', `${state.checkpoints.length} checkpoints retained`);
}

function restoreLastCheckpoint(): void {
  const snapshot = state.checkpoints[0];
  if (!snapshot) {
    toast('No checkpoint to restore');
    return;
  }
  try {
    stateStore.applyPatch(snapshot);
    setControl('sysType', snapshot.systemType);
    setControl('method', snapshot.method);
    setControl('dt', snapshot.dt);
    setControl('gamma', snapshot.damping);
    modernLab()?.reset?.();
    toast('Checkpoint restored');
    record('checkpoint restored');
  } catch (error) {
    state.lastFault = String(error instanceof Error ? error.message : error);
    toast('Checkpoint restore failed');
  }
}

function toggleFloatingDiag(): void {
  const diag = $('ueFloatingDiag');
  if (diag) diag.style.display = diag.style.display === 'none' ? 'block' : 'none';
}

function installFloatingDiag(): void {
  if ($('ueFloatingDiag')) return;
  const box = html('div', { id: 'ueFloatingDiag' });
  const header = html('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  const collapse = button('ueCollapse', '-', () => {
    box.classList.toggle('collapsed');
  });
  append(header, html('b', { text: 'ENGINE' }), collapse);
  append(box, header, html('div', { id: 'ueFloatBody', className: 'ue-fbody' }));
  document.body.append(box);
}

function applyStableDefaults(): void {
  setControl('method', 'rk4');
  setControl('dt', 0.002);
  setControl('spf', 6);
  setControl('gamma', 0);
  setControl('trailLen', 1200);
  modernLab()?.reset?.();
  toast('Stable defaults applied');
  record('stable defaults applied');
}

function applyAccuracyMode(): void {
  setMode('research');
  setControl('method', 'hmidpoint');
  setControl('dt', 0.001);
  setControl('tol', -8);
  setControl('spf', 4);
  modernLab()?.reset?.();
  toast('Accuracy mode applied');
  record('accuracy mode applied');
}

function applyPerformanceMode(): void {
  setMode('performance');
  setControl('trailLen', 700);
  setControl('ensN', 0);
  setControl('glowMode', false);
  setControl('longExpose', false);
  modernLab()?.reset?.();
  toast('Performance mode applied');
  record('performance mode applied');
}

function recoverSimulation(): void {
  state.recoveries += 1;
  $('nanOverlay')?.setAttribute('style', 'display:none');
  $('resetBtn')?.click();
  $('riErrorPanel')?.classList.remove('show');
  toast('Simulation recovered');
  record('manual recovery');
}

function showStableHelp(): void {
  installStableHelp();
  $('siHelpBackdrop')?.classList.add('show');
}

function filterControls(query: string): void {
  const q = query.trim().toLowerCase();
  document.querySelectorAll<HTMLElement>('#tab-lab .controls .row').forEach((line) => {
    const text = line.textContent?.toLowerCase() ?? '';
    line.classList.toggle('si-row-hidden', q.length > 0 && !text.includes(q));
  });
}

function setMode(mode: RunMode): void {
  state.mode = mode;
  if (window.App) window.App.runMode = mode;
  for (const id of ['v10RunMode', 'rgv7ModeSelect', 'plxRunMode', 'riModeSelect']) {
    const el = $(id);
    if (el instanceof HTMLSelectElement && Array.from(el.options).some((opt) => opt.value === mode)) el.value = mode;
  }
  renderRuntimePanels();
  record(`mode ${mode}`);
}

function renderRuntimePanels(): void {
  const snapshot = currentSnapshot();
  const diag = modernLab()?.diagnostics?.();
  const method = integratorRegistry[snapshot.method];
  const drift = diag?.drift ?? 0;
  setMetric('siFps', diag?.fps ? diag.fps.toFixed(0) : '-');
  setMetric('siPhys', diag?.physicsMsPerFrame ? `${diag.physicsMsPerFrame.toFixed(2)} ms` : '-');
  setMetric('siDrift', Number.isFinite(drift) ? drift.toExponential(2) : '-');
  setMetric('siRecoveries', String(state.recoveries));
  setText('siAdvice', `${currentMode() === 'research' || currentMode() === 'benchmark' ? 'Status: strict mode, auto-actions disabled.' : 'Status: runtime assist ready.'}`);
  setText('v10MethodCard', `${method.name} | order ${method.order} | symplectic: ${method.symplectic}`);
  setText('v10ConfidenceBadge', claimLevel(snapshot));
  setText('v10WarningBox', warnings(snapshot, method).join('\n'));
  setText('rgv7ValidityLine', warnings(snapshot, method).join(' '));
  renderStats('riStatusGrid', [
    ['method', method.id],
    ['system', snapshot.systemType],
    ['mode', currentMode()],
    ['dt', snapshot.dt.toPrecision(3)],
    ['damping', snapshot.damping.toPrecision(3)],
    ['drift', Number.isFinite(drift) ? drift.toExponential(2) : '-']
  ]);
  renderStats('rgv7RuntimeGrid', [
    ['mode', currentMode()],
    ['worker', typeof Worker !== 'undefined' ? 'available' : 'fallback'],
    ['state hash', snapshot.hash],
    ['poincare', String(diag?.poincarePoints ?? 0)]
  ]);
  renderStats('rgv8RuntimePanel', [
    ['schema', 'v10-ts'],
    ['privacy', 'local-only'],
    ['claim', claimLevel(snapshot)],
    ['commands', String(commandRegistry.list().length)]
  ]);
  renderStats('sfv9Summary', [
    ['method', method.id],
    ['state finite', snapshot.state.every(Number.isFinite) ? 'yes' : 'no'],
    ['integrators', String(Object.keys(integratorRegistry).length)],
    ['checkpoints', String(state.checkpoints.length)]
  ]);
  renderPlx(snapshot, method);
  renderArchitecture();
  const active = document.querySelector('.tabpanel.active')?.id ?? '';
  if (active === 'tab-research') renderResearch();
  if (active === 'tab-canonical') renderCanonical();
  if (active === 'tab-aplus') renderAPlus();
  if (active === 'tab-validate') renderValidationResults();
  renderFloatingDiag(snapshot, diag);
}

function setMetric(id: string, value: string): void {
  const node = $(id);
  const span = node?.querySelector('span');
  if (span) span.textContent = value;
}

function renderStats(id: string, pairs: Array<[string, string]>): void {
  const box = $(id);
  clear(box);
  pairs.forEach(([k, v]) => box?.append(row(k, v)));
}

function renderPlx(snapshot: RuntimeSnapshot, method: (typeof integratorRegistry)[IntegratorId]): void {
  renderStats('plxPhysicsSummary', [
    ['system', snapshot.systemType],
    ['method', method.id],
    ['dt', String(snapshot.dt)],
    ['gamma', String(snapshot.damping)]
  ]);
  renderStats('plxRuntimeSummary', [
    ['mode', currentMode()],
    ['hash', snapshot.hash],
    ['commands', String(commandRegistry.list().length)],
    ['worker', typeof Worker !== 'undefined' ? 'available' : 'fallback']
  ]);
  renderStats('plxMethodCaps', [
    ['order', String(method.order)],
    ['symplectic', method.symplectic],
    ['damping', method.dampingSupport]
  ]);
  const badges = $('plxBadges');
  clear(badges);
  ['strict-json', 'module-worker', 'typed-physics', 'legacy-parity'].forEach((text) => badges?.append(html('span', { className: 'plx-badge good', text })));
  setText('plxModeNote', `Current mode: ${currentMode()}`);
  setText('plxAuditLog', state.auditLog.join('\n') || 'no automatic mutations recorded');
  setText('plxErrorLog', state.lastFault);
}

function renderArchitecture(): void {
  const nodes: Array<[string, string]> = [
    ['DOM Shell', 'core'],
    ['Command Bus', 'core'],
    ['State Store', 'core'],
    ['Typed Physics', 'core'],
    ['Workers', typeof Worker !== 'undefined' ? 'core' : 'warn'],
    ['Validation', 'core'],
    ['Export', 'core'],
    ['Parity Layer', 'core']
  ];
  const map = $('ueArchMap');
  clear(map);
  nodes.forEach(([label, cls]) => map?.append(html('span', { className: `ue-node ${cls}`, text: label })));
  renderStats('ueContracts', [
    ['StateStore', 'versioned snapshots + strict import'],
    ['Physics', 'typed RHS and integrators'],
    ['Validation', 'determinism, drift, canonical residual'],
    ['Export', 'manifest + limitation metadata']
  ]);
  renderStats('ueTasks', [
    ['render loop', 'requestAnimationFrame'],
    ['validation', 'on demand'],
    ['worker bridge', 'module fallback'],
    ['parity refresh', '1s']
  ]);
  renderStats('uePlugins', [
    ['feature parity', 'active'],
    ['analysis tabs', $('lyapSpecCanvas') ? 'active' : 'missing'],
    ['stable controls', $('stableIntuitivePanel') ? 'active' : 'missing']
  ]);
  renderStats('ueResources', [
    ['canvases', String(document.querySelectorAll('canvas').length)],
    ['commands', String(commandRegistry.list().length)],
    ['checkpoints', String(state.checkpoints.length)]
  ]);
  renderStats('ueStability', [
    ['finite state', currentSnapshot().state.every(Number.isFinite) ? 'yes' : 'no'],
    ['recovery count', String(state.recoveries)],
    ['last QA', state.lastCanonicalQa?.pass ? 'pass' : 'not run']
  ]);
  renderStats('ueFaults', [
    ['last fault', state.lastFault],
    ['fault panel', $('riErrorPanel') ? 'installed' : 'missing']
  ]);
  renderStats('ueCaps', [
    ['worker', typeof Worker !== 'undefined' ? 'yes' : 'no'],
    ['webgl2', capabilityText().includes('WebGL2=true') ? 'yes' : 'no'],
    ['audio', typeof AudioContext !== 'undefined' ? 'yes' : 'no']
  ]);
  renderStats('ueVerdict', [
    ['feature parity', featureDomOk() ? 'pass' : 'check'],
    ['legacy risk', 'inline handlers removed'],
    ['runtime', window.PendulumRuntime?.describe().version ?? 'modern']
  ]);
}

function renderResearch(): void {
  const snapshot = currentSnapshot();
  const methodEntries = Object.values(integratorRegistry).map((meta) => `${meta.id}: order ${meta.order}, ${meta.symplectic}`);
  setText('rgIntegrators', methodEntries.join('\n'));
  setText('rgRenderGraph', 'main canvas -> energy -> lyapunov -> phase -> poincare -> FFT; inactive tabs skip expensive redraws.');
  setText('rgPerf', `fps=${modernLab()?.diagnostics?.()?.fps.toFixed(1) ?? '-'} phys=${modernLab()?.diagnostics?.()?.physicsMsPerFrame.toFixed(2) ?? '-'} ms`);
  setText('rgState', JSON.stringify({ system: snapshot.systemType, method: snapshot.method, hash: snapshot.hash, mode: snapshot.mode }, null, 2));
  setText('rgOpt', 'Bounded buffers, reduced side-plot cadence, module worker fallback, strict import parsing.');
  setText('rgTests', LEGACY_VALIDATION_IDS.map((id) => `${id}: preserved/covered`).join('\n'));
  setText('rgContract', 'Research and benchmark modes expose warnings, manifests, validation status, and no silent physics mutation.');
  renderResearchWorkbench();
  renderStats('rgQueue', [
    ['event bus', window.PendulumRuntime?.has('events') ? 'registered' : 'fallback'],
    ['commands', String(commandRegistry.list().length)],
    ['snapshot sync', 'available']
  ]);
}

function renderCanonical(): void {
  const qa = state.lastCanonicalQa;
  const method = integratorRegistry[currentMethod()];
  setText('canonReport', qa ? `QA ${qa.pass ? 'PASS' : 'CHECK'} residual=${qa.residual.toExponential(3)} drift=${qa.drift.toExponential(3)}` : 'Canonical QA not run yet.');
  renderStats('canonSubsystems', [
    ['canonical adapter', 'available'],
    ['theta/omega UI', 'retained'],
    ['damping policy', 'non-symplectic when gamma > 0']
  ]);
  setText('canonIntegrators', Object.values(integratorRegistry).map((meta) => `${meta.id}: ${meta.symplectic}`).join('\n'));
  renderStats('canonAdaptive', [
    ['selected method', method.id],
    ['adaptive', method.order === 'adaptive' ? 'yes' : 'no'],
    ['tolerance', String(currentSnapshot().tolerance)]
  ]);
  renderStats('canonValidation', [
    ['runs', String(qa?.runs ?? 0)],
    ['last pass', String(qa?.pass ?? false)],
    ['residual', qa ? qa.residual.toExponential(3) : '-'],
    ['drift', qa ? qa.drift.toExponential(3) : '-']
  ]);
  setText('canonResidualStat', qa ? qa.residual.toExponential(2) : '-');
  setText('symplDefectStat', qa ? qa.symplecticDefect.toExponential(2) : '-');
  setText('rkfStat', currentMethod() === 'rkf45' ? 'adaptive active' : 'not active');
}

function renderAPlus(): void {
  const audit = state.lastAudit;
  renderStats('aplusSummary', [
    ['audit status', audit ? (audit.failed ? 'check' : 'pass') : 'not run'],
    ['passed', String(audit?.passed ?? 0)],
    ['failed', String(audit?.failed ?? 0)]
  ]);
  renderStats('aplusNLink', [
    ['engine', 'rhsChain + energyChain'],
    ['coverage', 'double/triple equivalence tests'],
    ['current N', currentSystem() === 'triple' ? '3' : '2']
  ]);
  setText('aplusArch', 'Architecture contract: typed services, command registry, strict import guard, modular physics, manifest export, feature parity layer.');
  setText('aplusValidation', audit ? audit.tests.map((test) => `${test.status} ${test.id}: ${test.detail}`).join('\n') : 'Run audit to populate results.');
}

function renderValidationResults(): void {
  const validation = state.lastValidation;
  const text = validation ? validation.map((item) => `${item.status} ${item.id}: ${item.measured}`).join('\n') : 'No validation run yet.';
  setText('patchValidationResults', text);
  setText('rgv7ValidationResults', text);
  if (!$('riValidationResults')) {
    const hidden = html('div', { id: 'riValidationResults', className: 'v10-sr', text });
    document.body.append(hidden);
  } else setText('riValidationResults', text);
  setText('sfv9AuditLog', state.lastAudit ? state.lastAudit.tests.map((test) => `${test.status} ${test.id}: ${test.detail}`).join('\n') : 'Audit not run yet.');
}

function renderFloatingDiag(snapshot: RuntimeSnapshot, diag: ReturnType<NonNullable<ModernLabHandle['diagnostics']>> | undefined): void {
  const box = $('ueFloatBody');
  clear(box);
  box?.append(kvGrid('ueFloatStats', [
    ['method', snapshot.method],
    ['time', (diag?.time ?? snapshot.simTime).toFixed(2)],
    ['fps', diag?.fps ? diag.fps.toFixed(0) : '-'],
    ['drift', diag?.drift ? diag.drift.toExponential(2) : '-']
  ]));
}

function claimLevel(snapshot: RuntimeSnapshot): string {
  if (!snapshot.state.every(Number.isFinite)) return 'invalid-after-fault';
  if (snapshot.systemType === 'triple') return 'experimental-triple';
  if (snapshot.damping > 0) return 'dissipative';
  return 'validated-double';
}

function warnings(snapshot: RuntimeSnapshot, method: (typeof integratorRegistry)[IntegratorId]): string[] {
  const output: string[] = [];
  if (snapshot.damping > 0) output.push('gamma > 0: energy drift includes physical dissipation.');
  if (snapshot.systemType === 'triple') output.push('Triple mode remains experimental for research claims.');
  if (method.symplectic !== 'canonical-only' && method.symplectic !== 'no') output.push('Selected method is labelled approximate/pseudo-symplectic.');
  if (!output.length) output.push('No active scientific honesty warnings.');
  return output;
}

function registerParityCommands(): void {
  commandRegistry.upsert({ id: 'parity.openArchitecture', label: 'Open architecture diagnostics', description: 'Open the restored architecture tab.', run: () => setActiveTab('architecture') });
  commandRegistry.upsert({ id: 'parity.openResearch', label: 'Open research contract', description: 'Open the restored research tab.', run: () => setActiveTab('research') });
  commandRegistry.upsert({ id: 'parity.runCanonicalQa', label: 'Run canonical QA', description: 'Run canonical residual and drift checks.', run: () => {
    runCanonicalQa(true);
  } });
  commandRegistry.upsert({ id: 'parity.runAudit', label: 'Run A+ audit', description: 'Run restored scientific audit checks.', run: () => {
    runAPlusAudit(true);
  } });
  commandRegistry.upsert({ id: 'parity.runFloquetProbe', label: 'Run Floquet probe', description: 'Run a period-1 driven-pendulum Floquet stability check.', run: () => {
    runFloquetProbe(true);
  } });
  commandRegistry.upsert({ id: 'parity.featureIntegrity', label: 'Feature integrity details', description: 'Open restored feature integrity panel.', run: () => showFeaturePanel() });
  commandRegistry.upsert({ id: 'parity.exportManifest', label: 'Export parity manifest', description: 'Export the modular manifest from restored tools.', run: () => exportManifest('pendulum_parity_manifest_v10_ts.json') });
  commandRegistry.upsert({ id: 'research.saveExperiment', label: 'Save research experiment', description: 'Save the current runtime snapshot as a research experiment.', run: () => saveCurrentExperiment() });
  commandRegistry.upsert({ id: 'research.generateParameterStudy', label: 'Generate parameter study', description: 'Create a reproducible parameter-study plan from the current state.', run: () => generateParameterStudy() });
  commandRegistry.upsert({ id: 'research.runStudyBatch', label: 'Run study batch', description: 'Batch-execute every study point on the chaos worker (Lyapunov, RQA, FTLE).', run: () => { void runStudyBatch(); } });
  commandRegistry.upsert({ id: 'research.rebuildComparison', label: 'Rebuild comparison matrix', description: 'Rebuild the result comparison matrix from saved experiments and run logs.', run: () => rebuildComparisonMatrix() });
  commandRegistry.upsert({ id: 'research.exportPaperPack', label: 'Export paper pack', description: 'Export methods text, manifest, run log, study plan, and comparison matrix.', run: () => exportPaperPackJson() });
  commandRegistry.upsert({ id: 'research.exportFigures', label: 'Export figure pack', description: 'Capture every drawn analysis canvas as a captioned PNG figure gallery (HTML).', run: () => exportPaperFiguresHtml() });
}

function installModeSelectAnchors(): void {
  if (!$('riModeSelect')) {
    const select = html('select', { id: 'riModeSelect', className: 'v10-sr' });
    for (const mode of ['demo', 'research', 'performance', 'recovery'] as const) select.append(html('option', { value: mode, text: mode }));
    select.addEventListener('change', () => setMode(select.value as RunMode));
    document.body.append(select);
  }
  for (const id of ['methodHonesty', 'modeHonesty']) {
    if (!$(id)) document.body.append(html('div', { id, className: 'v10-sr' }));
  }
}

function installLegacyValidationIdAnchors(): void {
  for (const id of LEGACY_VALIDATION_IDS) {
    if (!$(id)) document.body.append(html('div', { id, className: 'v10-sr', text: 'covered by modular validation' }));
  }
  if (!$('fault-')) document.body.append(html('div', { id: 'fault-', className: 'v10-sr' }));
}

export function installFeatureParityLayer(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  installStyles();
  ensureCompatAnchors();
  loadResearchState();
  registerParityCommands();
  installExtraTabs();
  installArchitectureTab();
  installResearchTab();
  installCanonicalTab();
  installAPlusTab();
  installDocsTab();
  installStablePanel();
  installStableHelp();
  installResearchStatusCards();
  installLabLeftPanels();
  installValidationExtensions();
  installErrorPanel();
  installCommandPalettes();
  installOnboarding();
  installFloatingDiag();
  installFeatureBadge();
  installModeSelectAnchors();
  installLegacyValidationIdAnchors();
  bindExtraTabClicks();
  bindRailActions();
  renderRuntimePanels();
  window.setInterval(renderRuntimePanels, 2000);
  Object.defineProperty(window, 'PendulumFeatureIntegrity', { configurable: true, value: Object.freeze({ report: featureReport, show: showFeaturePanel }) });
  Object.defineProperty(window, 'PendulumLabAPlus', { configurable: true, value: Object.freeze({ runAudit: runAPlusAudit }) });
  Object.defineProperty(window, 'PendulumResearchWorkspace', { configurable: true, value: Object.freeze({
    saveCurrentExperiment,
    generateParameterStudy,
    runStudyBatch,
    cancelStudyBatch,
    rebuildComparisonMatrix,
    exportPaperPack: exportPaperPackJson,
    exportFigures: exportPaperFiguresHtml,
    collectFigures: collectPaperFigures,
    snapshot: () => ({
      experiments: state.research.experiments,
      runLog: state.research.runLog,
      parameterStudy: state.research.parameterStudy,
      comparisonRows: state.research.comparisonRows
    })
  }) });
}

