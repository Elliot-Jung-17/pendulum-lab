import type { IntegratorDefinition, LegacyBinding, LocalizedText } from '../contracts/catalog';

const l = (ko: string, en: string): LocalizedText => ({ ko, en });
const bind = (file: string, exportName: string): LegacyBinding => ({ module: `src/physics/${file}.ts`, exportName });

/** Existing RHS layouts that can use ordinary first-order ODE steppers. */
export const odeSystemIds = [
  'system:double',
  'system:compound-double',
  'system:triple',
  'system:chain',
  'system:spring',
  'system:spherical-chain',
  'system:driven',
  'system:coupled',
  'system:inverted',
  'system:cartpole',
  'system:parametric',
  'system:duffing',
  'system:van-der-pol',
  'system:kapitza',
  'system:magnetic',
  'system:pendulum-network',
  'system:kuramoto',
  'system:huygens-phase-pair'
] as const;

/** q/v layout permits the approximation; this list does not assert symplecticity. */
export const splitSystemIds = [
  'system:double',
  'system:compound-double',
  'system:triple',
  'system:chain',
  'system:spring',
  'system:spherical-chain',
  'system:coupled',
  'system:inverted',
  'system:cartpole',
  'system:van-der-pol',
  'system:magnetic',
  'system:pendulum-network'
] as const;

export const ordinaryIntegratorIds = [
  'integrator:euler',
  'integrator:rk2',
  'integrator:rk4',
  'integrator:hmidpoint',
  'integrator:gauss2',
  'integrator:rkf45',
  'integrator:dopri5',
  'integrator:dop853',
  'integrator:gbs',
  'integrator:bdf2'
] as const;
export const splitIntegratorIds = [
  'integrator:verlet',
  'integrator:leapfrog',
  'integrator:symplectic',
  'integrator:yoshida4',
  'integrator:yoshida6',
  'integrator:yoshida8'
] as const;

const splitCaveat = l(
  'q/v 분할에만 적용한다. 속도 결합이나 감쇠가 있으면 근사이며, 심플렉틱 보장은 분리 가능한 정준계에 한정된다.',
  'Requires a q/v split. Velocity coupling or damping makes this an approximation; symplecticity requires a separable canonical system.'
);
const monitoredCaveat = l(
  '기존 step dispatcher는 고정 간격마다 전진하며 오차를 감시한다. 허용오차에 따른 거부·재시도는 integrateAdaptive의 별도 경로다.',
  'The legacy step dispatcher advances fixed intervals with error monitoring. Tolerance-controlled reject/retry is a separate integrateAdaptive path.'
);
const implicitCaveat = l(
  '반복해의 수렴과 잔차를 확인해야 한다. 수렴 실패 시 상태를 전진시키지 않는 기존 진단 계약을 보존한다.',
  'Check convergence and residuals. Preserve the existing diagnostic contract that does not advance an unconverged state.'
);

type MethodRow = readonly [
  string,
  LocalizedText,
  IntegratorDefinition['method'],
  number,
  LegacyBinding,
  LocalizedText,
  LocalizedText
];
const methodRows: readonly MethodRow[] = [
  [
    'euler',
    l('명시적 오일러', 'Explicit Euler'),
    'explicit',
    1,
    bind('integrators', 'eulerStep'),
    l('현재 도함수로 한 번 전진한다.', 'Advances once using the current derivative.'),
    l(
      '큰 에너지 오차가 예상되는 비교·점검용 방법이다.',
      'A comparison and smoke-test method with potentially large energy drift.'
    )
  ],
  [
    'rk2',
    l('중점 룽게–쿠타 2차', 'Midpoint Runge–Kutta 2'),
    'explicit',
    2,
    bind('integrators', 'rk2Step'),
    l('명시적 중점 도함수로 전진한다.', 'Advances using an explicit midpoint derivative.'),
    l(
      '정성적 비교에 적합하며 오차 수렴 확인이 필요하다.',
      'Useful for qualitative comparison; verify error convergence.'
    )
  ],
  [
    'rk4',
    l('룽게–쿠타 4차', 'Runge–Kutta 4'),
    'explicit',
    4,
    bind('integrators', 'rk4Step'),
    l('고전적인 4단계 고정 간격 방법이다.', 'The classical four-stage fixed-step method.'),
    l('에너지 보존과 강성 안정성을 보장하지 않는다.', 'Does not guarantee energy conservation or stiff stability.')
  ],
  [
    'verlet',
    l('속도 베를레 호환 별칭', 'Velocity Verlet compatibility alias'),
    'split',
    2,
    bind('integrators', 'leapfrogStep'),
    l(
      '저장 세션의 verlet ID를 기존 leapfrog KDK 경로로 연결한다.',
      'Maps the saved-session verlet ID to the existing leapfrog KDK path.'
    ),
    splitCaveat
  ],
  [
    'leapfrog',
    l('리프프로그 근사', 'Leapfrog approximation'),
    'split',
    2,
    bind('integrators', 'leapfrogStep'),
    l('속도 반단계와 좌표 한 단계의 KDK 분할이다.', 'A kick-drift-kick split with half velocity steps.'),
    splitCaveat
  ],
  [
    'symplectic',
    l('반암시적 오일러', 'Semi-implicit Euler'),
    'split',
    1,
    bind('integrators', 'symplecticEulerStep'),
    l('속도를 먼저 갱신한 뒤 좌표를 갱신한다.', 'Updates velocity before position.'),
    l(
      '기존 ID 이름과 달리 theta/omega 좌표에서 일반적인 정준 심플렉틱 보장은 없다.',
      'The legacy ID does not establish canonical symplecticity in theta/omega coordinates.'
    )
  ],
  [
    'yoshida4',
    l('요시다 4차 합성', 'Yoshida fourth-order composition'),
    'split',
    4,
    bind('integrators', 'yoshida4Step'),
    l('세 리프프로그 부분 단계를 대칭 합성한다.', 'Symmetrically composes three leapfrog substeps.'),
    splitCaveat
  ],
  [
    'yoshida6',
    l('요시다 6차 합성', 'Yoshida sixth-order composition'),
    'split',
    6,
    bind('integrators', 'yoshida6Step'),
    l('요시다 4차를 대칭 triple-jump로 합성한다.', 'Applies a symmetric triple jump to Yoshida 4.'),
    splitCaveat
  ],
  [
    'yoshida8',
    l('요시다 8차 합성', 'Yoshida eighth-order composition'),
    'split',
    8,
    bind('integrators', 'yoshida8Step'),
    l('27개 리프프로그 부분 단계로 대칭 합성한다.', 'Uses a symmetric composition of 27 leapfrog substeps.'),
    splitCaveat
  ],
  [
    'hmidpoint',
    l('암시적 중점법', 'Implicit midpoint'),
    'implicit',
    2,
    bind('integrators', 'implicitMidpointStep'),
    l(
      '야코비안이 있으면 Newton, 없으면 고정점 반복을 사용한다.',
      'Uses Newton with a Jacobian, otherwise fixed-point iteration.'
    ),
    implicitCaveat
  ],
  [
    'gauss2',
    l('2단계 가우스–르장드르', 'Two-stage Gauss–Legendre'),
    'implicit',
    4,
    bind('integrators', 'gaussLegendre4Step'),
    l(
      '4차 collocation 방정식을 고정점 반복으로 푼다.',
      'Solves fourth-order collocation equations by fixed-point iteration.'
    ),
    implicitCaveat
  ],
  [
    'rkf45',
    l('펠베르크 RKF45 오차 감시', 'Fehlberg RKF45 error monitor'),
    'explicit',
    5,
    bind('embeddedIntegrators', 'rkf45Step'),
    l('내장 4/5차 쌍으로 고정 간격 오차를 추정한다.', 'Estimates fixed-step error using an embedded 4/5 pair.'),
    monitoredCaveat
  ],
  [
    'dopri5',
    l('도르만–프린스 5(4)', 'Dormand–Prince 5(4)'),
    'explicit',
    5,
    bind('adaptive', 'dormandPrince54Step'),
    l(
      '5차 해를 전진시키고 4차 쌍으로 오차를 추정한다.',
      'Advances the fifth-order solution with a fourth-order error pair.'
    ),
    monitoredCaveat
  ],
  [
    'dop853',
    l('DOP853 8(5,3)', 'DOP853 8(5,3)'),
    'explicit',
    8,
    bind('embeddedIntegrators', 'dop853Step'),
    l(
      '8차 도르만–프린스 표와 5/3차 오차 감시를 사용한다.',
      'Uses an eighth-order Dormand–Prince tableau with 5/3 error monitors.'
    ),
    monitoredCaveat
  ],
  [
    'gbs',
    l('GBS 외삽', 'GBS extrapolation'),
    'explicit',
    12,
    bind('adaptive', 'bulirschStoerStep'),
    l(
      '기본 6수준 수정 중점 외삽으로 거시 단계를 계산한다.',
      'Computes a macro-step with six default levels of modified-midpoint extrapolation.'
    ),
    monitoredCaveat
  ],
  [
    'bdf2',
    l('TR-BDF2 강성 적분', 'TR-BDF2 stiff integration'),
    'implicit',
    2,
    bind('stiff', 'trBdf2Step'),
    l(
      '자가 시작하는 L-stable 2차 방법을 Newton 반복으로 계산한다.',
      'A self-starting L-stable second-order method using Newton iteration.'
    ),
    implicitCaveat
  ]
];

const legacyMethods: readonly IntegratorDefinition[] = methodRows.map(
  ([id, name, method, order, binding, description, caveat]) => ({
    id: `integrator:${id}`,
    category: 'integrator',
    name,
    description,
    method,
    order,
    legacyId: id,
    tags: ['numerics', method, id],
    integrationStage: 7,
    baselineIds: [`integrator:src/physics/integratorRegistry.ts#${id}`],
    legacyBindings: [binding, { ...bind('integratorRegistry', 'integratorRegistry'), member: id }],
    limitations: [
      caveat,
      ...(method === 'implicit' && id !== 'bdf2'
        ? [
            l(
              '심플렉틱 해석은 정준 좌표, 무감쇠 조건 및 충분히 수렴한 반복해에 한정된다.',
              'Symplectic interpretation requires canonical coordinates, no damping, and a sufficiently converged solve.'
            )
          ]
        : [])
    ],
    compatibility: {
      systemIds: method === 'split' ? splitSystemIds : odeSystemIds,
      evolutions: ['ode'],
      requiredInputs: ['state', 'vector-field']
    }
  })
);

export const integrators: readonly IntegratorDefinition[] = [
  ...legacyMethods,
  {
    id: 'integrator:adaptive-controller',
    category: 'integrator',
    name: l('적응 간격 승인·거부 제어', 'Adaptive accept/reject controller'),
    description: l(
      'DP5(4)의 정규화 오차로 간격을 제어하고 승인 간격을 재생한다.',
      'Controls DP5(4) steps by normalized error and replays accepted intervals.'
    ),
    method: 'adaptive-controller',
    order: 5,
    tags: ['adaptive', 'replay'],
    integrationStage: 7,
    baselineIds: ['integrator:adaptive-controller'],
    legacyBindings: [bind('adaptive', 'integrateAdaptive'), bind('adaptive', 'replayAcceptedSteps')],
    compatibility: { systemIds: odeSystemIds, evolutions: ['ode'], requiredInputs: ['state', 'vector-field'] },
    limitations: [
      l(
        '일반 fixed-step dispatcher와 별도 API이며 성분별 허용오차, 간격 한계와 종료 사유를 보존해야 한다.',
        'A separate API from the fixed-step dispatcher; retain component tolerances, step limits, and termination reasons.'
      )
    ]
  },
  {
    id: 'integrator:canonical',
    category: 'integrator',
    name: l('정준 이중 진자 좌표 적분', 'Canonical double-pendulum integration'),
    description: l(
      '각속도와 운동량을 변환하고 정준 암시적 중점법을 적용한다.',
      'Transforms angular velocities and momenta and applies canonical implicit midpoint.'
    ),
    method: 'canonical-transform',
    order: 2,
    tags: ['canonical', 'double'],
    integrationStage: 7,
    baselineIds: ['integrator:canonical'],
    legacyBindings: [
      bind('canonical', 'canonicalRhs'),
      bind('canonical', 'implicitMidpointCanonical'),
      bind('canonical', 'canonicalStepThetaOmega')
    ],
    compatibility: { systemIds: ['system:double'], evolutions: ['ode'], requiredInputs: ['state'] },
    limitations: [
      l(
        '점질량 이중 진자 전용이며 무감쇠 정준계와 잔차 보고가 필요하다.',
        'Specific to the point-mass double pendulum; requires undamped canonical dynamics and residual reporting.'
      )
    ]
  },
  {
    id: 'integrator:sde-additive',
    category: 'integrator',
    name: l('가산 잡음 오일러–마루야마', 'Additive-noise Euler–Maruyama'),
    description: l(
      '대각 가산 Itô 잡음의 드리프트와 난수 증가량을 전진시킨다.',
      'Advances drift and random increments for diagonal additive Itô noise.'
    ),
    method: 'stochastic',
    order: 0.5,
    tags: ['sde', 'ito', 'additive'],
    integrationStage: 16,
    baselineIds: ['integrator:sde-additive'],
    legacyBindings: [bind('stochasticAdditive', 'eulerMaruyamaStep')],
    compatibility: { systemIds: ['system:langevin'], evolutions: ['sde'], requiredInputs: ['state', 'vector-field'] },
    limitations: [
      l(
        'seed, dt, 시간 범위와 앙상블 크기를 함께 기록한다. 일반적인 강수렴 차수는 1/2이다.',
        'Record seed, dt, horizon, and ensemble size. The general strong-order contract is one half.'
      )
    ]
  },
  {
    id: 'integrator:sde-multiplicative',
    category: 'integrator',
    name: l('대각 곱셈 잡음 밀스테인', 'Diagonal multiplicative-noise Milstein'),
    description: l(
      '상태 의존 대각 Itô 확산과 확산 도함수를 사용한다.',
      'Uses state-dependent diagonal Itô diffusion and its derivative.'
    ),
    method: 'stochastic',
    order: 1,
    tags: ['sde', 'ito', 'multiplicative'],
    integrationStage: 16,
    baselineIds: ['integrator:sde-multiplicative'],
    legacyBindings: [bind('stochasticMultiplicative', 'milsteinStep')],
    compatibility: { systemIds: ['system:langevin'], evolutions: ['sde'], requiredInputs: ['state', 'vector-field'] },
    limitations: [
      l(
        '강수렴 1차는 실제 확산에 맞는 diffusionPrime이 제공된 대각 잡음에 한정된다.',
        'Strong order one requires diagonal noise and a diffusionPrime matching the actual diffusion.'
      )
    ]
  },
  {
    id: 'integrator:sde-matrix',
    category: 'integrator',
    name: l('행렬 잡음 밀스테인·호인', 'Matrix-noise Milstein and Heun'),
    description: l(
      '가환 Itô 밀스테인 또는 Stratonovich 호인 경로를 제공한다.',
      'Provides commutative Itô Milstein or Stratonovich Heun paths.'
    ),
    method: 'stochastic',
    order: null,
    tags: ['sde', 'matrix-noise'],
    integrationStage: 16,
    baselineIds: ['integrator:sde-matrix'],
    legacyBindings: [
      bind('stochasticMatrixNoise', 'commutativeMilsteinStep'),
      bind('stochasticMatrixNoise', 'stochasticHeunStratonovichStep')
    ],
    compatibility: { systemIds: ['system:langevin'], evolutions: ['sde'], requiredInputs: ['state', 'vector-field'] },
    limitations: [
      l(
        '밀스테인 1차 주장은 확산 야코비안과 Lie 가환성을 요구한다. 호인은 Stratonovich 방법이며 Itô 1차 대체제가 아니다.',
        'Milstein order-one claims require a diffusion Jacobian and Lie commutativity. Heun is Stratonovich, not an Itô order-one replacement.'
      )
    ]
  }
];
