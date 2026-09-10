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
| CP1 | 콘텐츠 계약·loader·검증, 진도 저장 모델 | schema/ID/참조/오류/복원 tests, typecheck, build 콘텐츠 게이트 | 검증 통과, 원격 보존 대기 |
| CP2 | 과정/단원 UI와 접근성·진도 여정 | 관련 Vitest, build, Learn desktop/mobile/axe/keyboard/visual | 대기 |
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

## Commit 및 원격 증거

- 시작 원격: `acd7f869db182376b726e337606335eeabe0d541`.
- CP0: `534005755504c3d7784279ce30de1ce08e552d4a`, push 및 git ls-remote 일치 확인.
- 구현 및 status push 증거는 각 checkpoint 완료 후 기록한다.
