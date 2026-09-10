# S08 진행 기록 — 배우기 콘텐츠 파이프라인과 단원 프레임

## 시작점과 범위

- 기준/원격 HEAD: `acd7f869db182376b726e337606335eeabe0d541`, fetch 후 일치, clean worktree.
- 브랜치/upstream: `codex/redesign` / `origin/codex/redesign`.
- S01~S07 완료 상태와 Git history, catalog/contracts/router/design-system, S07 adapter·검증 보고서·사용자 review 문서를 확인했다.
- 사용자 “8단계 실행해줘.”를 프로토콜에 따른 S07 핵심 실험실 구조 승인으로 기록한다. 화면 관찰이나 과학 전문가 검토를 대신하지 않는다.
- 목표: versioned course/unit 콘텐츠 계약·검증·loader, 8과정/86단원 탐색 메타데이터, 하나의 명시적인 sample unit, 접근성 block renderer, navigation, checkpoint와 local progress 복구.
- 범위 밖: S09 과정 1 전체 제작, Focus Experiment runtime과 Lab state 왕복, 이후 시스템·분석, legacy migration, cutover, master merge/release.
- 보존: app.html, physics/chaos/research/runtime/workers/validation, 공개 API, S03 상태·공유·route 계약, 기존 사용자 데이터, catalog와 baseline/golden, package dependency/lockfile.
- 모델 UI 선택값은 읽을 수 없어 확인 또는 변경을 주장하지 않는다.

## Checkpoint

| ID | 작업 | 필수 검증 | 상태 |
|---|---|---|---|
| CP0 | 사전 점검·범위·진행 기록 | redesign:check, redesign:preflight -- 8 | 원격 보존 완료 |
| CP1 | 콘텐츠 계약·loader·검증, 진도 저장 모델 | schema/ID/참조/오류/복원 tests, typecheck, build 콘텐츠 게이트 | 원격 보존 완료 |
| CP2 | 과정/단원 UI와 접근성·진도 여정 | 관련 Vitest, build, Learn desktop/mobile/axe/keyboard/visual | 검증 완료, push 준비 |
| CP3 | 회귀·문서·보존 증거 | 전체 Vitest, redesign browser regression, catalog/inventory/secret 검사 | 대기 |
| STATUS | 별도 완료 commit/push | 구현 원격 확인 후 최종 status 원격 HEAD 확인 | 대기 |

## 변경 예정 경로

- content/learn/, src/product/learn/, src/product/app/views/learn.ts, next.html, css/product/learn.css.
- scripts/redesign/validate-learn*, package.json의 additive validation script, tests/product/learn/, e2e/redesign/learn* 및 관련 셸 기대값.
- documents/redesign/learn-platform-ko.md, stage-runs/S08-*, status.json.

## 검증·판단·위험

- 필수 여섯 문서를 모두 읽었으며 저장소 문서를 원본으로 사용한다.
- fetch 쓰기와 preflight의 Git spawn EPERM은 동일 명령의 권한 실행으로 해결했다. 두 필수 검사 통과.
- 바탕화면 두 계획 사본 SHA-256은 저장소 원본과 같다. 계획 내용 변경이 없으면 재복사하지 않는다.
- 준비 중 단원은 제작 상태로 표시하며 진행도에 따라 잠그지 않는다. sample을 완성 과정이나 Focus runtime으로 표시하지 않는다.
- local progress는 새 versioned namespace만 사용하고, 잘못된 저장값·알 수 없는 버전은 자동 덮어쓰기하지 않는다.
- 기존 S01 npm high 2/moderate 2, CodeQL 32, 별도 default-branch Dependabot high 4는 미해결 기준선이다. 이번 단계는 위험 수용이 아니다.
- 자동 검증과 출처 대조, 사람/전문가 검토를 구분한다.
- CP1: 콘텐츠 83/83, 진도 82/82 테스트 통과. 별도 임시 입력으로 실제 npm build를 실행해 잘못된 수식 변수가 prebuild에서 실패하고 Vite가 실행되지 않음을 확인했다.
- CP1: 기존 app/contracts/catalog와 진도 모델 회귀 447개 테스트 통과. typecheck, production build, catalog 134개, legacy inventory 883개/broken import 0/orphan 0 통과.
- CP1: Vite/Vitest ESM namespace의 live binding을 loader가 정상적으로 읽도록 수정했다. 콘텐츠 객체 자체의 getter와 unsafe payload는 계속 거부한다.
- CP2 진행 검증: JS의 CSS 주입이 dev CSP에서 차단되어 next.html 외부 stylesheet로 변경했다. 대비와 320px/200% zoom/axe 재검사 desktop/mobile 통과. 원래 CSP는 보존한다.
- CP2 진행 검토: 다른 질문 제출로 미확인 선택이 지워지는 문제와 sessionStorage 이벤트 혼동을 수정했다. 저장되지 않은 진도 표시를 즉시 갱신한다.
- 시작 push의 GitHub 알림은 default-branch Dependabot high 5였으며 종전 high 4와 구분한다. npm/CodeQL 재감사나 취약점 해결은 수행하지 않았다.
- CP2: source/progress 계약 검토에서 65개 이상 질문과 예약 ID가 콘텐츠 검증은 통과하지만 진도 모델에서는 실패하는 불일치를 발견했다. 공용 64개 한도와 예약 ID 거부를 적용했다. 상속 프로퍼티 이름의 미등록 필드도 Object.hasOwn으로 거부한다. 보완 후 콘텐츠 88개·진도 82개, 총 170/170 통과; typecheck·ESLint·build 통과.
- CP2: Learn desktop/mobile 34/34, failed/skipped/flaky/retries 0. 8과정·86단원 이동, 샘플·진도·교차 탭·오류/취소·320px/zoom2/keyboard/axe를 검증했다. 새 light/dark 캡처 12개를 시각 검토했다. 현재 적용된 작은 SVG 글자 halo 차이는 기존 비교 허용치 안이며 과거 단계 PNG는 변경하지 않았다.
- CP3: 계약 보완 후 전체 Vitest 258개 파일 2403개 통과, failed/pending 0. S07 2233개 사례 누락 0, 새 검사 170개. 계약 보완 전 최초 2398개 통과 기록도 보존한다.
- CP3 진행: 개발 서버 browser 회귀 중 source 변경이 겹쳤다. trace에서 dark 선택 뒤 같은 페이지에 Vite 재연결이 반복되고 light/workspace로 초기화된 것을 확인했다. 해당 화면 차이 및 시간 제한 실패를 보존하고 소스 동결 뒤 재검증한다. 테스트 기대값이나 과거 시각 baseline은 완화하지 않는다.
- CP3 진단: 기존 dev 최초 112개 중 108개 통과·4개 실패, 소스 동결 후 관련 5개 재검사에서 4개 통과·double 반복 접근성 1개 시간 초과. 해당 trace의 call@35/119/187은 BrowserContext.newPage이며 각각 5073/5087/5031ms였다. 설치된 @axe-core/playwright의 finishRun은 매 axe 검사마다 결과용 빈 탭을 생성한다. 10회 검사 항목에만 전체 제한을 30초에서 60초로 조정했다. 모든 10회 axe 검사·5초 assertion 제한·이전 화면 PNG는 유지하며 desktop/mobile 두 시스템을 재검증한다.
- CP3: production preview Learn·기존 셸 desktop/mobile 68/68 통과, failed/skipped/flaky/retries 0. 배포 빌드의 진도·오류·취소·키보드·접근성·12개 시각 비교와 기존 진입점 보존을 확인했다.
- CP3: 60초 묶음 재검사는 3/4 통과. compound desktop에서는 최초 페이지 생성이 23초 걸리고 Vite 연결 상실 뒤 /@vite/client:1062의 재접속용 SharedWorker가 CSP에 차단되었다. CSP·assertion·video·trace 설정을 유지한 채 새 포트 독립 서버에서 해당 1개가 34초에 통과했다. 기존 112개 고유 회귀 사례는 모두 마지막 검사 결과가 통과이며, 한 번의 112개 무실패 실행으로 표시하지 않는다. 최초/복구/추가 재검사 원본과 실패 trace를 보존한다. 페이지 초기화 지연의 근본 원인은 확정하지 않는다.

## Commit 및 원격 증거

- 시작 원격: `acd7f869db182376b726e337606335eeabe0d541`.
- CP0: `534005755504c3d7784279ce30de1ce08e552d4a`, push 및 git ls-remote 일치 확인.
- CP1: `ba5b79f7661ebaa1fc21ad4894b35195cb07ed7d`, push 및 git ls-remote 일치 확인.
- 구현 및 status push 증거는 각 checkpoint 완료 후 기록한다.
