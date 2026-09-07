import { getSystem, selectLabCapabilities } from '../catalog/selectors';
import type { ExperimentStateV1 } from '../contracts/experiment';
import { validateExperimentState } from '../contracts/experiment-validation';
import { createMockAdapter, MOCK_TOTAL_TICKS, type MockAdapter } from './mock-adapter';
import { getLabSchema, validateLabFields } from './schema';

export { getLabSchema } from './schema';
export type { LabField, LabSchema } from './schema';

export type LabStatus = 'empty' | 'ready' | 'preparing' | 'running' | 'paused' | 'completed' | 'cancelled' | 'error';

export interface LabSettings {
  readonly systemId: `system:${string}` | null;
  readonly fields: Readonly<Record<string, string>>;
  readonly integratorId: `integrator:${string}` | null;
  readonly analysisIds: readonly `analysis:${string}`[];
  /** Preserved transport only: S06 does not interpret adapter-defined quantity names. */
  readonly sourceExperiment: ExperimentStateV1 | null;
}

export interface LabTrayEntry {
  readonly id: string;
  readonly systemId: `system:${string}`;
  readonly label: string;
  readonly settings: LabSettings;
  readonly tick: number;
  readonly status: LabStatus;
}

export interface LabState extends LabSettings {
  readonly status: LabStatus;
  readonly tick: number;
  readonly error: string | null;
  readonly fieldErrors: Readonly<Record<string, string>>;
  readonly tray: readonly LabTrayEntry[];
}

export interface LabModelOptions {
  readonly systemId?: string;
  readonly experiment?: ExperimentStateV1;
  readonly adapter?: MockAdapter;
}

function settingsOf(state: LabSettings): LabSettings {
  return structuredClone({
    systemId: state.systemId,
    fields: state.fields,
    integratorId: state.integratorId,
    analysisIds: state.analysisIds,
    sourceExperiment: state.sourceExperiment
  });
}

/** In-document session state only. No physical runtime, worker, storage or canonical migration. */
export function createLabModel(options: LabModelOptions = {}) {
  const adapter = options.adapter ?? createMockAdapter();
  const listeners = new Set<(state: LabState) => void>();
  let state: LabState = {
    systemId: null,
    fields: {},
    integratorId: null,
    analysisIds: [],
    sourceExperiment: null,
    status: 'empty',
    tick: 0,
    error: null,
    fieldErrors: {},
    tray: []
  };
  let job: { cancel(): void } | undefined;
  let generation = 0;
  let traySequence = 0;
  let disposed = false;

  const snapshot = (): LabState => structuredClone(state);
  const emit = () => {
    if (!disposed) for (const listener of listeners) listener(snapshot());
  };
  const stop = () => {
    generation += 1;
    job?.cancel();
    job = undefined;
  };
  const update = (patch: Partial<LabState>) => {
    state = { ...state, ...patch };
    emit();
  };
  const isBusy = () => state.status === 'running' || state.status === 'preparing';
  const selected = () => (state.systemId ? getSystem(state.systemId) : undefined);

  function selectSystem(id: string): boolean {
    const system = getSystem(id);
    if (disposed || !system) return false;
    stop();
    const capabilities = selectLabCapabilities(system);
    const integrator =
      capabilities.integrators.find((entry) => entry.id === 'integrator:rk4') ?? capabilities.integrators[0];
    update({
      systemId: system.id,
      fields: Object.fromEntries(getLabSchema(system).fields.map((field) => [field.id, String(field.defaultValue)])),
      integratorId: integrator?.id ?? null,
      analysisIds: [],
      sourceExperiment: null,
      status: 'ready',
      tick: 0,
      error: null,
      fieldErrors: {}
    });
    return true;
  }

  function validate(): boolean {
    const system = selected();
    if (disposed || !system) return false;
    const fieldErrors = validateLabFields(getLabSchema(system), state.fields);
    const capabilities = selectLabCapabilities(system);
    if (
      system.stepping.kind === 'selectable' &&
      !capabilities.integrators.some((entry) => entry.id === state.integratorId)
    ) {
      fieldErrors.integrator = '이 시스템에 호환되는 적분기를 선택하세요.';
    }
    if (state.analysisIds.some((id) => !capabilities.analyses.some((entry) => entry.id === id))) {
      fieldErrors.analyses = '이 시스템에 호환되는 분석을 선택하세요.';
    }
    if (Object.keys(fieldErrors).length) {
      stop();
      update({ fieldErrors, status: 'error', error: '입력 설정을 확인하세요.' });
      return false;
    }
    return true;
  }

  function edit(patch: Partial<LabSettings>): void {
    stop();
    state = { ...state, ...patch };
    const system = selected();
    const fieldErrors = system ? validateLabFields(getLabSchema(system), state.fields) : {};
    update({ status: 'ready', tick: 0, error: null, fieldErrors });
  }

  function start(fail: boolean): boolean {
    if (disposed || isBusy() || !validate()) return false;
    const fromTick = state.status === 'paused' ? state.tick : 0;
    stop();
    const active = generation;
    const current = () => !disposed && generation === active;
    update({ status: 'preparing', tick: fromTick, error: null, fieldErrors: {} });
    try {
      const started = adapter.start({
        fromTick,
        fail,
        onReady: () => {
          if (current()) update({ status: 'running' });
        },
        onTick: (tick) => {
          if (current() && Number.isInteger(tick) && tick > state.tick && tick <= MOCK_TOTAL_TICKS) update({ tick });
        },
        onComplete: () => {
          if (current()) {
            stop();
            update({ status: 'completed', tick: MOCK_TOTAL_TICKS });
          }
        },
        onError: (message) => {
          if (current()) {
            stop();
            update({ status: 'error', error: message });
          }
        }
      });
      if (current()) job = started;
      else started.cancel();
    } catch {
      if (current()) {
        stop();
        update({ status: 'error', error: '모의 실행을 시작하지 못했습니다. 다시 실행하세요.' });
      }
      return false;
    }
    return true;
  }

  const model = {
    get state(): LabState {
      return snapshot();
    },
    subscribe(listener: (state: LabState) => void): () => void {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    selectSystem,
    setField(id: string, raw: string): boolean {
      const system = selected();
      if (disposed || !system || isBusy() || !getLabSchema(system).fields.some((field) => field.id === id))
        return false;
      edit({ fields: { ...state.fields, [id]: raw } });
      return true;
    },
    setIntegrator(id: string): boolean {
      const system = selected();
      if (disposed || !system || isBusy()) return false;
      const integrator = selectLabCapabilities(system).integrators.find((entry) => entry.id === id);
      if (!integrator) return false;
      edit({ integratorId: integrator.id });
      return true;
    },
    toggleAnalysis(id: string): boolean {
      const system = selected();
      if (disposed || !system || isBusy()) return false;
      const analysis = selectLabCapabilities(system).analyses.find((entry) => entry.id === id);
      if (!analysis) return false;
      edit({
        analysisIds: state.analysisIds.includes(analysis.id)
          ? state.analysisIds.filter((entry) => entry !== analysis.id)
          : [...state.analysisIds, analysis.id]
      });
      return true;
    },
    prepare(): boolean {
      if (isBusy() || !validate()) return false;
      stop();
      update({ status: 'ready', tick: 0, error: null, fieldErrors: {} });
      return true;
    },
    run: () => start(false),
    simulateError: () => start(true),
    pause(): boolean {
      if (disposed || state.status !== 'running') return false;
      stop();
      update({ status: 'paused' });
      return true;
    },
    step(): boolean {
      if (disposed || isBusy() || !validate()) return false;
      stop();
      const tick = (state.status === 'paused' ? state.tick : 0) + 1;
      update({ status: tick >= MOCK_TOTAL_TICKS ? 'completed' : 'paused', tick, error: null, fieldErrors: {} });
      return true;
    },
    reset(): boolean {
      if (disposed || !selected()) return false;
      stop();
      update({ status: 'ready', tick: 0, error: null });
      return true;
    },
    cancel(): boolean {
      if (disposed || !['preparing', 'running', 'paused'].includes(state.status)) return false;
      stop();
      update({ status: 'cancelled', error: null });
      return true;
    },
    saveToTray(): string | null {
      const system = selected();
      if (disposed || !system || isBusy() || !validate()) return null;
      if (state.tray.length >= 12) {
        update({ error: '보관함에 모의 설정 12개가 있습니다. 항목을 삭제한 뒤 다시 담아 주세요.' });
        return null;
      }
      const id = `mock-run-${++traySequence}`;
      const entry: LabTrayEntry = {
        id,
        systemId: system.id,
        label: `${system.name.ko} · ${traySequence}`,
        settings: settingsOf(state),
        tick: state.tick,
        status: state.status
      };
      update({ tray: [entry, ...state.tray], error: null });
      return id;
    },
    restoreTray(id: string): boolean {
      const entry = state.tray.find((candidate) => candidate.id === id);
      if (disposed || !entry) return false;
      stop();
      update({ ...settingsOf(entry.settings), status: 'ready', tick: 0, error: null, fieldErrors: {} });
      return true;
    },
    removeTray(id: string): boolean {
      if (disposed || !state.tray.some((entry) => entry.id === id)) return false;
      update({ tray: state.tray.filter((entry) => entry.id !== id) });
      return true;
    },
    exportSettings(): string | null {
      if (disposed || isBusy() || !validate()) return null;
      return JSON.stringify(
        {
          schema: 'pendulum-lab-mock/v1',
          mode: 'mock',
          scientificResults: false,
          notice:
            '설정 화면과 실행 흐름을 확인하는 모의 기록입니다. 실제 궤적·분석 결과가 아니며 canonical 실험 가져오기용 파일이 아닙니다.',
          settings: settingsOf(state),
          run: { status: state.status, tick: state.tick, totalTicks: MOCK_TOTAL_TICKS }
        },
        null,
        2
      );
    },
    dispose(): void {
      stop();
      disposed = true;
      listeners.clear();
    }
  };

  if (options.experiment) {
    const checked = validateExperimentState(options.experiment);
    if (!checked.ok) throw new Error('A shared experiment must pass the canonical contract before entering the Lab.');
    if (options.systemId && options.systemId !== checked.value.systemId)
      throw new Error('The shared experiment system must match its route.');
    selectSystem(checked.value.systemId);
    state = { ...state, sourceExperiment: structuredClone(checked.value) };
  } else if (options.systemId && !selectSystem(options.systemId)) {
    throw new Error('The laboratory requires a registered system.');
  }
  return model;
}

export type LabModel = ReturnType<typeof createLabModel>;
