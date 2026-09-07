import type { AnalysisDefinition } from '../contracts/catalog';
import { analysis } from './analyses-helpers';

export const physicalAnalyses: readonly AnalysisDefinition[] = [
  analysis({
    id: 'analysis:chimera',
    name: ['키메라 국소 일관성', 'Chimera local coherence'],
    module: 'src/chaos/chimera.ts',
    exports: ['chimeraDiagnostics'],
    stage: 15,
    description: [
      '원형 위상 배열의 국소 질서도로 일관·비일관 영역을 진단합니다.',
      'Diagnose coherent and incoherent regions from local order in a ring of phases.'
    ],
    inputs: [['phase-series', '동일 시점의 원형 네트워크 위상 배열.', 'Ring-network phase array at a common instant.']],
    parameters: [
      'ChimeraDiagnosticsOptions의 radius, coherentThreshold, incoherentThreshold.',
      'ChimeraDiagnosticsOptions radius, coherentThreshold and incoherentThreshold.'
    ],
    output: [
      'chimera-diagnostics',
      '국소 질서도와 일관·비일관 영역 비율.',
      'Local order and coherent/incoherent fractions.'
    ],
    cost: [
      '노드 수와 비국소 이웃 반경에 따라 증가합니다.',
      'Increases with node count and nonlocal neighborhood radius.'
    ],
    limitation: [
      '단일 위상 배열의 공간 진단이며 장시간 안정한 키메라 상태의 증명이 아닙니다.',
      'Spatial diagnostics on one phase array do not prove a long-lived stable chimera state.'
    ]
  }),
  analysis({
    id: 'analysis:lattice-dispersion',
    name: ['이원자 격자 분산', 'Diatomic lattice dispersion'],
    module: 'src/physics/latticeDispersion.ts',
    exports: ['diatomicDispersion', 'diatomicDispersionCurve'],
    stage: 16,
    description: [
      '이원자 조화 사슬의 음향·광학 분산 가지를 계산합니다.',
      'Compute acoustic and optical dispersion branches of a diatomic harmonic chain.'
    ],
    inputs: [
      [
        'lattice',
        'massA, massB, forceConstant, latticeConstant와 선택적 onsiteOmegaSq.',
        'massA, massB, forceConstant, latticeConstant and optional onsiteOmegaSq.'
      ]
    ],
    parameters: [
      'diatomicDispersion(k, DiatomicChainParams); 곡선 구성은 samples.',
      'diatomicDispersion(k, DiatomicChainParams); curve construction takes samples.'
    ],
    output: [
      'dispersion-branches',
      '음향·광학 각주파수 또는 파수별 곡선.',
      'Acoustic/optical angular frequencies or a curve over wavenumbers.'
    ],
    cost: [
      '한 파수의 해석식은 상수 비용, 곡선은 표본 수에 비례합니다.',
      'Constant cost per analytic wavenumber; linear in curve samples.'
    ],
    limitation: [
      '조화 이원자 사슬 공식이며 임의 비선형 격자나 결함 격자의 분산을 자동 계산하지 않습니다.',
      'A harmonic diatomic-chain formula; does not automatically solve arbitrary nonlinear or defective lattices.'
    ]
  }),
  analysis({
    id: 'analysis:fk-kink-pinning',
    name: ['FK 킨크 고정 장벽', 'FK kink pinning barrier'],
    module: 'src/physics/sineGordon.ts',
    exports: ['peierlsNabarroBarrier', 'relaxFrenkelKontorovaKink'],
    stage: 16,
    description: [
      '정적 이산 FK 킨크를 두 중심 위치에서 완화하여 에너지 차이를 구합니다.',
      'Relax static discrete FK kinks at two center positions and compare energies.'
    ],
    inputs: [
      [
        'parameters',
        '양의 FK 결합 상수와 고정 경계 사슬 설정.',
        'Positive FK coupling constant and fixed-boundary chain settings.'
      ]
    ],
    scope: { systemIds: [] },
    parameters: [
      'coupling과 RelaxKinkOptions의 sites, maxIterations, tolerance.',
      'coupling and RelaxKinkOptions sites, maxIterations and tolerance.'
    ],
    output: [
      'peierls-nabarro-barrier',
      '격자점·결합 중심 에너지와 절대 에너지 차이.',
      'Site-centered/bond-centered energies and their absolute difference.'
    ],
    cost: [
      '두 정적 Newton 완화의 반복 수×격자점 수.',
      'Iteration count times sites for two static Newton relaxations.'
    ],
    limitation: [
      '독립 정적 이산 킨크 진단입니다. 연속 Sine-Gordon 상태나 조화 FK 근사의 자동 어댑터, 구동 탈고정 엔진을 제공하지 않습니다.',
      'A standalone static discrete-kink diagnostic. No automatic adapter from continuum Sine-Gordon states or harmonic FK limits, and no driven depinning engine.'
    ]
  }),
  analysis({
    id: 'analysis:kramers',
    name: ['Arrhenius 탈출 시간', 'Arrhenius escape time'],
    module: 'src/physics/kramersEscape.ts',
    exports: ['arrheniusMTTF'],
    stage: 16,
    description: [
      '시도율, 활성화 에너지와 열 에너지로 평균 탈출 시간을 계산합니다.',
      'Compute mean escape time from attempt rate, activation energy and thermal energy.'
    ],
    inputs: [
      [
        'parameters',
        '양의 attemptRate, 유한 activationEnergy와 양의 kT.',
        'Positive attemptRate, finite activationEnergy and positive kT.'
      ]
    ],
    parameters: [
      'arrheniusMTTF(attemptRate, activationEnergy, kT)의 단위 일관성 규약.',
      'Unit-consistent arrheniusMTTF(attemptRate, activationEnergy, kT) arguments.'
    ],
    output: ['escape-time', 'Arrhenius 평균 최초 탈출 시간.', 'Arrhenius mean first escape time.'],
    cost: ['상수 비용의 지수식 평가.', 'Constant-cost exponential evaluation.'],
    limitation: [
      '장벽과 시도율은 외부에서 주어져야 하며 실제 탈출 궤도 시뮬레이션이나 모든 잡음 영역의 정확식을 의미하지 않습니다.',
      'Barrier and attempt rate must be supplied; this is not an escape-trajectory simulation or an exact formula for every noise regime.'
    ]
  }),
  analysis({
    id: 'analysis:stochastic-resonance',
    name: ['확률 공명 응답', 'Stochastic resonance response'],
    module: 'src/physics/stochasticResonance.ts',
    exports: ['stochasticResonanceCurve'],
    stage: 16,
    description: [
      '주기 구동 과감쇠 사차 이중 우물에서 잡음 세기별 응답을 측정합니다.',
      'Measure response versus noise strength in a periodically driven overdamped quartic double well.'
    ],
    inputs: [
      [
        'parameters',
        'sigma를 제외한 BistableSrParameters와 실현 수.',
        'BistableSrParameters excluding sigma, and realization count.'
      ],
      ['parameter-grid', '평가할 유한 비음수 sigma 목록.', 'Finite nonnegative sigma values to evaluate.']
    ],
    scope: { systemIds: [] },
    parameters: [
      'base의 amplitude, driveOmega, dt, periods, seed와 sigmas, realizations.',
      'base amplitude, driveOmega, dt, periods, seed, plus sigmas and realizations.'
    ],
    output: [
      'resonance-curve',
      '응답 진폭, 구동 주파수 파워, 우물 점유와 전이 수.',
      'Response amplitude, drive-frequency power, well occupancy and transition count.'
    ],
    cost: [
      '잡음 값 수×실현 수×과도구간 포함 적분 단계 수.',
      'Noise values times realizations times integration steps including transients.'
    ],
    limitation: [
      '독립적인 내부 사차 SDE 진단으로 임의 Langevin 진자 궤도를 입력받지 않으므로 시스템 자동 제안을 제한합니다.',
      'A standalone internal quartic-SDE diagnostic; it does not accept arbitrary Langevin-pendulum trajectories, so automatic system suggestions are disabled.'
    ]
  })
];
