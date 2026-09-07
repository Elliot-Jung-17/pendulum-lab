# Pendulum Lab 완전 재설계 마스터 로드맵

> 계획 버전: v2
>
> 기준일: 2026-09-07
>
> 실행 단위: `execution-plan-ko.md`의 30단계
> 적용 대상: 기존 `pendulum_lab_modular` 저장소

## 1. 결론

이 재설계는 새 프로젝트를 만드는 작업이 아니다. 현재 저장소와 계산 엔진을 그대로 기반으로, 사용자가 접하는 제품 구조와 화면을 병렬로 새로 만든 뒤 기능 동등성이 확인된 마지막 시점에 교체한다.

완성 제품에는 두 공간만 존재한다.

1. **배우기**: 8개 과정·86개 독립 단원에서 수준 높은 진자 역학, 비선형 동역학, 수치해석, 카오스 분석, 연구 방법을 이론과 전용 실험으로 학습한다.
2. **실험실**: 모든 시스템·분석·계산·내보내기 기능을 처음부터 쓸 수 있는 자유 실험 공간이다. 선택한 진자 유형에 맞는 도구만 보여 준다.

`Beginner`, `Student`, `Research` 같은 사용자 등급과 기능 잠금은 제거한다. 배우기에서 진도를 완료해야만 실험실 기능을 사용할 수 있게 만들지 않는다. 배우기는 이해를 돕고, 실험실은 자유를 제공한다.

## 2. 확인된 기준선

- 제품 버전: `10.36.0`
- 기준 브랜치/커밋: `master` / `222fe19`
- 원격 저장소: `origin` = `elliotjung/pendulum-lab`
- 기준 검증: Vitest 229개 파일, 1,647개 테스트 통과
- 기준 타입 검사: `npm run typecheck` 통과
- 현재 주 진입점: `app.html`
- 새 작업 브랜치: `codex/redesign`

이 수치는 재설계의 출발점이다. S01에서 자동 생성 가능한 인벤토리와 기준 보고서로 다시 고정한다.

## 3. 절대 보존할 자산

다음은 재작성 대상이 아니라 연결·정리·표현 대상이다.

- `src/physics/`: 운동방정식, 시스템 모델, 적분 및 물리 계산
- `src/chaos/`: 카오스 지표와 동역학 분석
- `src/research/`: 고급 분석, 연구 워크플로, 산출물 생성
- `src/runtime/`, `src/workers/`: 실행·병렬 계산 기반
- `src/validation/`: 입력과 과학적 유효성 검사
- 기존 공개 API, 저장 데이터, 공유 링크, 가져오기/내보내기 형식
- 검증된 테스트, 수치 기준값, 예제와 프리셋
- `app.html`: S28의 동등성 심사를 통과할 때까지 운영 가능한 안전망

핵심 원칙은 **엔진 하나, UI 두 개, 점진적 교체**다. 배우기의 작은 실험과 실험실의 큰 실험은 같은 adapter와 같은 계산 엔진을 호출해야 한다. 교육용으로 비슷한 공식을 별도 구현하지 않는다.

## 4. 범위 밖의 작업

- 새 저장소나 새 프로젝트 생성
- 기존 엔진의 전면 재작성
- 검증 없이 기존 파일·API·데이터 형식 삭제
- `master` 직접 개발 또는 force push
- 재설계 완료 전 기존 `app.html` 제거
- 이번 30단계 안에서 Landing Page 저장소 수정
- 진행도에 따른 기능 잠금, 유료화, 사용자 등급 재도입
- 시각 효과를 위해 과학적 경고나 단위를 숨기는 작업

Landing Page는 S30에서 전달 문서만 만들고, 실제 재설계는 시뮬레이터가 안정된 뒤 별도 계획으로 수행한다.

## 5. 제품 원칙

### 5.1 두 공간은 목적이 다르다

배우기는 한 화면에 한 질문만 다룬다. 이론, 유도, 해석, 전용 실험, 확인 질문, 다음 탐구가 하나의 단원 안에서 닫힌다. 실험실은 사용자가 시스템부터 고르고 실험을 조립한다.

### 5.2 시스템을 먼저 고른다

현재처럼 모든 제어와 분석을 한꺼번에 노출하지 않는다. 실험실 진입 흐름은 다음과 같다.

`시스템 선택 → 초기 조건/물성 설정 → 실행 → 호환 분석 추가 → 비교/내보내기`

### 5.3 점진적 공개는 화면에만 적용한다

고급 기능을 감추거나 잠그지 않는다. 기본 화면은 핵심 제어만 보여 주고, 상세 섹션·검색·분석 추가 창을 통해 모든 기능에 접근하게 한다.

### 5.4 과학적 맥락을 보존한다

모든 수치 입력에는 기호, 단위, 유효 범위, 기본값, 현재 값의 의미가 있어야 한다. 분석에는 전제, 필요한 데이터, 계산 비용, 실패 조건, 불확실성 또는 해석상의 한계를 표시한다.

### 5.5 URL과 상태는 재현 가능해야 한다

같은 버전의 상태를 열면 같은 시스템, 매개변수, 초기 조건, seed, 적분기와 분석 설정이 복구되어야 한다. 공유는 화면 모양보다 실험의 의미를 저장한다.

## 6. 목표 정보 구조

### 6.1 공통 셸

- 상단: 제품명, `배우기`/`실험실` 전환, 문서/언어/테마, 저장 상태
- 본문: 각 공간의 라우트가 차지
- 전역 알림: 오류, 계산 진행, 취소, 저장·복구 결과
- 명령 검색: 시스템·분석·단원·행동을 이름과 키워드로 검색
- 모바일: 한 번에 한 패널, 하단 작업 막대, 시뮬레이션 캔버스 우선

### 6.2 안전한 라우트

- `/next.html#/learn`: 과정 목록
- `/next.html#/learn/{courseId}`: 과정 개요
- `/next.html#/learn/{courseId}/{unitId}`: 단원
- `/next.html#/lab`: 시스템 라이브러리
- `/next.html#/lab/{systemId}`: 실험실 작업 공간
- `/next.html#/lab/{systemId}?state={token}`: 버전이 지정된 공유 상태

S29 전환 뒤에는 같은 hash 구조를 `app.html`이 맡고, 이전 주소는 호환 redirect/adapter로 보존한다.

### 6.3 배우기 단원 화면

단원은 다음 순서를 공통으로 사용한다.

1. 학습 목표와 필요한 선수 개념
2. 현상 또는 연구 질문
3. 물리적 가정과 변수 정의
4. 식의 유도와 항별 해석
5. 중요한 극한·근사·실패 조건
6. 단원 전용 Focus Experiment
7. 관찰 과제와 즉시 피드백
8. 핵심 정리와 다음 탐구
9. 현재 설정을 전체 실험실로 보내기

기본 역학은 별도 초급 단원으로 늘리지 않고 필요한 위치의 접이식 선수 설명으로 제공한다.

### 6.4 자유 실험실 화면

데스크톱의 기본 구조는 다음과 같다.

- **System Library**: 카드, 패밀리 필터, 검색, 최근/즐겨찾기
- **Workspace**: 애니메이션·기하·상태 표시와 실행 제어
- **Inspector**: 선택한 시스템에 필요한 물성, 초기 조건, 적분, 구동/제어만 표시
- **Analysis Dock**: 추가한 분석을 탭·분할 패널로 표시
- **Run Bar**: 실행/일시정지/한 단계/재시작, 시간, 속도, 진행/취소
- **Experiment Tray**: 비교 실행, sweep, ensemble, 저장된 run
- **Export Center**: 현재 데이터와 분석에 가능한 내보내기만 표시

시스템 전환 시 기존 값은 이름만으로 억지 이식하지 않는다. 호환되는 canonical field만 옮기고, 나머지는 요약을 보여 준 뒤 유지/초기화 여부를 선택하게 한다.

## 7. 단일 기능 카탈로그

UI가 파일명이나 조건문으로 기능을 추측하지 않도록 모든 기능을 선언형 registry에 등록한다.

### 7.1 `SystemDefinition`

각 시스템 정의는 최소한 다음을 가진다.

- 안정된 `id`, 이름, 설명, 패밀리, 검색 태그
- engine adapter와 지원 state schema 버전
- 자유도와 좌표계, 매개변수/초기 조건 schema
- 기본 preset과 검증 규칙
- 지원 적분기, 분석, 비교, sweep, import/export
- 렌더러와 성능 등급, worker/wasm 요구
- 과학적 제한, 경고, 참고 단원

대상 시스템 패밀리는 다음과 같다.

| 패밀리 | 주요 시스템 |
|---|---|
| 고전 다중 진자 | double, compound, triple, N-chain |
| 유연·구속 계 | spring, rope, double-string |
| 공간 운동 | spherical, spherical-chain, embedded |
| 구동·제어 | driven, coupled, inverted, cart-pole, parametric |
| 비선형 발진기 | Duffing, Van der Pol, Kapitza, Mathieu, friction, Pyragas |
| 네트워크 | magnetic, pendulum-network, Huygens, Kuramoto, chimera |
| 확률·격자·장 | stochastic, FPUT, lattice, sine-Gordon, Frenkel–Kontorova |
| 이산·양자 | standard map, quantum kicked rotor, unitary Floquet |

### 7.2 `AnalysisDefinition`

각 분석은 다음을 선언한다.

- 안정된 `id`, 입력 데이터 종류와 호환 시스템 조건
- 파라미터 schema와 기본값
- 계산 위치(main/worker/wasm), 비용 추정, 취소 가능 여부
- 출력 artifact 종류와 렌더러
- 단위·불확실성·해석 지침
- 직렬화와 export 지원

분석 카탈로그의 목표 범위:

- 기본: 상태/시간, 에너지, 위상공간, FFT, NAFF
- 카오스: Poincaré, Lyapunov spectrum, SALI, FLI, 0–1 test, shadowing
- 재귀/차원: RQA, recurrence network, correlation dimension, multifractal
- 수송/기하: topological entropy, transfer operator, CLV, FTLE/LCS
- 인력권: basin, uncertainty, Wada
- 안정성/분기: fixed point, periodic orbit, Floquet, Melnikov, continuation, branch switching, Neimark–Sacker, torus, Arnold tongue, codimension-2
- 실험 설계: compare, sweep, ensemble, integrator comparison
- 역문제/UQ: parameter estimation, video/sensor/CSV import, Sobol, PCE, surrogate
- 데이터 기반: SINDy, DMD, HAVOK, reservoir, Hamiltonian learning, Arnoldi/Lanczos

## 8. 배우기 콘텐츠 계약

전체 과정과 86개 단원의 정확한 목록은 `curriculum-map-ko.md`가 소유한다. 각 단원은 텍스트 페이지가 아니라 다음 구조를 만족하는 데이터 모듈이다.

```ts
interface LearnUnitDefinition {
  id: string;
  courseId: string;
  title: LocalizedText;
  objectives: string[];
  prerequisites: UnitRef[];
  concepts: ConceptBlock[];
  equations: EquationBlock[];
  focusExperiment: FocusExperimentDefinition;
  checks: Checkpoint[];
  labTransfer: LabTransferDefinition;
  references: Citation[];
  contentVersion: number;
}
```

`FocusExperimentDefinition`은 허용된 시스템, 노출할 변수, 고정 변수, 기본 preset, 관찰할 plot, 가이드 단계, 성공 조건, 실험실로 보낼 canonical state를 선언한다. 계산식은 담지 않는다.

콘텐츠는 `content/learn/{courseId}/{unitId}.ts|mdx`와 schema 검증을 사용한다. 수식 접근성 텍스트, 한국어/영어 키, 출처, 단위 테스트 가능 예제를 포함한다. 진행도는 계정 없이도 local storage에 저장되지만 기능 권한과 분리한다.

## 9. 제안 코드 구조

```text
next.html                         # S04~S28 병렬 진입점
src/product/
  app/                            # bootstrap, router, shell
  catalog/                        # systems, analyses, integrators
  contracts/                      # canonical state, route, share schemas
  adapters/                       # 기존 엔진/분석/저장 형식 연결
  design-system/                  # token, component, a11y primitives
  lab/                            # library, workspace, inspector, dock
  learn/                          # courses, unit renderer, progress
  experiments/                    # Focus Experiment runtime
  persistence/                    # migration, storage, share
  provenance/                     # run/artifact lineage
content/learn/                    # 86개 단원 데이터
tests/product/                    # registry/contract/unit/integration
e2e/redesign/                     # 사용자 여정과 시각 회귀
documents/redesign/               # 계획과 상태
```

기존 디렉터리를 새 폴더로 옮기는 것이 아니다. `src/product/adapters`가 안정된 기존 공개 경계를 호출한다. 기존 경계가 불충분할 때만 characterization test를 먼저 추가한 뒤 최소한의 adapter용 API를 확장한다.

## 10. 상태·저장·공유 계약

canonical experiment state는 최소한 다음을 포함한다.

```ts
interface ExperimentStateV1 {
  schema: "pendulum-experiment/v1";
  systemId: string;
  modelVersion: string;
  parameters: Record<string, QuantityValue>;
  initialConditions: Record<string, QuantityValue>;
  integrator: IntegratorState;
  runtime: RuntimeState;
  analyses: AnalysisState[];
  seed?: string;
  provenance?: ProvenanceRef;
}
```

규칙:

- 값과 단위를 분리하고 SI canonical value를 유지한다.
- UI 레이아웃은 실험 의미와 별도 저장한다.
- 모든 persisted object에 schema version을 둔다.
- migration은 순방향이며 원본을 변경하지 않고 복사본을 변환한다.
- 알 수 없는 필드는 조용히 버리지 않고 경고와 복구 경로를 제공한다.
- 공유 token에는 민감 정보나 로컬 절대 경로를 넣지 않는다.
- stochastic 시스템은 seed와 생성기 버전을 기록한다.
- 분석 artifact는 입력 run, 알고리즘 버전, 설정, 생성 시간을 추적한다.

## 11. 안전한 구현과 전환 전략

### 11.1 병렬 구축

S04에서 `next.html`을 추가하고 새 셸을 별도 경로에서 실행한다. S04~S28 동안 기존 `app.html`은 그대로 사용 가능해야 한다. 새 구현이 기존 모듈을 부를 때 adapter를 거치므로 회귀가 발생하면 기존 앱을 기준으로 비교할 수 있다.

### 11.2 수직 절편 우선

S07에서 이중진자와 복합진자에 대해 선택→설정→실행→분석→내보내기 전 과정을 먼저 완성한다. S08~S09에서는 배우기 한 과정과 전용 실험→실험실 전달까지 완성한다. 이 두 절편이 UX와 계약의 실제 검증점이다.

### 11.3 패밀리별 확장

S10~S17은 시스템 패밀리별로 registry와 adapter, 화면, 검증, 예제를 함께 추가한다. 이름만 등록된 카드나 동작하지 않는 버튼은 완료로 인정하지 않는다.

### 11.4 분석과 연구 기능 통합

S18~S24는 분석을 계산 가능성에 따라 노출하고, 긴 계산에는 진행률·취소·worker 격리를 제공한다. 연구 프로젝트→run→artifact의 provenance를 export까지 유지한다.

### 11.5 동등성 심사와 cutover

S28에서 기존 기능 하나마다 새 접근 경로, 결과 동등성, 저장/공유 migration을 기록한 parity matrix를 100% 통과시킨다. 미통과 항목이 하나라도 있으면 S29를 시작하지 않는다. S29에서만 새 앱을 `app.html`로 전환하며 이전 구현은 한 릴리스 이상 복구 가능한 형태로 남긴다.

## 12. 검증 프로필

각 단계는 `execution-plan-ko.md`가 지정한 프로필을 수행한다.

| 프로필 | 필수 검증 |
|---|---|
| D — 문서/계약 | 문서 구조 검사, JSON/schema 검사, 관련 단위 테스트, `npm run typecheck` |
| C — 컴포넌트 | D + 관련 Vitest + 접근성 component test + production build |
| E — 엔진 연결 | C + 수치 characterization/golden test + worker 취소/오류 test |
| U — 사용자 여정 | C/E + Playwright 주요 여정 + keyboard/mobile + 시각 회귀 |
| R — 릴리스 | 전체 Vitest + typecheck/lint/build + 전체 E2E + standalone/PWA + 성능/a11y 감사 |

공통 완료 조건:

- 새 오류와 경고가 없다.
- 기존 테스트가 모두 통과한다.
- loading, empty, invalid, error, cancel 상태가 구현되어 있다.
- 새 공개 계약과 migration에 테스트가 있다.
- 문서와 실제 registry 수가 일치한다.
- `status.json`은 검증 성공 후에만 갱신한다.

## 13. UX 수용 기준

- 처음 방문한 사용자가 한 화면에서 `배우기`와 `실험실`의 차이를 설명할 수 있다.
- 실험실에서 3번 이내의 주요 선택으로 시스템을 실행할 수 있다.
- 선택한 시스템과 호환되지 않는 제어·분석은 기본 화면에 나타나지 않는다.
- 고급 도구는 검색으로 발견할 수 있고 잠겨 있지 않다.
- 모든 입력은 keyboard로 접근 가능하며 focus가 보인다.
- 320px 폭에서도 핵심 실행과 값 편집이 가능하다.
- 수식·그래프에 텍스트 설명과 단위가 있다.
- 200% 확대에서 기능 손실이 없다.
- 긴 계산은 UI를 멈추지 않고 진행률과 취소를 제공한다.
- 잘못된 설정은 원인과 수정 방법을 사용자 언어로 알려 준다.

## 14. 성능 예산

- 초기 진입에서는 현재 선택한 공간과 시스템에 필요한 코드만 로드한다.
- 고급 분석과 콘텐츠 과정은 lazy chunk로 분리한다.
- animation frame과 분석 계산을 분리하고 긴 계산은 worker/wasm을 우선한다.
- 상태 변경은 전체 앱 재렌더가 아닌 관련 패널로 제한한다.
- 대용량 궤적은 복사 대신 typed array/transferable과 downsampling을 사용한다.
- S01에서 기준 장치의 startup, FPS, memory, 대표 분석 시간을 기록하고 S30에서 회귀 허용치를 확정한다.

## 15. 주요 위험과 방지책

| 위험 | 방지책 | 중단 조건 |
|---|---|---|
| 기존 기능 유실 | 자동 인벤토리와 parity matrix | 소유자 없는 기존 기능 발견 |
| 수치 결과 변화 | characterization/golden test, adapter 우선 | 허용 오차 밖 결과 |
| 두 엔진 생성 | Focus Experiment에 계산 코드 금지 | 중복 운동방정식 발견 |
| 단계가 너무 커짐 | 30개 deliverable, 단계당 1~3 commit | 범위 외 파일 변경 필요 |
| 데이터 손상 | versioned migration, 원본 보존, round-trip test | 되돌릴 수 없는 변환 |
| UI 과밀 재발 | capability filter와 progressive disclosure | 비호환 제어 상시 노출 |
| 느린 분석이 UI 정지 | worker, progress, cancel, resource limit | 취소 불가 장기 작업 |
| 문서와 구현 불일치 | registry에서 목록/상태 생성 | 수동 중복 목록 증가 |
| 브랜치/코드 유실 | 장기 브랜치, 명시적 staging, 매 단계 push | dirty tree 또는 push 실패 |

## 16. Git·작업 운영 규칙

- 모든 단계는 `codex/redesign`에서 실행한다.
- 실행 전 `git status`, 현재 브랜치, `status.json`, 의존 단계, 원격 동기 상태를 확인한다.
- 무관한 변경이 있으면 자동으로 stash/reset하지 않고 중단한다.
- 한 요청은 한 단계만 수행한다. 단계 내부에서 1~3개의 응집된 커밋을 허용한다.
- `git add -A`를 쓰지 않고 변경한 경로만 명시적으로 stage한다.
- 검증 실패 상태를 완료로 표시하거나 push하지 않는다.
- push 성공을 확인한 뒤 사용자에게 commit hash와 다음 번호를 보고한다.
- merge, tag, release, 기존 브랜치 삭제는 별도 승인 없이는 수행하지 않는다.

## 17. 릴리스 이정표

- **Architecture Preview (S01~S06)**: catalog, canonical state, 셸, 디자인 시스템, 실험실 골격
- **Core Vertical Slice (S07~S09)**: 이중/복합진자와 과정 1의 완전한 왕복
- **System Complete Preview (S10~S17)**: 모든 시스템 패밀리 접근 가능
- **Analysis & Research Candidate (S18~S24)**: 기존 고급 분석과 연구 산출물 통합
- **Curriculum Complete (S25~S27)**: 86개 단원 완성
- **Cutover Candidate (S28~S30)**: 데이터 호환, 동등성, 전환, 릴리스 품질

## 18. 최종 완료 정의

다음이 모두 참일 때만 재설계를 완료했다고 말한다.

- 제품 최상위 구조가 배우기/실험실 두 공간으로 일관된다.
- 8개 과정·86개 단원이 schema와 콘텐츠 품질 검사를 통과한다.
- 각 단원에 계산 엔진을 재사용하는 전용 실험과 실험실 전달이 있다.
- 모든 기존 시스템·분석·계산·비교·가져오기·내보내기 기능이 새 UI에서 도달 가능하다.
- 기능 잠금과 audience mode가 없다.
- 기존 저장 데이터와 공유 링크가 migration 또는 명시적 복구 안내로 처리된다.
- parity matrix가 100% 통과하고 전체 테스트·E2E·접근성·성능·standalone 검증이 통과한다.
- `app.html` 전환 뒤에도 rollback이 가능하다.
- 문서, 상태, Git 기록, 원격 브랜치가 일치한다.
- Landing Page 재설계를 시작할 수 있는 실제 제품 메시지·화면·라우트 handoff 문서가 있다.

구현 순서와 각 단계의 정확한 산출물은 `execution-plan-ko.md`, 교육 내용의 단일 목록은 `curriculum-map-ko.md`를 따른다.
