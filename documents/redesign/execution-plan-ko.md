# Pendulum Lab 재설계 Codex 실행 계획

> 계획 버전: v2.1 안전 보강판
>
> 총 단계: 30
>
> 대상 브랜치: `codex/redesign`
>
> 권장 실행 프로필: GPT-6 Astra / Ultra
>
> 제품 코드 기준 저장소: 현재 `pendulum_lab_modular`

## 1. 사용법

새 대화에 다음 세 항목을 첨부한 뒤 번호만 말하면 된다.

1. `pendulum_lab_modular` 폴더
2. `Pendulum_Lab_Complete_Redesign_Roadmap_KO.md`
3. `Pendulum_Lab_Codex_Execution_Steps_KO.md`

```text
1단계 실행해줘.
```

`1단계`, `S01`, `재설계 1단계`도 같은 요청으로 해석한다. 사용자는 Git 브랜치를 직접 선택할 필요가 없다. Codex가 첨부 폴더의 저장소를 확인하고, 사용자 변경이 없는 경우에만 원격 `codex/redesign`과 일치하도록 자동 준비한다.

두 바탕화면 Markdown은 전달용 사본이다. 저장소의 `AGENTS.md`와 `documents/redesign/`가 항상 원본이다. 자세한 branch 선택, 중간 보존, push 복구와 승인 규칙은 `stage-run-protocol-ko.md`를 따른다.

한 단계가 큰 경우 Codex 내부 문맥이 갱신되어도 같은 작업을 계속하고, 내부 checkpoint를 commit/push한다. 안전하게 완료할 수 없는 외부 차단 사유가 생기지 않는 한, 사용자에게 하위 단계 번호를 다시 입력하라고 돌려보내지 않는다.

## 2. 프로젝트와 Git 정책

이 계획은 새 프로젝트를 만들지 않는다. 현재 저장소에서 기존 계산 자산을 보존하고 새 제품 계층을 추가한다.

모든 단계에서 다음 순서를 지킨다.

1. 첨부 폴더에서 Git 저장소 루트를 확인한다.
2. dirty worktree를 검사하고 `origin/codex/redesign`을 fetch한다.
3. 안전 프로토콜에 따라 redesign 브랜치를 자동 선택하고 로컬/원격 HEAD를 일치시킨다.
4. `npm run redesign:check`와 `npm run redesign:preflight -- N`을 통과시킨다.
5. `status.json`의 `nextStage`, 이전 단계의 원격 status commit과 필수 산출물을 확인한다.
6. 단계 progress 문서에 내부 checkpoint, 보존 계약, 변경 경로와 검증을 먼저 기록하고 `activeStage`만 갱신한다. `nextStage`는 유지한다.
7. 관련 기존 코드와 테스트를 읽고 characterization test 필요성을 판단한다.
8. 선택 단계만 checkpoint 단위로 구현·검증·명시적 stage·commit·push한다.
9. 모든 구현 commit이 원격에 있음을 확인한 뒤 단계 전체 검증을 실행한다.
10. 마지막에만 `status.json`을 완료 상태로 갱신해 별도 status commit으로 push한다.
11. 원격 branch가 status commit을 가리킬 때만 단계 완료를 보고한다.

금지 사항:

- `master` 직접 commit/push, force push, 자동 merge
- dirty worktree의 사용자 변경을 stash/reset/restore/delete
- 검증 실패를 무시한 완료 표시
- 원격보다 앞서거나 갈라진 상태에서 다음 단계 시작
- push되지 않은 로컬 `status.json`을 근거로 다음 단계 시작
- 기능 동등성 확인 전 기존 진입점·API·저장 형식 삭제
- 선택한 번호 이후 단계의 선행 구현

## 3. 검증 프로필

실제 `package.json` 스크립트를 먼저 확인하고 같은 목적의 프로젝트 명령을 사용한다. 명령 이름이 바뀌었으면 문서도 함께 고친다.

### D — 문서·계약

- 변경된 JSON/schema/registry validation
- 문서 내 ID, 링크, 개수, 중복, code fence 검사
- 관련 unit test
- `npm run typecheck`

### C — UI 컴포넌트

- D
- 관련 Vitest/component test
- keyboard와 자동 접근성 검사
- production build

### E — 엔진 연결

- C
- 기존 엔진 대비 characterization/golden test
- 단위·좌표·허용 오차·결정론 검사
- worker 진행/취소/오류 경로

### U — 사용자 여정

- C 또는 E
- 관련 Playwright desktop/mobile 여정
- loading/empty/invalid/error/cancel 상태
- 주요 화면 시각 회귀

### R — 릴리스

- 전체 Vitest와 typecheck/lint/build
- 전체 Playwright, 접근성, keyboard, mobile
- standalone/PWA/offline smoke
- 성능·메모리·bundle 회귀
- migration과 rollback rehearsal
- dependency/secret/supply-chain 감사와 high/critical 판정 기록

## 4. 단계 공통 완료 정의

각 단계는 다음을 모두 만족해야 한다.

- 범위의 모든 산출물이 실제로 동작하며 placeholder-only UI가 없다.
- 새 계약·adapter·migration에는 정상/경계/실패 테스트가 있다.
- 기존 테스트에 회귀가 없다.
- 문서와 구현된 registry가 일치한다.
- 변경 diff에 단계 밖 수정, 비밀정보, 생성 쓰레기가 없다.
- `status.json`의 `completedStages`, `lastCompletedStage`, `nextStage`, `blockedStage`가 일관된다.
- stage progress 문서에 checkpoint·test·commit·보존 증거가 남아 있다.
- 모든 구현 commit을 먼저 push한 뒤 별도의 status commit이 원격에 존재한다.
- review checkpoint 단계에서는 사용자가 확인할 화면과 checklist를 제공한다.

## 5. 30단계 실행표

### S01 — 기준선 안전망과 전수 인벤토리

- **의존성:** 없음. `status.json.nextStage = 1`이어야 한다.
- **목표:** 재설계 중 어떤 계산·기능·데이터도 잃지 않도록 현재 상태를 기계적으로 기록한다.
- **구현:** 시스템, 분석, 적분기, 제어, importer/exporter, 저장 schema, route, worker, public API, 테스트 fixture를 스캔하는 read-only inventory script와 보고서를 만든다. 대표 시스템의 수치 golden fixture, 시작 시간/FPS/메모리/대표 분석 시간 기준도 기록한다. 기존 1,647개 테스트 기준과 실제 현재 결과 차이를 설명한다. lockfile, dependency audit, secret scan과 GitHub의 알려진 보안 경고도 현재 기준선으로 기록하되 자동 upgrade는 하지 않는다.
- **주요 경로:** `scripts/redesign/`, `documents/redesign/baseline/`, `tests/characterization/`, 기존 module index.
- **검증:** D + 전체 `npm test`; inventory에서 발견한 모든 항목에 소유 파일과 향후 단계가 있어야 한다.
- **완료 게이트:** orphan 기능 0개, 깨진 registry import 0개, golden fixture 재실행 가능, baseline 보고서가 commit/환경 정보와 해결/미해결 보안 항목을 포함한다.
- **권장 commit:** `test(redesign): lock simulation behavior baseline`, `docs(redesign): inventory existing capabilities`.

### S02 — 통합 시스템·분석·적분기 카탈로그

- **의존성:** S01.
- **목표:** 화면과 콘텐츠가 동일한 선언형 기능 목록을 사용하게 한다.
- **구현:** typed `SystemDefinition`, `AnalysisDefinition`, `IntegratorDefinition`, capability predicate와 registry validation을 만든다. S01의 모든 기능을 안정 ID로 등록하고 중복 이름, 끊긴 adapter, 잘못된 호환성, 누락 번역을 빌드 시 실패시킨다. 아직 기존 엔진 호출 방식은 바꾸지 않는다.
- **주요 경로:** `src/product/catalog/`, `src/product/contracts/catalog*`, `tests/product/catalog/`.
- **검증:** D; baseline inventory와 registry의 양방향 coverage test.
- **완료 게이트:** 등록 누락 0개, ID 중복 0개, 모든 시스템이 최소 한 engine adapter와 연결, 모든 분석이 입력 요구를 선언한다.
- **권장 commit:** `feat(catalog): add typed capability registries`, `test(catalog): enforce baseline coverage`.

### S03 — canonical 상태·공유·라우트 계약

- **의존성:** S02.
- **목표:** 배우기와 실험실, 저장과 공유가 같은 실험 의미를 교환하게 한다.
- **구현:** versioned `ExperimentState`, quantity/unit, runtime, analysis, provenance, UI-state 분리 계약을 정의한다. route parser/serializer와 compact share envelope을 만든다. 기존 상태는 바꾸지 않고 adapter interface와 round-trip fixture를 우선 만든다. 알 수 없는 버전·필드·손상 데이터의 오류 모델을 정의한다.
- **주요 경로:** `src/product/contracts/`, `src/product/persistence/`, `tests/product/contracts/`.
- **검증:** D; property/round-trip test, deterministic serialization, unsafe payload rejection.
- **완료 게이트:** serialize→parse 의미 보존, 단위 손실 0, seed 보존, UI layout 없이 실험 복원 가능.
- **권장 commit:** `feat(contracts): define versioned experiment state`, `test(contracts): cover routes and share round trips`.

### S04 — 병렬 진입점·bootstrap·router·공통 셸

- **의존성:** S03.
- **목표:** 기존 `app.html`과 독립적으로 새 앱을 안전하게 열 수 있게 한다.
- **구현:** `next.html`, code-split bootstrap, hash router, error boundary, 공통 헤더와 Learn/Lab 진입 화면을 만든다. 알 수 없는 route, 초기화 실패, lazy chunk 실패 화면을 제공한다. 기존 `app.html`은 수정하지 않는다.
- **주요 경로:** `next.html`, `src/product/app/`, `tests/product/app/`, `e2e/redesign/shell*`.
- **검증:** C + 핵심 route Playwright smoke.
- **완료 게이트:** 직접 URL/새로고침/뒤로가기 동작, 두 공간 식별 가능, 기존 앱과 동시 build 가능.
- **권장 commit:** `feat(redesign): add parallel application shell`, `test(redesign): cover bootstrap and routing`.

### S05 — 디자인 시스템·접근성·반응형 기반

- **의존성:** S04.
- **목표:** 이후 수십 화면이 일관되고 좁은 화면과 키보드에서도 사용 가능하게 한다.
- **구현:** color/type/spacing/motion token, button/input/quantity/section/tabs/dialog/toast/progress/split-panel/card를 만든다. focus, reduced motion, high contrast, screen-reader status, 320px/desktop layout 규칙과 한국어 타이포를 고정한다. component gallery를 제공한다.
- **주요 경로:** `src/product/design-system/`, `css/product/`, `tests/product/design-system/`, `e2e/redesign/a11y*`.
- **검증:** C + axe/keyboard/320px/200% zoom + 시각 baseline.
- **완료 게이트:** 핵심 컴포넌트 접근성 위반 0, focus trap/restore 정상, 모든 token light/dark 지원.
- **권장 commit:** `feat(ui): establish redesign design system`, `test(ui): add accessibility and responsive baselines`.

### S06 — 자유 실험실 골격

- **의존성:** S05.
- **목표:** 시스템 중심의 이해 가능한 실험 조립 화면을 완성한다.
- **구현:** System Library 검색/패밀리/최근/즐겨찾기, Workspace, schema-driven Inspector, Analysis Dock, Run Bar, Experiment Tray, Export Center를 만든다. 호환 capability만 보이고 고급 항목은 잠금 없이 확장한다. 이 단계에서는 mock adapter로 상태 흐름을 검증한다.
- **주요 경로:** `src/product/lab/`, `src/product/catalog/selectors*`, `tests/product/lab/`, `e2e/redesign/lab-shell*`.
- **검증:** U(C).
- **완료 게이트:** 시스템 선택 3회 이내 실행 준비, 비호환 제어 0, 빈/오류/취소/모바일 패널 흐름 완성.
- **권장 commit:** `feat(lab): build system-first laboratory shell`, `test(lab): cover capability-driven workflows`.

### S07 — 이중·복합진자 완전 수직 절편

- **의존성:** S06.
- **목표:** 실제 엔진을 이용해 선택부터 결과 내보내기까지 제품 품질의 첫 경로를 만든다.
- **구현:** double/compound adapter, animation, 상태/시간, 에너지, 위상공간, Poincaré, 최대 Lyapunov, CSV/figure/state export를 연결한다. 물성·초기조건·적분기 schema와 오류/단위 경고, 긴 분석의 progress/cancel을 제공한다.
- **주요 경로:** `src/product/adapters/physics/`, `src/product/lab/views/`, `src/product/adapters/analysis/`, 관련 tests.
- **검증:** E + U; S01 golden 결과와 허용 오차 비교.
- **완료 게이트:** 두 시스템의 save/reload/export round trip, 분석 취소, 기존 결과 동등성, desktop/mobile 여정 통과. 완료 보고에 첫 사용자 review checklist와 미리보기 경로를 포함한다.
- **권장 commit:** `feat(lab): deliver double and compound pendulum slice`, `test(lab): verify core numerical parity`.

### S08 — 배우기 콘텐츠 파이프라인과 단원 프레임

- **의존성:** S07.
- **목표:** 86개 단원을 안전하고 일관되게 제작할 플랫폼을 만든다.
- **구현:** course/unit schema, 콘텐츠 loader, 수식/그림/인용/용어/선수개념 block, 과정 목록, 단원 navigation, checkpoint, local progress를 만든다. 잘못된 ID, 빠진 변수 설명, 중복 단원, 끊긴 실험 참조를 검증한다. 진행도와 기능 권한을 분리한다.
- **주요 경로:** `src/product/learn/`, `content/learn/schema*`, `tests/product/learn/`.
- **검증:** C + 콘텐츠 schema D + Learn 주요 route U.
- **완료 게이트:** sample unit 렌더/새로고침/진도 복구, 수식 접근성, 콘텐츠 오류가 build에서 탐지됨.
- **권장 commit:** `feat(learn): add versioned curriculum pipeline`, `test(learn): validate units and progress`.

### S09 — 과정 1과 Focus Experiment 왕복

- **의존성:** S08.
- **목표:** 이론→전용 실험→전체 실험실의 완전한 학습 경험을 검증한다.
- **구현:** 과정 1의 1.1~1.8 콘텐츠를 완성한다. Focus Experiment runtime은 S07 adapter를 재사용하고 단원별 노출/고정 변수, plot, 관찰 task를 선언으로 구성한다. `실험실에서 계속`은 canonical state와 출처 단원을 전달한다.
- **주요 경로:** `content/learn/course-1/`, `src/product/experiments/`, 관련 unit/E2E.
- **검증:** E + U + 8단원 콘텐츠 품질 검사.
- **완료 게이트:** 8/8 단원 완성, 중복 운동방정식 0, 단원→Lab→뒤로가기 상태 보존, 모든 예상 관찰값 검증. 학습 경험 review checklist와 과학 검증 등급을 보고한다.
- **권장 commit:** `feat(learn): publish double-pendulum course`, `feat(experiments): connect focused experiments to lab`, `test(learn): cover course one journeys`.

### S10 — 삼중진자·N중 사슬

- **의존성:** S09.
- **목표:** 가변 자유도 다중진자를 새 Lab에 통합한다.
- **구현:** triple/N-chain adapter, 링크 목록 편집, 질량/길이/초기조건 bulk 도구, 가변 DOF animation/plot, 성능 경고와 worker 실행을 추가한다. 기존 preset/import/export를 유지한다.
- **주요 경로:** catalog definitions, physics adapters, Lab inspector/view, tests.
- **검증:** E + U; N 경계값, 성능, 취소, golden 비교.
- **완료 게이트:** 지원 N 범위 전체 validation, 링크 추가/삭제 시 데이터 대응, 저장 round trip.
- **권장 commit:** `feat(lab): integrate triple and n-link pendulums`, `test(lab): verify variable-dof systems`.

### S11 — 용수철·줄·이중 줄 진자

- **의존성:** S10.
- **목표:** 길이 자유도와 taut/slack 같은 사건을 이해 가능하게 표현한다.
- **구현:** spring/rope/double-string adapter, 길이·장력·사건 timeline, 제약 위반 경고, 사건 기반 초기화와 export를 추가한다. 시스템별로 의미 없는 강체 옵션은 숨긴다.
- **주요 경로:** catalog, constraint adapters, event views, tests.
- **검증:** E + U; 장력 0 교차, event ordering, 에너지/구속 오차 fixture.
- **완료 게이트:** 사건 전후 상태가 유한하고 재현 가능, slack UI 상태 명확, 비호환 분석 차단.
- **권장 commit:** `feat(lab): integrate elastic and rope pendulums`, `test(lab): characterize constraint transitions`.

### S12 — 구면·구면 사슬·embedded 계

- **의존성:** S11.
- **목표:** 3차원 좌표와 구속을 2차원 시스템과 혼동 없이 제공한다.
- **구현:** spherical/spherical-chain/embedded adapter, 3D camera/navigation, vector/plane overlays, angular momentum과 constraint residual view, 좌표 특이점 안내를 추가한다.
- **주요 경로:** spatial catalog/adapters/renderers, tests.
- **검증:** E + U; 회전 불변성, 구속 잔차, camera keyboard/touch, WebGL 실패 fallback.
- **완료 게이트:** 3D 상태 serialize/restore, 단위/좌표계 명시, renderer 부재 시 수치 결과 접근 가능.
- **권장 commit:** `feat(lab): integrate spatial pendulum systems`, `test(lab): verify constraints and spatial invariants`.

### S13 — 구동·결합·역진자·cart-pole·매개변수 계

- **의존성:** S12.
- **목표:** 외력과 제어가 있는 시스템의 설정을 시스템별로 정리한다.
- **구현:** driven/coupled/inverted/cart-pole/parametric adapters, forcing waveform editor, controller on/off와 gain, reference/state error view, resonance sweep 진입을 추가한다. 제어기와 plant 설정을 분리한다.
- **주요 경로:** driven/control catalog/adapters, Lab inspector panels, tests.
- **검증:** E + U; zero-force/passive limit, closed-loop fixture, saturation/invalid gain.
- **완료 게이트:** 구동 위상·주파수 round trip, 제어 실패가 안전하게 중지, 호환 시스템에만 controller 표시.
- **권장 commit:** `feat(lab): integrate driven and controlled pendulums`, `test(lab): verify forcing and control limits`.

### S14 — Duffing·Van der Pol·Kapitza·Mathieu·마찰·Pyragas

- **의존성:** S13.
- **목표:** 비선형 발진기와 비매끈·지연 동역학의 전용 제어와 시각화를 제공한다.
- **구현:** 6개 모델 adapter, 효과 퍼텐셜/limit cycle/stick-slip/delay history view, history initialization, 모델별 preset과 경고를 추가한다.
- **주요 경로:** nonlinear catalog/adapters/views, tests.
- **검증:** E + U; known limit, delay buffer reproducibility, discontinuity event, stability fixture.
- **완료 게이트:** 각 모델 대표 현상 재현, delay state 저장, 알고리즘 한계 노출.
- **권장 commit:** `feat(lab): integrate nonlinear oscillator family`, `test(lab): verify nonlinear and delay dynamics`.

### S15 — 자기·진자 네트워크·Huygens·Kuramoto·chimera

- **의존성:** S14.
- **목표:** 다중 개체와 네트워크 구조를 전용 편집·요약 도구로 다룬다.
- **구현:** magnetic/network/Huygens/Kuramoto/chimera adapters, topology editor, order parameter와 local coherence, basin seed grid, node/edge import/export를 추가한다.
- **주요 경로:** network catalog/adapters/views, tests.
- **검증:** E + U; node permutation, graph validation, seed repeatability, large-network cancellation.
- **완료 게이트:** invalid graph 차단, 네트워크 규모별 성능 안내, aggregate와 개별 상태 전환 가능.
- **권장 commit:** `feat(lab): integrate magnetic and network systems`, `test(lab): verify topology and synchronization metrics`.

### S16 — 확률·FPUT·격자·sine-Gordon·Frenkel–Kontorova

- **의존성:** S15.
- **목표:** ensemble과 공간적으로 분포된 계의 데이터·성능 요구를 통합한다.
- **구현:** stochastic/FPUT/lattice/sine-Gordon/FK adapters, seed manager, field/lattice heatmap, ensemble summary, boundary condition과 grid 설정, 대용량 downsampling을 추가한다.
- **주요 경로:** stochastic/field catalog/adapters/views/workers, tests.
- **검증:** E + U; seed 결정론, continuum/lattice fixture, boundary conditions, memory/cancel.
- **완료 게이트:** 같은 seed 재현, ensemble provenance 보존, raw/downsampled export 구분.
- **권장 commit:** `feat(lab): integrate stochastic lattice and field systems`, `test(lab): verify seeds boundaries and ensembles`.

### S17 — standard map·양자 kicked rotor·unitary Floquet

- **의존성:** S16.
- **목표:** 연속 고전 궤적과 다른 이산·양자 상태를 동일 제품 안에서 명확히 구분한다.
- **구현:** standard-map/QKR/unitary-Floquet adapters, iteration runner, phase cylinder, wavefunction/quasienergy views, normalization/unitarity diagnostics를 추가한다. 시간 적분기 대신 호환 가능한 stepper만 표시한다.
- **주요 경로:** map/quantum catalog/adapters/views/workers, tests.
- **검증:** E + U; norm/unitarity, known spectra, deterministic iteration, complex state serialization.
- **완료 게이트:** 고전/양자 단위와 state 표현 명확, 비호환 연속계 분석 차단, export 복원 가능. 전체 시스템 패밀리 탐색·설정 review checklist를 제공한다.
- **권장 commit:** `feat(lab): integrate maps and quantum floquet systems`, `test(lab): verify discrete and unitary evolution`.

### S18 — 핵심 카오스 진단 통합

- **의존성:** S17.
- **목표:** 자주 쓰는 분석을 모든 호환 시스템에서 한 방식으로 실행한다.
- **구현:** state/time, energy, phase, FFT, NAFF, Poincaré, Lyapunov spectrum, SALI, FLI, 0–1, shadowing definitions/adapters/views를 완성한다. 요구 sampling, transient, tangent model, 비용과 신뢰 경고를 표시한다.
- **주요 경로:** `src/product/adapters/analysis/core/`, Analysis Dock renderers, workers, tests.
- **검증:** E + U; analytic/synthetic signal과 기존 결과 golden, cancel/progress.
- **완료 게이트:** 호환성 matrix 전부 통과, 분석 artifact 재로드, 부적절한 데이터에는 설명 가능한 거부.
- **권장 commit:** `feat(analysis): unify core chaos diagnostics`, `test(analysis): validate core diagnostic parity`.

### S19 — 고급 카오스·수송·인력권 분석

- **의존성:** S18.
- **목표:** 연구급 진단을 별도 mode 없이 발견 가능하고 안전하게 제공한다.
- **구현:** RQA, recurrence network, correlation dimension, multifractal, topological entropy, transfer operator, CLV, FTLE/LCS, basin/uncertainty/Wada를 registry와 Dock에 통합한다. 해상도·표본 수·threshold·신뢰 범위를 명시하고 대형 계산을 worker로 격리한다.
- **주요 경로:** advanced analysis adapters/renderers/workers, tests.
- **검증:** E + U; published/synthetic benchmark, resolution convergence, resource limit/cancel.
- **완료 게이트:** 모든 고급 분석에 전제·비용·불확실성 표시, 결과 provenance와 export 완성.
- **권장 commit:** `feat(analysis): integrate advanced chaos geometry`, `test(analysis): benchmark advanced diagnostics`.

### S20 — 고정점·주기궤도·분기·안정성 도구

- **의존성:** S19.
- **목표:** 해 탐색부터 2-매개변수 분기까지 하나의 연속 워크플로로 만든다.
- **구현:** fixed point, periodic shooting, Floquet, Melnikov, continuation, pseudo-arclength, branch switch, Neimark–Sacker, torus, Arnold tongue, codim-2 도구를 통합한다. 초기 guess, convergence log, branch graph와 실패 복구를 제공한다.
- **주요 경로:** stability/bifurcation adapters, workflow UI, workers, tests.
- **검증:** E + U; known normal forms/fixtures, branch continuation/restart, nonconvergence/cancel.
- **완료 게이트:** 해와 branch가 저장·복원되고 원 run과 연결, 실패가 상태를 손상하지 않음.
- **권장 commit:** `feat(analysis): unify stability and bifurcation workflows`, `test(analysis): verify continuation and floquet results`.

### S21 — 비교·sweep·ensemble·적분기 비교

- **의존성:** S20.
- **목표:** 한 번 실행 UI를 재사용해 재현 가능한 다중 run 실험을 만든다.
- **구현:** paired compare, parameter grid/log/LHS sweep, ensemble, integrator comparison builder와 queue, progress/cancel/resume, summary view를 만든다. 개별 run과 aggregate artifact의 관계를 기록한다.
- **주요 경로:** `src/product/lab/experiments/`, runtime queue/workers, tests.
- **검증:** E + U; deterministic scheduling, partial failure, cancel/resume, bounded concurrency.
- **완료 게이트:** 수백 run에서도 UI 응답, 실패 run 식별/재실행, 전체 설정 export.
- **권장 commit:** `feat(experiments): add comparison sweep and ensemble workflows`, `test(experiments): verify scheduling and provenance`.

### S22 — 역문제·UQ·관측 데이터 가져오기

- **의존성:** S21.
- **목표:** 실제 관측과 불확실성을 안전하게 계산 실험에 연결한다.
- **구현:** parameter estimation, video/sensor/CSV import, calibration/unit/time alignment/missing-data wizard, Sobol, PCE, surrogate workflow를 통합한다. 원본 데이터는 불변 artifact로 보존하고 변환 이력을 기록한다.
- **주요 경로:** import adapters, inverse/UQ tools, provenance, tests/fixtures.
- **검증:** E + U; malicious/malformed files, known parameter recovery, UQ benchmark, cancel/memory.
- **완료 게이트:** preview 후에만 import 확정, 단위/시간축 명시, 추정 결과와 원본 관계 복원 가능.
- **권장 commit:** `feat(research): integrate observations inverse problems and uq`, `test(research): validate imports and uncertainty workflows`.

### S23 — 데이터 기반 모델·대규모 고유해석

- **의존성:** S22.
- **목표:** SINDy/DMD/HAVOK/학습 모델과 Arnoldi/Lanczos를 공통 run/artifact 체계로 제공한다.
- **구현:** feature/library 선택, train/validation split, model diagnostics, rollout comparison, Hamiltonian constraint, Krylov convergence/residual view를 만든다. seed, 데이터 slice, preprocessing, model version을 provenance에 저장한다.
- **주요 경로:** data-driven/eigensolver adapters, workers, views, tests.
- **검증:** E + U; synthetic recovery, leakage prevention, residual thresholds, resource/cancel.
- **완료 게이트:** 결과 재학습/재평가 가능, 모델과 데이터 lineage 보존, 실패/과적합 경고 표시.
- **권장 commit:** `feat(research): integrate data-driven and krylov tools`, `test(research): verify learning and eigensolver artifacts`.

### S24 — 연구 프로젝트·run·artifact·내보내기

- **의존성:** S23.
- **목표:** 지금까지의 도구를 재현 가능한 연구 결과물로 묶는다.
- **구현:** project/session/run/artifact 계층, notebook narrative, figure composer, report, provenance ZIP, reviewer view를 통합한다. 파일명, manifest, checksum, software/schema version, citations를 포함한다. 기존 research export와 호환 adapter를 둔다.
- **주요 경로:** `src/product/provenance/`, research workspace/export adapters, `reviewer.html`, tests.
- **검증:** E + U; ZIP manifest/checksum, import round trip, reviewer offline view, unsafe path 검사.
- **완료 게이트:** 새 환경에서 패키지 검증·열기 가능, figure가 원 run을 추적, 누락 artifact 명시. 연구 워크플로 review checklist와 재현 패키지를 제공한다.
- **권장 commit:** `feat(research): deliver reproducible project workflow`, `test(research): verify provenance packages and reviewer`.

### S25 — 교육과정 2~3 제작

- **의존성:** S24.
- **목표:** 수치해석과 다중·비강체·공간 진자 18개 단원을 완성한다.
- **구현:** 2.1~2.9와 3.1~3.9의 이론, 유도, 예제, Focus Experiment, checkpoint, 참고 문헌, Lab transfer를 작성한다. S10~S12 및 S21의 실제 adapter를 재사용한다.
- **주요 경로:** `content/learn/course-2/`, `content/learn/course-3/`, experiment definitions/tests.
- **검증:** D + E + U; 18개 schema/과학 fixture/route/transfer 전수 검사.
- **완료 게이트:** 18/18 단원, 계산 코드 중복 0, 적분 오차와 구속 사건 예제가 허용 오차 통과.
- **권장 commit:** `feat(learn): publish numerical methods curriculum`, `feat(learn): publish extended pendulum curriculum`, `test(learn): validate courses two and three`.

### S26 — 교육과정 4~5 제작

- **의존성:** S25.
- **목표:** 비선형 진동·제어와 카오스 측정 23개 단원을 완성한다.
- **구현:** 4.1~4.10과 5.1~5.13을 제작하고 S13~S14, S18~S19의 실제 분석을 제한된 실험으로 구성한다. threshold, sampling, 신뢰도에 따른 오해를 명시한다.
- **주요 경로:** `content/learn/course-4/`, `content/learn/course-5/`, related tests.
- **검증:** D + E + U; 23개 전수, synthetic/known regime 관찰값, 접근성.
- **완료 게이트:** 23/23 단원, 각 카오스 지표의 사용 전제와 실패 예제 포함, Lab transfer 보존.
- **권장 commit:** `feat(learn): publish nonlinear dynamics curriculum`, `feat(learn): publish chaos diagnostics curriculum`, `test(learn): validate courses four and five`.

### S27 — 교육과정 6~8 제작

- **의존성:** S26.
- **목표:** 분기, 네트워크·장·양자, 재현 연구 37개 단원을 완성해 총 86개를 닫는다.
- **구현:** 6.1~6.12, 7.1~7.13, 8.1~8.12를 제작하고 S15~S24 기능을 Focus Experiment로 연결한다. 과정/용어/참고 문헌 index와 추천 경로를 완성한다. 37개 단원은 과정 또는 4~6개 단원 묶음의 내부 checkpoint로 나누고 각 묶음을 검증·commit·push하여 중간 결과를 보존한다.
- **주요 경로:** `content/learn/course-6/`~`course-8/`, curriculum index/tests.
- **검증:** D + E + U; 전체 86개 ID/route/schema/실험/transfer 전수 검사.
- **완료 게이트:** 정확히 8과정·86단원, broken ref 0, 기능 잠금 0, 모든 전용 실험이 공용 엔진 사용. 모든 단원이 최소 `automated-verified`와 `source-checked` 상태이며 검토자를 가장한 표시는 없다.
- **권장 commit:** `feat(learn): publish bifurcation and extended-systems curricula`, `feat(learn): publish reproducible-research curriculum`, `test(learn): validate all eighty-six units`.

### S28 — 저장·공유 migration과 기능 동등성 심사

- **의존성:** S27.
- **목표:** 기존 사용자의 데이터와 모든 기존 기능을 잃지 않고 전환할 증거를 만든다.
- **구현:** legacy 저장/URL/import/share를 canonical state로 읽는 versioned migration, 백업/preview/오류 복구를 완성한다. S01 inventory의 각 항목에 새 UI 경로, 결과 비교, 테스트, export를 연결하는 parity matrix를 자동 검증한다. landing의 기존 simulator URL 계약도 기록한다.
- **주요 경로:** persistence migrations, compatibility routes, `documents/redesign/parity/`, tests/fixtures.
- **검증:** R 중 migration/parity 전체 + 기존/새 E2E 병렬.
- **완료 게이트:** parity 100%, migration fixture 100%, 원본 손상 0, 미지원 데이터에는 복구 가능한 명시적 안내. cutover review checklist, rollback 절차와 미검토 교육 콘텐츠 상태를 보고한다. 하나라도 미달이면 S29 금지.
- **권장 commit:** `feat(migration): preserve legacy experiments and links`, `test(redesign): certify complete feature parity`, `docs(redesign): record cutover evidence`.

### S29 — 새 `app.html` 전환과 audience mode 제거

- **의존성:** S28의 모든 gate 통과.
- **목표:** 새 Learn/Lab 제품을 기본 진입점으로 만들고 오래된 audience 기반 화면을 사용자 경로에서 제거한다.
- **구현:** `next.html` bootstrap을 `app.html`에 승격하고 route/asset/standalone 설정을 갱신한다. Beginner/Student/Research 선택과 old rail은 새 경로에서 제거하되, S28 migration/rollback이 참조하는 legacy 코드는 즉시 영구 삭제하지 않는다. rollback flag/build를 문서화한다.
- **주요 경로:** `app.html`, Vite/standalone/PWA config, compatibility bootstrap, legacy isolation, E2E.
- **검증:** R; cold/warm load, old URL, offline/standalone, rollback rehearsal.
- **완료 게이트:** 기본 URL이 새 앱, 모든 기능 무잠금, legacy URL 복구, rollback 빌드 성공, 기존 앱 회귀 비교 기록.
- **권장 commit:** `feat(app): cut over to learn and laboratory experience`, `refactor(app): isolate legacy audience interface`, `test(app): verify cutover and rollback`.

### S30 — 전면 안정화·릴리스 후보·Landing 전달

- **의존성:** S29.
- **목표:** 완성 결과를 공개 가능한 품질로 검증하고, 이후 Landing Page 재설계에 정확한 입력을 제공한다.
- **구현:** 발견된 결함·접근성·반응형·성능·메모리·bundle·오류 문구를 수정한다. 사용자 여정, 86단원, 모든 시스템/분석, migration, offline/standalone, export를 전수 검증한다. dependency/secret/supply-chain 감사를 다시 실행하고 high/critical 항목을 해결하거나 영향·완화·승인과 함께 명시적으로 보류한다. 운영/복구/지원 문서와 Landing용 제품 메시지·실제 화면 목록·route/CTA 계약만 작성한다. release/merge 자체는 하지 않는다.
- **주요 경로:** 전 제품 관련 경로, `documents/redesign/release/`, test reports; Landing 저장소는 변경하지 않음.
- **검증:** R 전체를 깨끗한 설치와 기준 환경에서 반복; blocker/critical 0.
- **완료 게이트:** 전체 CI green, parity 100%, 86단원 100%, WCAG 자동 위반 0, 성능 예산 충족 또는 승인된 근거, security disposition 완성, 과학 검증 등급 공개, rollback 검증, release candidate 보고서 완성.
- **권장 commit:** `fix(redesign): resolve release-candidate defects`, `docs(redesign): complete release and landing handoff`, `chore(redesign): mark implementation plan complete`.

## 6. 단계 번호와 의존성 요약

| 단계 | 짧은 결과 | 필수 선행 |
|---:|---|---:|
| S01 | 기준선·인벤토리 | - |
| S02 | 기능 카탈로그 | S01 |
| S03 | 상태·공유 계약 | S02 |
| S04 | 병렬 셸 | S03 |
| S05 | 디자인 시스템 | S04 |
| S06 | Lab 골격 | S05 |
| S07 | 이중/복합 수직 절편 | S06 |
| S08 | Learn 플랫폼 | S07 |
| S09 | 과정 1 | S08 |
| S10 | triple/N-chain | S09 |
| S11 | spring/rope | S10 |
| S12 | spherical/embedded | S11 |
| S13 | driven/control | S12 |
| S14 | nonlinear/delay | S13 |
| S15 | network/synchronization | S14 |
| S16 | stochastic/lattice/field | S15 |
| S17 | map/quantum | S16 |
| S18 | 핵심 카오스 분석 | S17 |
| S19 | 고급 카오스 분석 | S18 |
| S20 | 안정성·분기 | S19 |
| S21 | 비교·sweep·ensemble | S20 |
| S22 | inverse/UQ/import | S21 |
| S23 | data-driven/eigensolver | S22 |
| S24 | 연구 산출물 | S23 |
| S25 | 과정 2~3 | S24 |
| S26 | 과정 4~5 | S25 |
| S27 | 과정 6~8 | S26 |
| S28 | migration·parity | S27 |
| S29 | 기본 앱 전환 | S28 |
| S30 | 릴리스 후보 | S29 |

번호를 건너뛰지 않는다. 선행 단계가 완료되지 않았거나 원격 push가 확인되지 않았으면 다음 단계를 시작하지 않는다.

## 7. `status.json` 갱신 규칙

구현 checkpoint가 모두 검증되어 원격에 push되기 전에는 `nextStage`를 바꾸지 않는다. 구현 commit의 원격 존재를 확인한 뒤 별도의 status commit에서 다음처럼 갱신한다.

- `lastCompletedStage`: N
- `nextStage`: N+1, S30 완료 시 `null`
- `completedStages`: 중복 없이 1부터 N까지의 정수
- `blockedStage`: `null`
- `activeStage`: `null`
- `activeStageCheckpoint`: `null`
- `notes`: 지속할 위험이나 다음 단계에 필요한 사실만 간결하게 유지

status commit까지 push하고 원격 HEAD를 확인해야 완료다. 최종 push가 실패하면 로컬 완료 표시는 효력이 없으며 다음 요청은 그 push 복구부터 수행한다. 같은 장애가 이어져도 실제 제품 코드를 되돌리지 않고, 오류와 현재 commit 상태를 보고한 뒤 같은 번호에서 재개한다.

## 8. 사용자·과학 검토 게이트

S07, S09, S17, S24, S28은 완료 보고에 사용자가 확인할 화면, 예상 동작, 알려진 차이를 포함한다. 그 보고를 받은 사용자가 다음 단계 번호를 입력하면 직전 checkpoint 승인으로 기록한다. 다음 번호가 아닌 질문이나 수정 요청은 승인으로 간주하지 않는다.

교육 콘텐츠는 `automated-verified`, `source-checked`, `human-reviewed`를 분리한다. AI가 작성하거나 AI만 재검토한 단원에는 `human-reviewed`를 부여하지 않는다. S29 전환 전에는 86개 단원이 최소 `source-checked`여야 하며, 사람의 검토가 남았다면 화면과 release 보고서에 이를 공개한다.

## 9. 단계 완료 보고 형식

Codex는 각 단계 끝에 다음을 한국어로 보고한다.

```text
SNN 완료/미완료
- 결과: 사용자가 확인할 수 있는 변화
- 변경: 핵심 파일과 계약
- 검증: 실행한 명령, 통과/실패 개수
- Git: checkpoint/status commit hash와 각각의 origin/codex/redesign push 결과
- 보존: 기존 엔진/API/데이터에 미친 영향
- 검토: 사용자 checkpoint, 과학 검증, 보안 상태
- 남은 위험: 없으면 없음
- 다음 입력: “N+1단계 실행해줘.”
```

S30이 완료되어도 자동으로 `master`에 merge하거나 Landing Page를 수정하지 않는다. 두 작업은 사용자의 별도 승인을 받는다.
