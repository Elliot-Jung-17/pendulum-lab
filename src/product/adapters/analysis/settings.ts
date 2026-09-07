import type { AnalysisState } from '../../contracts/experiment';
import type { CanonicalUnit, QuantityValue } from '../../contracts/quantities';
import type { PlanarConfig } from '../physics/planar';

export const PLANAR_ANALYSIS_VERSION = 'planar-analysis-v1';
export const PLANAR_ANALYSIS_LIMITS = { steps: 100_000, points: 2_000, duration: 300 } as const;
export type PlanarAnalysisKind = 'poincare' | 'lyapunov';

export interface PlanarPoincareSettings {
  duration: number;
  sectionIndex: 0 | 1;
  sectionValue: number;
  direction: 'rising' | 'falling' | 'both';
  transientCrossings: number;
  maxPoints: number;
}

export interface PlanarLyapunovSettings {
  duration: number;
  transient: number;
  renormEvery: number;
  seed: number;
}

export type PlanarAnalysisSettings = PlanarPoincareSettings | PlanarLyapunovSettings;

export function defaultPlanarAnalysisSettings(kind: 'poincare', config: PlanarConfig): PlanarPoincareSettings;
export function defaultPlanarAnalysisSettings(kind: 'lyapunov', config: PlanarConfig): PlanarLyapunovSettings;
export function defaultPlanarAnalysisSettings(kind: PlanarAnalysisKind, config: PlanarConfig): PlanarAnalysisSettings;
export function defaultPlanarAnalysisSettings(kind: PlanarAnalysisKind, config: PlanarConfig): PlanarAnalysisSettings {
  return kind === 'poincare'
    ? {
        duration: config.duration,
        sectionIndex: 0,
        sectionValue: 0,
        direction: 'rising',
        transientCrossings: 0,
        maxPoints: 2000
      }
    : {
        duration: config.duration,
        transient: 0,
        renormEvery: Math.min(10, Math.ceil(config.duration / config.step)),
        seed: 40503
      };
}

function finiteRange(value: unknown, min: number, max: number, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name}: ${min}–${max} 범위의 유한한 수를 입력하세요.`);
  }
}

function integerRange(value: unknown, min: number, max: number, name: string): void {
  finiteRange(value, min, max, name);
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name}: 정수를 입력하세요.`);
}

function fields(input: unknown, names: readonly string[], name: string): asserts input is Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new TypeError(`${name}: 설정 객체가 필요합니다.`);
  const keys = Object.keys(input);
  if (keys.length !== names.length || keys.some((key) => !names.includes(key))) {
    throw new TypeError(`${name}: 누락되었거나 지원하지 않는 설정이 있습니다.`);
  }
}

export function validatePlanarAnalysisSettings(
  kind: PlanarAnalysisKind,
  settings: unknown,
  config: PlanarConfig
): void {
  fields(
    settings,
    kind === 'poincare'
      ? ['duration', 'sectionIndex', 'sectionValue', 'direction', 'transientCrossings', 'maxPoints']
      : ['duration', 'transient', 'renormEvery', 'seed'],
    kind
  );
  finiteRange(settings.duration, config.step, PLANAR_ANALYSIS_LIMITS.duration, '분석 기간 (s)');
  const steps = Math.ceil(settings.duration / config.step);
  let transientSteps = 0;
  if (kind === 'poincare') {
    integerRange(settings.sectionIndex, 0, 1, '단면 좌표');
    finiteRange(settings.sectionValue, -100 * Math.PI, 100 * Math.PI, '단면 각도 (rad)');
    if (!['rising', 'falling', 'both'].includes(String(settings.direction)))
      throw new RangeError('단면 방향이 유효하지 않습니다.');
    integerRange(settings.transientCrossings, 0, PLANAR_ANALYSIS_LIMITS.points, '제외할 교차 수');
    integerRange(settings.maxPoints, 1, PLANAR_ANALYSIS_LIMITS.points, '최대 단면 점 수');
  } else {
    finiteRange(settings.transient, 0, PLANAR_ANALYSIS_LIMITS.duration, '과도 구간 (s)');
    transientSteps = Math.ceil(settings.transient / config.step);
    integerRange(settings.renormEvery, 1, Math.min(steps, 10_000), '재규격화 간격 (step)');
    integerRange(settings.seed, 0, 0xffffffff, '교란 seed');
  }
  if (!Number.isSafeInteger(steps + transientSteps) || steps + transientSteps > PLANAR_ANALYSIS_LIMITS.steps) {
    throw new RangeError(
      `분석 계산량은 ${PLANAR_ANALYSIS_LIMITS.steps} step 이하여야 합니다. 기간을 줄이거나 시간 간격을 늘리세요.`
    );
  }
}

const scalar = (value: number, unit: CanonicalUnit): QuantityValue => ({ kind: 'scalar', value, unit });

/** The analysis settings are persisted independently of animation/run state. */
export function toPlanarAnalysisState(kind: PlanarAnalysisKind, settings: PlanarAnalysisSettings): AnalysisState {
  if (kind === 'poincare') {
    const s = settings as PlanarPoincareSettings;
    return {
      id: 'analysis:poincare',
      algorithmVersion: PLANAR_ANALYSIS_VERSION,
      settings: {
        duration: scalar(s.duration, 's'),
        sectionAngle: scalar(s.sectionValue, 'rad'),
        transientCrossings: scalar(s.transientCrossings, '1'),
        maxPoints: scalar(s.maxPoints, '1')
      },
      options: { coordinate: s.sectionIndex === 0 ? 'theta1' : 'theta2', direction: s.direction }
    };
  }
  const s = settings as PlanarLyapunovSettings;
  return {
    id: 'analysis:lyapunov',
    algorithmVersion: PLANAR_ANALYSIS_VERSION,
    settings: {
      duration: scalar(s.duration, 's'),
      transient: scalar(s.transient, 's'),
      renormEvery: scalar(s.renormEvery, '1'),
      seed: scalar(s.seed, '1')
    }
  };
}

export function fromPlanarAnalysisState(analysis: AnalysisState, config: PlanarConfig): PlanarAnalysisSettings {
  if (analysis.algorithmVersion !== PLANAR_ANALYSIS_VERSION)
    throw new RangeError('지원하지 않는 분석 알고리즘 버전입니다. 원본 설정을 확인하세요.');
  if (analysis.id !== 'analysis:poincare' && analysis.id !== 'analysis:lyapunov')
    throw new RangeError('이 분석은 S07 실행 범위가 아닙니다.');
  const read = (key: string, unit: CanonicalUnit): number => {
    const q = analysis.settings[key];
    if (q?.kind !== 'scalar' || q.unit !== unit || !Number.isFinite(q.value))
      throw new RangeError(`${key}: ${unit} 단위의 유한한 scalar가 필요합니다.`);
    return q.value;
  };
  let settings: PlanarAnalysisSettings;
  const kind = analysis.id === 'analysis:poincare' ? 'poincare' : 'lyapunov';
  if (kind === 'poincare') {
    fields(analysis.settings, ['duration', 'sectionAngle', 'transientCrossings', 'maxPoints'], kind);
    fields(analysis.options, ['coordinate', 'direction'], kind);
    if (!['theta1', 'theta2'].includes(String(analysis.options.coordinate)))
      throw new RangeError('단면 좌표가 유효하지 않습니다.');
    settings = {
      duration: read('duration', 's'),
      sectionIndex: analysis.options.coordinate === 'theta1' ? 0 : 1,
      sectionValue: read('sectionAngle', 'rad'),
      direction: analysis.options.direction as PlanarPoincareSettings['direction'],
      transientCrossings: read('transientCrossings', '1'),
      maxPoints: read('maxPoints', '1')
    };
  } else {
    fields(analysis.settings, ['duration', 'transient', 'renormEvery', 'seed'], kind);
    if (analysis.options && Object.keys(analysis.options).length)
      throw new RangeError('지원하지 않는 Lyapunov 옵션입니다.');
    settings = {
      duration: read('duration', 's'),
      transient: read('transient', 's'),
      renormEvery: read('renormEvery', '1'),
      seed: read('seed', '1')
    };
  }
  validatePlanarAnalysisSettings(kind, settings, config);
  return settings;
}
