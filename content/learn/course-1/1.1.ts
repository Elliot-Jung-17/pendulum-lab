import { learnText as t, type LearnUnit } from '../../../src/product/learn/schema';

const text = (key: string, ko: string, en: string) => t(`learn.course-1.1.1.${key}`, ko, en);

/** S08 authoring/rendering sample only. The full course and live Focus Experiment belong to S09. */
const unit: LearnUnit = {
  schema: 'pendulum-learn-unit/v1',
  id: '1.1',
  courseId: 'course-1',
  contentVersion: 1,
  kind: 'sample',
  title: text('title', '이중진자의 일반화좌표와 구성공간', 'Generalized coordinates and configuration space'),
  summary: text(
    'summary',
    '단원 프레임 샘플: 두 각도가 자세를 어떻게 지정하는지 살펴봅니다. 전체 학습 콘텐츠와 실행 가능한 전용 실험은 준비 중입니다.',
    'Unit-frame sample: explore how two angles specify a configuration. The full learning content and executable Focus Experiment are being prepared.'
  ),
  objectives: [
    text(
      'objective.coordinates',
      '고정 길이 평면 이중진자의 자세를 두 각도로 표현합니다.',
      'Describe the configuration of a planar double pendulum with fixed rod lengths using two angles.'
    ),
    text(
      'objective.convention',
      '두 번째 절대각과 관절 사이 상대각을 구분합니다.',
      'Distinguish the second absolute angle from the relative angle between joints.'
    )
  ],
  prerequisites: [
    {
      id: 'angles',
      title: text('prerequisite.title', '선수 개념: 라디안과 좌표', 'Prerequisite: radians and coordinates'),
      body: text(
        'prerequisite.body',
        '라디안은 호의 길이를 반지름으로 나눈 각도 단위입니다. 이 샘플은 아래쪽 수직선을 각도 0으로 정하고, 오른쪽을 x의 양의 방향, 위쪽을 y의 양의 방향으로 씁니다. 선수 단원 완료는 필요하지 않습니다.',
        'A radian measures arc length divided by radius. This sample measures zero angle from vertically downward, with positive x to the right and positive y upward. No prerequisite completion is required.'
      ),
      recommendedUnits: []
    }
  ],
  concepts: [
    {
      id: 'configuration',
      title: text('concept.configuration.title', '두 각도로 지정하는 자세', 'A configuration specified by two angles'),
      body: text(
        'concept.configuration.body',
        '고정된 지지점, 질량 없는 강체 막대, 평면 운동을 가정합니다. 막대 길이가 정해져 있으면 두 각도가 두 질점의 위치를 정합니다. 각속도까지 포함한 운동 상태와 자세만을 나타내는 구성은 구분해야 합니다.',
        'Assume a fixed pivot, massless rigid rods and planar motion. With fixed rod lengths, two angles determine both point-mass positions. Distinguish a configuration from a motion state, which also contains angular velocities.'
      ),
      citationIds: ['mit-multibody', 'planar-source']
    },
    {
      id: 'absolute-angle',
      title: text('concept.absolute.title', '두 막대 모두 수직선을 기준으로', 'Both rods use the vertical reference'),
      body: text(
        'concept.absolute.body',
        'Pendulum Lab은 두 각도를 모두 아래쪽 수직선에 대한 절대각으로 저장합니다. 인용한 MIT 자료는 두 번째 각도를 첫 막대에 대한 상대각으로 정의합니다. 따라서 그 자료의 두 번째 절대 방향은 두 관절각의 합입니다. 각도 정의를 확인한 뒤 식을 비교하세요.',
        'Pendulum Lab stores both angles relative to the downward vertical. The cited MIT notes define the second joint angle relative to the first rod, so their second absolute direction is the sum of both joint angles. Check angle conventions before comparing equations.'
      ),
      citationIds: ['mit-multibody', 'planar-source']
    }
  ],
  equations: [
    {
      id: 'first-position',
      title: text('equation.title', '첫 질점의 위치', 'Position of the first mass'),
      expression: 'x1 = l1 * sin(theta1); y1 = -l1 * cos(theta1)',
      accessibleText: text(
        'equation.accessible',
        '첫 질점의 가로 위치 x1은 첫 막대 길이 l1 곱하기 theta1의 사인입니다. 세로 위치 y1은 마이너스 l1 곱하기 theta1의 코사인입니다. 각도 0에서 질점은 지지점 바로 아래에 있습니다.',
        'The first mass has horizontal position x1 equal to rod length l1 times sine of theta1, and vertical position y1 equal to negative l1 times cosine of theta1. At zero angle the mass is directly below the pivot.'
      ),
      symbols: [
        {
          symbol: 'x1',
          unit: 'm',
          meaning: text(
            'symbol.x1',
            '지지점에서 오른쪽으로 잰 첫 질점의 가로 위치',
            'First mass horizontal position measured rightward from the pivot'
          )
        },
        {
          symbol: 'y1',
          unit: 'm',
          meaning: text(
            'symbol.y1',
            '지지점에서 위쪽으로 잰 첫 질점의 세로 위치',
            'First mass vertical position measured upward from the pivot'
          )
        },
        {
          symbol: 'l1',
          unit: 'm',
          meaning: text('symbol.l1', '첫 번째 강체 막대의 양의 길이', 'Positive length of the first rigid rod')
        },
        {
          symbol: 'theta1',
          unit: 'rad',
          meaning: text(
            'symbol.theta1',
            '아래쪽 수직선에서 오른쪽으로 기울어지는 첫 막대의 절대각',
            'First rod absolute angle, positive toward the right from downward vertical'
          )
        }
      ],
      citationIds: ['mit-multibody', 'planar-source']
    }
  ],
  figures: [
    {
      id: 'configuration-sketch',
      title: text('figure.title', '두 링크의 정적인 구성 예시', 'A static two-link configuration'),
      caption: text(
        'figure.caption',
        '기호와 링크 연결을 보여 주는 개략도입니다. 축척에 맞춘 계산 결과나 실행 중인 시뮬레이션이 아닙니다.',
        'A schematic of the labels and link connections. It is not a scale drawing, calculated result or running simulation.'
      ),
      alt: text(
        'figure.alt',
        '위쪽 지지점에서 첫 질점으로 오른쪽 아래 막대가 이어지고, 첫 질점에서 두 번째 질점으로 왼쪽 아래 막대가 이어집니다.',
        'One rod connects the upper pivot to the first mass down and right; a second rod connects that mass to the second mass down and left.'
      ),
      nodes: [
        { id: 'pivot', x: 0.35, y: 0.14, label: text('figure.pivot', '지지점', 'Pivot') },
        { id: 'first', x: 0.65, y: 0.46, label: text('figure.first', '첫 질점', 'First mass') },
        { id: 'second', x: 0.45, y: 0.8, label: text('figure.second', '두 번째 질점', 'Second mass') }
      ],
      lines: [
        { from: 'pivot', to: 'first' },
        { from: 'first', to: 'second' }
      ],
      citationIds: ['planar-source']
    }
  ],
  glossary: [
    {
      id: 'generalized-coordinate',
      term: text('glossary.coordinate.term', '일반화좌표', 'Generalized coordinate'),
      definition: text(
        'glossary.coordinate.definition',
        '구속을 만족하는 계의 자세를 지정하기 위해 고른 독립 좌표입니다.',
        'An independent coordinate chosen to specify a configuration satisfying the constraints.'
      )
    },
    {
      id: 'configuration-space',
      term: text('glossary.configuration.term', '구성공간', 'Configuration space'),
      definition: text(
        'glossary.configuration.definition',
        '계가 가질 수 있는 모든 자세의 집합입니다. 여기서는 각각 한 바퀴를 돌아 같은 자세가 되는 두 각도로 표현합니다.',
        'The set of possible configurations, represented here by two angles, each returning to the same configuration after a full turn.'
      )
    }
  ],
  checks: [
    {
      id: 'coordinates',
      prompt: text(
        'check.coordinates.prompt',
        '고정 길이 평면 이중진자의 자세를 지정하는 독립 각도는 몇 개인가요?',
        'How many independent angles specify a fixed-length planar double-pendulum configuration?'
      ),
      options: [
        {
          id: 'one',
          label: text('check.coordinates.one', '한 개', 'One'),
          feedback: text(
            'check.coordinates.one-feedback',
            '한 각도만 정하면 두 번째 막대가 어느 방향인지 남아 있습니다.',
            'One angle leaves the second rod direction unspecified.'
          )
        },
        {
          id: 'two',
          label: text('check.coordinates.two', '두 개', 'Two'),
          feedback: text(
            'check.coordinates.two-feedback',
            '맞습니다. 두 각도가 두 링크의 자세를 정합니다.',
            'Correct. Two angles specify both link directions.'
          )
        },
        {
          id: 'four',
          label: text('check.coordinates.four', '네 개', 'Four'),
          feedback: text(
            'check.coordinates.four-feedback',
            '각도 두 개와 각속도 두 개는 운동 상태입니다. 자세에는 각도 두 개를 씁니다.',
            'Two angles plus two angular velocities describe a motion state. Configuration uses the two angles.'
          )
        }
      ],
      correctOptionId: 'two',
      explanation: text(
        'check.coordinates.explanation',
        '고정 길이와 지지점의 구속을 반영하면 자세의 자유도는 2입니다.',
        'With fixed lengths and a fixed pivot, configuration has two degrees of freedom.'
      )
    },
    {
      id: 'downward-position',
      prompt: text(
        'check.position.prompt',
        'theta1 = 0, l1 = 1 m일 때 첫 질점의 위치는 무엇인가요?',
        'For theta1 = 0 and l1 = 1 m, where is the first mass?'
      ),
      options: [
        {
          id: 'below',
          label: text('check.position.below', 'x1 = 0 m, y1 = -1 m', 'x1 = 0 m, y1 = -1 m'),
          feedback: text(
            'check.position.below-feedback',
            '맞습니다. 각도 0은 아래쪽 수직선이며 y는 위쪽이 양수입니다.',
            'Correct. Zero angle is downward, and y is positive upward.'
          )
        },
        {
          id: 'above',
          label: text('check.position.above', 'x1 = 0 m, y1 = 1 m', 'x1 = 0 m, y1 = 1 m'),
          feedback: text(
            'check.position.above-feedback',
            'y가 양수면 지지점 위쪽입니다. 수식의 마이너스 부호를 확인하세요.',
            'Positive y is above the pivot. Check the minus sign in the equation.'
          )
        }
      ],
      correctOptionId: 'below',
      explanation: text(
        'check.position.explanation',
        'sin(0) = 0, cos(0) = 1이므로 첫 질점은 지지점에서 1 m 아래에 있습니다.',
        'Since sin(0) = 0 and cos(0) = 1, the first mass is 1 m below the pivot.'
      )
    }
  ],
  focusExperiment: {
    status: 'planned',
    systemId: 'system:double',
    exposedFields: ['theta1', 'theta2'],
    fixedFields: [
      { id: 'l1', value: 1, unit: 'm' },
      { id: 'l2', value: 1, unit: 'm' }
    ],
    defaultPreset: {
      integratorId: 'integrator:rk4',
      fields: [
        { id: 'm1', value: 1, unit: 'kg' },
        { id: 'm2', value: 1, unit: 'kg' },
        { id: 'l1', value: 1, unit: 'm' },
        { id: 'l2', value: 1, unit: 'm' },
        { id: 'g', value: 9.81, unit: 'm/s^2' },
        { id: 'gamma', value: 0, unit: 'kg*m^2/s' },
        { id: 'theta1', value: 1.2, unit: 'rad' },
        { id: 'theta2', value: 0.6, unit: 'rad' },
        { id: 'omega1', value: 0, unit: 'rad/s' },
        { id: 'omega2', value: 0, unit: 'rad/s' },
        { id: 'duration', value: 10, unit: 's' },
        { id: 'step', value: 0.002, unit: 's' }
      ]
    },
    analysisIds: ['analysis:energy'],
    guidance: [
      text(
        'focus.guidance',
        'S09에서 두 각도 조작과 실제 공용 엔진을 연결합니다.',
        'S09 will connect angle controls to the shared physics engine.'
      )
    ],
    successCriteria: [
      text(
        'focus.criteria',
        '자세와 각도 사이의 대응을 예측하고 실제 엔진 결과로 확인할 예정입니다.',
        'The planned activity predicts the relation between angles and configuration, then checks it against the shared engine.'
      )
    ]
  },
  labTransfer: {
    status: 'planned',
    systemId: 'system:double',
    sourceUnitId: '1.1',
    description: text(
      'transfer.description',
      '현재 설정과 출처 단원을 실험실로 전달하는 왕복 기능은 S09 범위입니다. 실험실 자체는 학습 진도와 관계없이 열 수 있습니다.',
      'Transferring current settings and unit provenance to the laboratory is part of S09. Laboratory access is independent of learning progress.'
    )
  },
  references: [
    {
      id: 'mit-multibody',
      title: text(
        'reference.mit.title',
        'Underactuated Robotics — Multi-Body Dynamics',
        'Underactuated Robotics — Multi-Body Dynamics'
      ),
      authors: 'Russ Tedrake',
      url: 'https://underactuated.mit.edu/multibody.html',
      locator: text(
        'reference.mit.locator',
        'Simple Double Pendulum 절: 일반화좌표와 기하. 두 번째 각도는 상대각이므로 본 샘플과 정의가 다릅니다.',
        'Simple Double Pendulum section: generalized coordinates and geometry. Its second angle is relative, unlike the absolute convention in this sample.'
      ),
      accessedOn: '2026-09-08'
    },
    {
      id: 'planar-source',
      title: text('reference.repo.title', 'Pendulum Lab — planarPositions', 'Pendulum Lab — planarPositions'),
      authors: 'Pendulum Lab contributors',
      url: 'https://github.com/elliotjung/pendulum-lab/blob/acd7f869db182376b726e337606335eeabe0d541/src/product/adapters/physics/planar.ts#L202-L214',
      locator: text(
        'reference.repo.locator',
        'S07 저장소 원본의 planarPositions: 두 절대각, 위쪽 양의 y 좌표와 SI 길이 정의를 대조했습니다.',
        'Checked against the S07 repository source: planarPositions uses two absolute angles, positive y upward and SI lengths.'
      ),
      accessedOn: '2026-09-08'
    }
  ],
  review: {
    schemaVerified: true,
    automatedVerified: false,
    sourceChecked: true,
    humanReviewed: false,
    note: text(
      'review.note',
      '샘플의 구조·기호·링크와 정적 예제는 자동 검사합니다. 기하와 각도 정의는 MIT 자료 및 S07 코드와 대조했습니다. 전체 과학 검증 등급의 전용 실험 fixture와 전문가 검토는 아직 완료되지 않았습니다.',
      'Structure, symbols, links and the static example are checked automatically. Geometry and angle conventions were checked against the MIT notes and S07 source. Full scientific verification through Focus Experiment fixtures and expert review remains pending.'
    )
  }
};

export default unit;
