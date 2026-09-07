import { maximalLyapunov, type MaximalLyapunovResult } from '../../../chaos/lyapunov';
import { poincareSection, type PoincareResult } from '../../../chaos/poincare';
import type { Derivative } from '../../../physics/types';
import { createPlanarDerivative, type PlanarConfig, type PlanarSample } from '../physics/planar';
import {
  defaultPlanarAnalysisSettings,
  validatePlanarAnalysisSettings,
  type PlanarAnalysisKind,
  type PlanarAnalysisSettings,
  type PlanarLyapunovSettings,
  type PlanarPoincareSettings
} from './settings';

export * from './settings';

export interface PlanarAnalysisRequest {
  id: string;
  kind: PlanarAnalysisKind;
  config: PlanarConfig;
  settings?: PlanarAnalysisSettings;
}

export type PlanarAnalysisResult =
  | {
      kind: 'poincare';
      data: Omit<PoincareResult, 'points'> & { points: number[][] };
      settings: PlanarPoincareSettings;
      method: 'rk4';
      warnings: string[];
    }
  | {
      kind: 'lyapunov';
      data: MaximalLyapunovResult;
      settings: PlanarLyapunovSettings;
      method: string;
      warnings: string[];
    };

export interface PlanarAnalysisProgress {
  /** null = indeterminate. Poincare root-refinement work is data-dependent. */
  fraction: number | null;
  /** Actual derivative evaluations completed, never elapsed-time simulation. */
  work: number;
  phase: 'calculating' | 'complete';
}

export type PlanarAnalysisEvent =
  | ({ type: 'progress'; id: string } & PlanarAnalysisProgress)
  | { type: 'result'; id: string; result: PlanarAnalysisResult }
  | { type: 'error'; id: string; message: string }
  | { type: 'cancelled'; id: string };

/** Plot columns are projections of the actual engine samples, with SI units. */
export function analyzePlanarTrajectory(samples: readonly PlanarSample[]) {
  if (samples.length > 100_001) throw new RangeError('궤적 표본 수가 100001개를 초과했습니다.');
  let previousTime = -Infinity;
  for (const sample of samples) {
    if (
      !Number.isFinite(sample.time) ||
      sample.time <= previousTime ||
      sample.state.length !== 4 ||
      !sample.state.every(Number.isFinite) ||
      ![sample.energy.total, sample.energy.KE, sample.energy.PE].every(Number.isFinite)
    ) {
      throw new RangeError('궤적의 시간은 증가해야 하며 상태와 에너지는 유한해야 합니다.');
    }
    previousTime = sample.time;
  }
  return {
    stateTime: samples.map((s) => ({
      time: s.time,
      theta1: s.state[0]!,
      theta2: s.state[1]!,
      omega1: s.state[2]!,
      omega2: s.state[3]!
    })),
    energy: samples.map((s) => ({ time: s.time, total: s.energy.total, kinetic: s.energy.KE, potential: s.energy.PE })),
    phase: samples.map((s) => ({ theta1: s.state[0]!, omega1: s.state[2]!, theta2: s.state[1]!, omega2: s.state[3]! })),
    units: { time: 's', angle: 'rad', angularVelocity: 'rad/s', energy: 'J' } as const
  };
}

/**
 * Run only inside the dedicated worker in the product UI. Legacy numerical
 * routines are called unchanged; wrapping their RHS only observes work.
 */
export function runPlanarAnalysis(
  request: PlanarAnalysisRequest,
  progress: (value: PlanarAnalysisProgress) => void = () => {}
): PlanarAnalysisResult {
  if (
    !request ||
    typeof request.id !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(request.id) ||
    !['poincare', 'lyapunov'].includes(request.kind)
  ) {
    throw new TypeError('분석 작업 ID 또는 종류가 유효하지 않습니다.');
  }
  const originalRhs = createPlanarDerivative(request.config);
  const settings = request.settings ?? defaultPlanarAnalysisSettings(request.kind, request.config);
  validatePlanarAnalysisSettings(request.kind, settings, request.config);
  const dt = request.config.step;
  const lyap = settings as PlanarLyapunovSettings;
  const steps = Math.ceil(settings.duration / dt);
  const transientSteps = request.kind === 'lyapunov' ? Math.ceil(lyap.transient / dt) : 0;
  const method =
    request.config.integratorId === 'integrator:euler'
      ? 'euler'
      : request.config.integratorId === 'integrator:rk2'
        ? 'rk2'
        : 'rk4';
  const evaluationsPerStep = method === 'euler' ? 1 : method === 'rk2' ? 2 : 4;
  const expectedWork = (steps * 2 + transientSteps) * evaluationsPerStep;
  let work = 0;
  const interval = request.kind === 'lyapunov' ? Math.max(1, Math.ceil(expectedWork / 100)) : 1024;
  progress({ fraction: request.kind === 'lyapunov' ? 0 : null, work, phase: 'calculating' });
  const rhs: Derivative = (state, out) => {
    originalRhs(state, out);
    if (!out.every(Number.isFinite))
      throw new RangeError('분석 도중 비유한 운동 상태가 발생했습니다. 시간 간격과 초기조건을 확인하세요.');
    work += 1;
    if (work % interval === 0)
      progress({
        fraction: request.kind === 'lyapunov' ? Math.min(1, work / expectedWork) : null,
        work,
        phase: 'calculating'
      });
  };

  let result: PlanarAnalysisResult;
  if (request.kind === 'poincare') {
    const s = settings as PlanarPoincareSettings;
    const data = poincareSection(request.config.initialState, rhs, {
      section: (state) => state[s.sectionIndex]! - s.sectionValue,
      direction: s.direction,
      dt,
      maxTime: s.duration,
      transientCrossings: s.transientCrossings,
      maxPoints: s.maxPoints,
      rootTol: 1e-9
    });
    result = {
      kind: 'poincare',
      data: { ...data, points: data.points.map((p) => Array.from(p)) },
      settings: { ...s },
      method: 'rk4',
      warnings: [
        '원래 초기조건에서 별도 적분합니다. 단면은 감기지 않은 절대 각도이며, 선형 보간 대신 기존 RK4 사건 검출기의 근 찾기를 사용합니다.',
        ...(method !== 'rk4'
          ? ['단면 계산은 기존 사건 검출기의 RK4를 사용합니다. 애니메이션에서 선택한 적분기와 다릅니다.']
          : []),
        ...(data.points.length === 0
          ? ['설정한 기간과 방향에서 단면 교차가 없습니다. 기간, 각도 또는 방향을 확인하세요.']
          : []),
        ...(data.points.length === s.maxPoints ? ['최대 점 수에 도달하여 단면 계산을 종료했습니다.'] : [])
      ]
    };
  } else {
    const data = maximalLyapunov(request.config.initialState, rhs, {
      dt,
      steps,
      transientSteps,
      renormEvery: lyap.renormEvery,
      seed: lyap.seed,
      method
    });
    result = {
      kind: 'lyapunov',
      data,
      settings: { ...lyap },
      method,
      warnings: [
        '원래 초기조건에서 시작하는 유한시간 두 궤적 추정치입니다. 양수 하나만으로 카오스를 확정하지 마세요. 기간·시간 간격·과도 구간·재규격화 간격에 대한 수렴을 확인하세요.',
        '상태 좌표 (rad, rad/s)의 유클리드 거리를 사용합니다. SE와 CI는 유한 표본의 통계적 지표이며 적분 오차나 체계 오차를 포함하지 않습니다.',
        '실제 측정·과도 기간은 시간 간격의 정수 배로 올림됩니다. 결과 settings의 steps와 transientSteps를 확인하세요.'
      ]
    };
  }
  progress({ fraction: 1, work, phase: 'complete' });
  return result;
}

export function executePlanarAnalysisJob(
  request: PlanarAnalysisRequest,
  emit: (event: PlanarAnalysisEvent) => void
): void {
  const id = typeof request?.id === 'string' ? request.id.slice(0, 128) : 'invalid';
  try {
    const result = runPlanarAnalysis(request, (value) => emit({ type: 'progress', id, ...value }));
    emit({ type: 'result', id, result });
  } catch (error) {
    emit({
      type: 'error',
      id,
      message: error instanceof Error ? error.message.slice(0, 500) : '분석을 완료하지 못했습니다.'
    });
  }
}
