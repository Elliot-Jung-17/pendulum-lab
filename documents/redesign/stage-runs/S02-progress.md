# S02 진행 기록 — 통합 시스템·분석·적분기 카탈로그

## 시작점과 범위

- 기준/원격 HEAD: `c82382dac38355b6f1a540f621e3324f0581d927`; fetch 후 일치, 작업 트리 clean.
- 브랜치/upstream: `codex/redesign` / `origin/codex/redesign`.
- S01 의존성: 원격 status commit `c82382d`, 구현 `1d6191a`, 검증 `d40565a`와 baseline inventory/golden/verification/security 산출물 확인.
- 목표: 안정 ID, typed system/analysis/integrator 계약, 선언형 호환성, 기존 구현 binding과 빌드 검증, S01 양방향 coverage.
- 범위 밖: S03 canonical 상태/공유 구현, 새 UI, 엔진 호출 변경, 실제 제품 adapter 구현, dependency upgrade.
- 보존: 기존 physics/chaos/research/runtime/workers/validation, 공개 API, app.html, 기존 저장/공유/import/export, fixture와 lockfile.
- 모델 UI 선택값은 도구로 확인할 수 없어 확인 또는 변경했다고 주장하지 않는다.

## Checkpoint

| ID | 작업 | 검증 | 상태 |
|---|---|---|---|
| CP0 | 실행 기록, activeStage 설정 | redesign:check, redesign:preflight -- 2 | 원격 보존 완료 |
| CP1 | 타입 계약, 전체 기능 정의, predicate, build guard 및 tests | 카탈로그 정상/경계/실패 test, typecheck, baseline coverage, build | 검증 통과, commit 준비 |
| CP2 | 전체 검증, 문서와 보존 증거 | D, 전체 기존 test 회귀 검사 | 대기 |
| STATUS | 구현 원격 확인 후 완료 상태 | status 일관성, 별도 push/원격 HEAD 확인 | 대기 |

## 변경 예정 경로

- `src/product/contracts/catalog.ts`, `src/product/catalog/`
- `tests/product/catalog/`, `scripts/redesign/`의 카탈로그 검증 및 기존 baseline 범위 구분
- `package.json`의 build 검증 연결, 본 기록, catalog 설명 문서, status

## 검증·판단

- `redesign:check` 및 `redesign:preflight -- 2` 통과. sandbox의 Git 쓰기/하위 프로세스 제한은 승인된 확장 실행으로 해결.
- 바탕화면 전달용 두 문서는 저장소 원본과 SHA-256 일치. 계획 본문 변경 예정 없음.
- S01 118개 의미 기능과 16개 기존 integrator 등록을 대조한다. 모듈/공개 API 관찰은 기존 인벤토리 보존 검사로 유지한다.
- 카탈로그는 기존 export를 가리키는 선언이며 실행 adapter 또는 신규 과학 검증 완료를 뜻하지 않는다. 특수 모델의 기존 제한을 보존한다.
- 기존 보안 위험(High 2/Moderate 2 패키지, CodeQL 32건)은 S01 기록대로 미해결이며 이번 단계에서 위험 수용으로 표시하지 않는다.
- 시스템 34개와 적분기 21개 선언의 모든 source binding 정적 검사 통과. 실제 호출 함수와 legacy schema 참조를 구분했다.
- 정적 연결/기준선 범위 테스트 28개 통과. 교차 검토에서 분석/적분기 첫 binding의 callable 강제와 JSON enum 배열 강제변환 거부를 보강했다.
- 새 product 계층 및 정확한 npm build 검사 hook만 기존 baseline 비교에서 제외했다. `redesign:inventory:check`는 S01 원본 JSON/Markdown과 그대로 일치(883개 파일, 118개 의미 기능, orphan/broken import 0).
- CP1 최종: 카탈로그 134개(system 34/analysis 51/integrator 21/auxiliary 28), S01 의미 기능 118개 + 실제 적분기 16개 양방향 coverage 통과. 누락·중복·깨진 export·잘못된 모델 참조 0.
- 실제 API 범위 guard는 double/driven/SystemSpec/expansion/2×2 Floquet의 8개 primary API와 일반 연속 벡터장 입력을 검사한다. 매개변수 추정의 필수 관측/초기 상태/고정 물성도 보강했다.
- CP1 `npx vitest run tests/product/catalog tests/characterization`: 8개 파일·88개 통과(카탈로그 65개 + 기존 S01 23개), 실패/보류 0.
- CP1 `npm run typecheck`, 대상 ESLint, Prettier, module-size(464개 source, 예외 0), `git diff --check` 통과.
- CP1 `npm run build`: prebuild 카탈로그 검사부터 production build, public artifact audit까지 통과. 기존 앱 404개 module build; legacy 실행 진입점에 새 catalog를 import하지 않는다.
- `src/physics`, `src/chaos`, `src/research`, `src/runtime`, `src/workers`, `src/validation`, 공개 library, app.html/CSS/public/lockfile, S01 baseline와 characterization fixture의 Git diff 없음.

## Commit / 원격 증거

- 각 checkpoint는 검증 후 명시적 파일만 stage/commit하고 `origin/codex/redesign`에 push한다.
- CP0: `2abd467a521b6ee2dd3837cf49fac8cbca4809a9`; push 성공, ls-remote에서 같은 hash 확인.
- 구현 push 완료 전 nextStage=2를 유지한다. 최종 status commit의 원격 존재 확인 전에는 S02 완료가 아니다.

## 남은 작업

- CP1, CP2 및 STATUS. 사용자 review gate 해당 없음. 기존 앱을 복구 경로로 유지한다.
