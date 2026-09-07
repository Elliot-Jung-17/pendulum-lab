import type { AuxiliaryDefinition, LegacyBinding, LocalizedText } from '../contracts/catalog';

const l = (ko: string, en: string): LocalizedText => ({ ko, en });
const b = (module: string, exportName: string): LegacyBinding => ({ module: `src/${module}.ts`, exportName });
type AuxiliaryRow = readonly [string, LocalizedText, LocalizedText, readonly LegacyBinding[], number, LocalizedText];
function entries(category: AuxiliaryDefinition['category'], rows: readonly AuxiliaryRow[]): AuxiliaryDefinition[] {
  return rows.map(([key, name, description, legacyBindings, integrationStage, limitation]) => ({
    id: `${category}:${key}`,
    category,
    name,
    description,
    legacyBindings,
    integrationStage,
    baselineIds: [`${category}:${key}`],
    tags: [category, key],
    limitations: [limitation]
  }));
}

/** Discovery metadata only. Importing this catalog does not mount UI, access storage, or start workers. */
export const auxiliary: readonly AuxiliaryDefinition[] = [
  ...entries('control', [
    [
      'forcing-and-feedback',
      l('외력·혼돈 피드백 제어', 'Forcing and chaos feedback control'),
      l(
        '이산 사상의 OGY 매개변수 제어와 진자의 지연 피드백을 연결한다.',
        'Connects map-level OGY parameter control and delayed pendulum feedback.'
      ),
      [b('chaos/chaosControl', 'simulateOgyControl'), b('physics/pyragasDde', 'integratePyragasPendulumDde')],
      14,
      l(
        'OGY는 2차원 실수 saddle 근방의 선형 제어다. 지연 피드백은 별도의 이력·dt 계약을 따른다.',
        'OGY is local linear control near a two-dimensional real saddle. Delayed feedback has a separate history and dt contract.'
      )
    ],
    [
      'physical-parameters',
      l('물리 매개변수·초기 조건', 'Physical parameters and initial conditions'),
      l(
        '기존 화면의 시스템 선택과 매개변수·초기 상태를 읽는다.',
        'Reads the selected system, parameters, and initial state from existing controls.'
      ),
      [b('app/systemControls', 'readSystem')],
      6,
      l(
        '기존 DOM control ID와 단위·기본값에 의존한다. 새 제품 상태 schema를 만들지 않는다.',
        'Depends on existing DOM control IDs, units, and defaults; it does not create a new product state schema.'
      )
    ],
    [
      'precision',
      l('수치 정밀도 입력', 'Numerical precision inputs'),
      l(
        '정밀 소수·지수·pi 표현과 각도 단위를 기존 입력에 연결한다.',
        'Connects precise decimals, exponent and pi expressions, and angle units to existing inputs.'
      ),
      [b('app/precisionControls', 'installPrecisionControls'), b('app/precisionControls', 'parseScientificValue')],
      6,
      l(
        '표시 값과 내부 canonical 값을 구별한다. 허용오차 입력 자체가 adaptive reject/retry를 의미하지 않는다.',
        'Distinguish display values from internal canonical values. A tolerance input alone does not imply adaptive reject/retry.'
      )
    ],
    [
      'run-and-history',
      l('실행·재생·기록 제어', 'Run, replay, and recording controls'),
      l(
        '실험실 실행·정지·한 단계 진행과 기록·재생 조작을 설치한다.',
        'Installs lab run, pause, single-step, recording, and replay interactions.'
      ),
      [b('app/LabControls', 'LabControls')],
      7,
      l(
        '기존 LabControlBindings와 렌더링 수명주기를 요구한다. 카탈로그 조회는 실행을 시작하지 않는다.',
        'Requires existing LabControlBindings and the rendering lifecycle. Catalog discovery does not start a run.'
      )
    ],
    [
      'audio',
      l('진자 운동 소리화', 'Pendulum motion sonification'),
      l(
        '운동 상태에 대응하는 주파수와 음량을 Web Audio로 표현한다.',
        'Expresses motion through Web Audio frequency and gain.'
      ),
      [b('app/AudioSonifier', 'AudioSonifier')],
      7,
      l(
        '브라우저의 사용자 활성화와 AudioContext 상태에 따른다. 수치 정확도 검증을 대신하지 않는다.',
        'Depends on browser user activation and AudioContext state; it is not a numerical validation method.'
      )
    ],
    [
      'search-and-commands',
      l('명령 검색·팔레트', 'Command search and palette'),
      l(
        '기존 화면 명령의 검색·키보드 탐색과 실행을 제공한다.',
        'Provides search, keyboard navigation, and execution for existing UI commands.'
      ),
      [b('app/parity/command-palette', 'installCommandPalettes')],
      6,
      l(
        '기존 명령 정의와 DOM에 연결되며 모든 카탈로그 기능의 새 실행 경로를 제공하지 않는다.',
        'Connects to existing command definitions and DOM; it does not create new execution paths for every catalog capability.'
      )
    ],
    [
      'locale-and-theme',
      l('언어·테마 환경설정', 'Language and theme preferences'),
      l(
        '한국어·영어 화면 메시지와 밝은·어두운 테마를 적용한다.',
        'Applies Korean/English UI messages and light/dark themes.'
      ),
      [
        b('app/uiLocale', 'uiMessage'),
        b('app/uiLocale', 'installLocaleSelect'),
        b('app/themePreference', 'installThemePreference')
      ],
      5,
      l(
        '기존 화면의 환경설정 경로다. 카탈로그의 번역 선언이 전체 legacy UI 번역 완료를 뜻하지 않는다.',
        'An existing UI preference path. Catalog translations do not imply complete translation of the legacy UI.'
      )
    ]
  ]),
  ...entries('importer', [
    [
      'observations',
      l('관측 CSV 가져오기', 'Observation CSV import'),
      l(
        '이중 진자 관측 CSV를 파싱하고 시간·각도 데이터를 정규화한다.',
        'Parses double-pendulum observation CSV and normalizes time and angle data.'
      ),
      [b('research/experimentalDataImport', 'parseObservedDoublePendulumCsv')],
      22,
      l(
        '기존 열 매핑·단위·관측 형식 검증을 따른다. 임의 시스템의 센서 포맷을 자동 추론하지 않는다.',
        'Follows existing column mappings, units, and observation validation; it does not infer arbitrary system sensor formats.'
      )
    ],
    [
      'video',
      l('영상 마커 관측', 'Video marker observations'),
      l(
        '영상 프레임의 마커 좌표를 보정해 이중 진자 관측으로 변환한다.',
        'Calibrates frame marker coordinates into double-pendulum observations.'
      ),
      [b('browser/videoMarkerCapture', 'VideoMarkerCaptureController')],
      22,
      l(
        '프레임·공간 보정과 마커 추적 품질에 의존한다. 영상 접근과 캡처는 별도 사용자 조작이다.',
        'Depends on frame/spatial calibration and tracking quality. Video access and capture are separate user interactions.'
      )
    ],
    [
      'imu',
      l('IMU 운동 관측', 'IMU motion observations'),
      l(
        '브라우저 장치 방향 이벤트의 시각·각도를 수집한다.',
        'Collects timestamps and angles from browser device-orientation events.'
      ),
      [b('browser/imuMotionCapture', 'ImuMotionCaptureController')],
      22,
      l(
        '장치 지원과 센서 권한이 필요하며 선택 축·표본 간격·보정 정보를 함께 해석한다.',
        'Requires device support and sensor permission; interpret the selected axis, sampling intervals, and calibration together.'
      )
    ],
    [
      'saved-run',
      l('저장 실행 가져오기', 'Saved run import'),
      l(
        '저장된 실행 snapshot을 검사한 뒤 기존 상태와 control에 적용한다.',
        'Validates a saved run snapshot before applying it to existing state and controls.'
      ),
      [b('browser/savedRunImport', 'parseAndApplySavedRun')],
      28,
      l(
        '인식되는 legacy session 형식만 처리한다. 실제 적용은 상태 변경이며 카탈로그 조회에서 실행하지 않는다.',
        'Processes recognized legacy session formats only. Applying a snapshot changes state and is not performed during catalog discovery.'
      )
    ],
    [
      'workspace',
      l('원자적 작업공간 가져오기', 'Atomic workspace import'),
      l(
        '작업공간을 사전 검사·백업·적용·검증하고 실패하면 복구한다.',
        'Stages, backs up, applies, and verifies a workspace, rolling back on failure.'
      ),
      [b('app/parity/workspace-import-transaction', 'runWorkspaceImportTransaction')],
      28,
      l(
        '호출자가 제공하는 transaction adapter와 기존 저장 한계를 따른다. 복구 실패 진단을 숨기지 않는다.',
        'Uses a caller-provided transaction adapter and existing storage limits. Rollback failure diagnostics must remain visible.'
      )
    ]
  ]),
  ...entries('exporter', [
    [
      'lab',
      l('실험실 궤적·실행 내보내기', 'Lab trajectory and run export'),
      l(
        '궤적 CSV와 실행 JSON에 모델·기록 범위 정보를 담는다.',
        'Includes model and retention information in trajectory CSV and run JSON.'
      ),
      [b('app/labExport', 'trajectoryCsv'), b('app/labExport', 'runJson')],
      7,
      l(
        '보존된 표본만 내보낸다. 잘린 이력이나 렌더링용 표본을 전체 궤적으로 표현하지 않는다.',
        'Exports retained samples only. Truncated history or display samples must not be presented as a complete trajectory.'
      )
    ],
    [
      'figure',
      l('연구 그림 생성', 'Research figure generation'),
      l(
        '연구 데이터와 테마에서 SVG 그림과 원본 CSV를 생성한다.',
        'Generates SVG figures and source CSV from study data and themes.'
      ),
      [b('research/figurePipeline', 'renderStudyFigureSvg'), b('research/figurePipeline', 'figureSourceCsv')],
      24,
      l(
        '도표 렌더링은 입력 데이터의 과학적 타당성을 검증하지 않는다. 축·단위·원본 데이터를 함께 보존한다.',
        'Figure rendering does not validate the scientific correctness of input data. Retain axes, units, and source data.'
      )
    ],
    [
      'notebook',
      l('재현 노트북 생성', 'Reproduction notebook generation'),
      l(
        '기존 v2 계약으로 실행 설정과 재현 코드가 있는 노트북을 만든다.',
        'Builds a notebook with run settings and reproduction code under the existing v2 contract.'
      ),
      [b('research/notebookBuilder', 'buildNotebookV2'), b('research/notebookBuilder', 'validateNotebook')],
      24,
      l(
        '노트북 생성과 구조 검증은 외부 커널의 코드 실행 성공을 뜻하지 않는다.',
        'Notebook generation and structural validation do not establish successful execution in an external kernel.'
      )
    ],
    [
      'package',
      l('재현 패키지 구성', 'Reproduction package assembly'),
      l(
        '실행 입력·결과·manifest와 해시를 재현 패키지로 묶는다.',
        'Combines run inputs, results, a manifest, and hashes into a reproduction package.'
      ),
      [b('research/reproPackage', 'buildReproPackage'), b('research/reproPackage', 'verifyReproPackage')],
      24,
      l(
        '기존 실행 형식과 해시 계약을 보존한다. 입력 해시는 외부 검토나 과학적 정확도의 인증이 아니다.',
        'Preserve existing run formats and hash contracts. An input hash is not external review or a scientific-accuracy certification.'
      )
    ],
    [
      'zip',
      l('ZIP 묶음·검사합', 'ZIP bundles and checksums'),
      l(
        '파일 묶음을 ZIP으로 생성하고 항목 검사합을 계산한다.',
        'Builds ZIP file bundles and computes entry checksums.'
      ),
      [b('research/zipBundle', 'buildZip'), b('research/zipBundle', 'checksumEntriesSha256')],
      24,
      l(
        '경로·항목 수·바이트 한계를 따른다. CRC와 암호학적 SHA-256의 역할을 구별한다.',
        'Enforces path, entry-count, and byte limits. Distinguish CRC checks from cryptographic SHA-256.'
      )
    ]
  ]),
  ...entries('storage-schema', [
    [
      'session',
      l('세션 schema 버전', 'Session schema version'),
      l(
        '기존 v11 세션과 v10 호환 형식의 버전 상수를 선언한다.',
        'Declares version constants for existing v11 sessions and the compatible v10 format.'
      ),
      [b('state/sessionSchema', 'SESSION_SCHEMA_VERSION'), b('state/sessionSchema', 'LEGACY_SESSION_SCHEMA_V10')],
      3,
      l(
        '상수는 직렬화 형식의 식별자다. 이 카탈로그 등록은 schema 변경이나 데이터 migration을 수행하지 않는다.',
        'The constants identify serialized formats. Catalog registration does not change schemas or migrate data.'
      )
    ],
    [
      'workspace',
      l('작업공간 저장 계약', 'Workspace storage contract'),
      l(
        '기존 local storage 키와 작업공간 정규화 규칙을 연결한다.',
        'Connects the existing local-storage key and workspace normalization rules.'
      ),
      [
        b('app/parity/storage-schema', 'RESEARCH_STORAGE_KEY'),
        b('app/parity/storage-schema', 'normalizeResearchStorage')
      ],
      28,
      l(
        '저장 키와 payload schema 버전은 별개다. 기존 개수 제한·지원 시스템·정규화 규칙을 유지한다.',
        'Storage keys and payload schema versions are distinct. Preserve existing count limits, supported systems, and normalization rules.'
      )
    ],
    [
      'research-db',
      l('연구 IndexedDB 저장소', 'Research IndexedDB store'),
      l(
        '프로젝트·실행·artifact와 복구 archive를 브라우저 데이터베이스로 관리한다.',
        'Manages projects, runs, artifacts, and recovery archives in a browser database.'
      ),
      [b('research/researchDb', 'ResearchDb'), b('research/researchDb', 'validateResearchDbArchive')],
      24,
      l(
        'IndexedDB 지원·할당량과 레코드 제한에 의존한다. 복구가 필요한 상태를 빈 데이터로 대신하지 않는다.',
        'Depends on IndexedDB support, quotas, and record limits. Recovery-required state must not be replaced with empty data.'
      )
    ],
    [
      'provenance',
      l('실행·artifact 계보', 'Run and artifact provenance'),
      l(
        '입력·변환·실행·artifact의 의존 관계와 환경 정보를 기록한다.',
        'Records dependencies and environment information for inputs, transformations, runs, and artifacts.'
      ),
      [b('research/provenance', 'ProvenanceBuilder'), b('research/provenance', 'validateProvenanceGraph')],
      24,
      l(
        '계보의 구조 검증은 데이터의 진실성이나 제3자 재현 성공을 인증하지 않는다.',
        'Structural provenance validation does not certify data truth or successful third-party reproduction.'
      )
    ]
  ]),
  ...entries('route', [
    [
      'tabs',
      l('기존 탭 URL·이력', 'Legacy tab URLs and history'),
      l(
        '탭 식별자를 URL query와 브라우저 이력에 연결한다.',
        'Connects tab identifiers to URL queries and browser history.'
      ),
      [b('app/tabRouting', 'urlForTab'), b('app/tabRouting', 'TabRouting')],
      3,
      l(
        '기존 탭 경로를 보존한다. 새로운 제품 라우트나 canonical 공유 상태를 구현하지 않는다.',
        'Preserves existing tab routes; it does not implement new product routes or canonical shared state.'
      )
    ],
    [
      'share',
      l('버전 있는 실험 공유', 'Versioned experiment sharing'),
      l(
        '실험 설정을 검증된 공유 envelope로 인코딩하고 복호화한다.',
        'Encodes and decodes experiment settings in validated share envelopes.'
      ),
      [
        b('app/experimentShareCodec', 'encodeSharedExperiment'),
        b('app/experimentShareCodec', 'decodeSharedExperiment')
      ],
      3,
      l(
        '지원 버전·URL 길이·허용 필드와 진단을 유지한다. 이 등록은 URL을 외부에 게시하지 않는다.',
        'Preserves supported versions, URL lengths, allowed fields, and diagnostics. Registration does not publish URLs externally.'
      )
    ],
    [
      'deep-link',
      l('수치 control 딥링크', 'Numeric control deep links'),
      l(
        'URL 수치 매개변수를 검사해 기존 control에 적용한다.',
        'Validates numeric URL parameters before applying them to existing controls.'
      ),
      [b('app/deepLinkControls', 'applyNumericControlParams')],
      28,
      l(
        '허용된 control ID·범위·단위만 수용하고 거부 항목을 보고한다. 임의 URL 값을 상태로 신뢰하지 않는다.',
        'Accepts only allowed control IDs, ranges, and units and reports rejections. Arbitrary URL values are not trusted as state.'
      )
    ]
  ]),
  ...entries('runtime', [
    [
      'jobs',
      l('작업 스케줄·진행·취소', 'Job scheduling, progress, and cancellation'),
      l(
        '기존 worker 작업을 단계별로 실행하고 진행·취소 상태를 관리한다.',
        'Runs existing worker jobs in phases and manages progress and cancellation state.'
      ),
      [b('workers/JobEngine', 'JobEngine')],
      21,
      l(
        '지원 요청과 기존 checkpoint·취소 경계를 따른다. 모든 수치 함수가 임의 시점에 중단 가능한 것은 아니다.',
        'Follows supported requests and existing checkpoint/cancellation boundaries. Not every numerical function can stop at arbitrary points.'
      )
    ],
    [
      'gpu',
      l('WebGPU 앙상블 가속', 'WebGPU ensemble acceleration'),
      l(
        '이중 진자 RK4 앙상블을 GPU에서 계산하고 CPU fallback을 제공한다.',
        'Computes double-pendulum RK4 ensembles on the GPU with a CPU fallback.'
      ),
      [b('runtime/gpuEnsemble', 'runDoublePendulumEnsemble')],
      21,
      l(
        'GPU는 f32, CPU는 f64이다. backend와 통계 비교를 기록하며 긴 개별 혼돈 궤적의 일치를 주장하지 않는다.',
        'GPU uses f32 and CPU uses f64. Record the backend and statistical comparisons; do not claim agreement of long individual chaotic trajectories.'
      )
    ],
    [
      'wasm',
      l('Wasm 앙상블 가속', 'Wasm ensemble acceleration'),
      l(
        '이중 진자의 f64 RK4 앙상블 kernel과 동일 API CPU fallback을 제공한다.',
        'Provides an f64 double-pendulum RK4 ensemble kernel and a CPU fallback with the same API.'
      ),
      [b('runtime/wasmEnsemble', 'runDoublePendulumEnsembleWasm')],
      21,
      l(
        'kernel 가용성과 실행 환경 정책을 따른다. 실제 backend를 보고하며 카탈로그가 CSP나 배포 정책을 변경하지 않는다.',
        'Depends on kernel availability and execution-environment policy. Report the actual backend; the catalog does not change CSP or deployment policy.'
      )
    ],
    [
      'public-globals',
      l('공개 스크립트 namespace', 'Public scripting namespace'),
      l(
        '공개 PendulumLab namespace와 기존 별칭을 게시하는 함수를 등록한다.',
        'Registers the publisher for the public PendulumLab namespace and legacy aliases.'
      ),
      [b('runtime/globalApi', 'publishPublicApi')],
      28,
      l(
        '공개 API와 불안정한 debug surface를 구별한다. 카탈로그 import는 window 전역을 등록하거나 덮어쓰지 않는다.',
        'Distinguish public APIs from the unstable debug surface. Importing the catalog does not register or overwrite window globals.'
      )
    ]
  ])
];
