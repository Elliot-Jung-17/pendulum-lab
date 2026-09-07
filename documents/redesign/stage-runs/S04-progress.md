# S04 진행 기록 — 병렬 진입점·bootstrap·router·공통 셸

## 시작점과 범위

- 기준/원격 HEAD: `543bfc8add9e51949bc4b58bcf45db74666dfb40`, fetch 후 일치, 작업 폴더 clean.
- 브랜치/upstream: `codex/redesign` / `origin/codex/redesign`.
- 의존성: S01~S03 status/이력/산출물 확인. S03 status `543bfc8`, 구현 `d0b1693`, 검증 `af19bf8`; 245개 파일·1,974개 테스트 증거와 route/share 계약 존재.
- 목표: 독립 `next.html`, 지연 bootstrap/공간별 모듈, hash 이동, 공통 헤더, Learn/Lab 진입, 접근 가능한 loading/invalid/initialization/chunk/render 오류와 복구.
- 범위 밖: S05 디자인 시스템, S06 Lab 조립/검색, S07 엔진 연결, S08 교육 콘텐츠 플랫폼, S28 migration, S29 전환.
- 보존: 기존 app.html 및 physics/chaos/research/runtime/workers/validation, 공개 API, storage/share/import/export, 사용자 데이터, lockfile, S01 fixture, S02/S03 계약.
- 모델 UI 선택값은 확인할 수 없으므로 확인·변경했다고 주장하지 않는다.

## Checkpoint

| ID | 작업 | 검증 | 상태 |
|---|---|---|---|
| CP0 | 실행 기록과 activeStage | redesign:check, redesign:preflight -- 4 | 원격 보존 완료 |
| CP1 | 병렬 진입점·공통 셸·라우터·오류 복구·테스트 | 관련 Vitest, typecheck, build, route/keyboard/axe smoke | 원격 보존 완료 |
| CP2 | 전체 회귀·운영 설명·보존 증거 | C + 핵심 Playwright, 전체 Vitest, inventory/catalog | candidate-complete, 검증·원격 보존 완료 |
| STATUS | 구현 원격 확인 후 완료 상태 | 별도 status commit/push와 원격 HEAD | 별도 status commit; 원격 존재 시 S04 완료 |

## 변경 예정 경로

- `next.html`, `vite.config.ts`의 추가 build entry와 Vite preload helper 분리.
- `src/product/app/`, `tests/product/app/`, `e2e/redesign/shell*`.
- `documents/redesign/shell-ko.md`, 본 기록, `S04-verification.json`, `status.json`.
- `scripts/redesign/inventory.ts`: 위 두 가지 정확한 build 추가만 legacy 비교에서 제외하는 투영. 기존 S01 baseline 파일은 변경하지 않는다.

## 검증·판단과 위험

- `redesign:check` 통과. fetch와 preflight의 sandbox Git 쓰기/하위 프로세스 제한은 같은 명령의 확장 실행으로 해소; `redesign:preflight -- 4` 통과.
- 빈 hash만 명시적으로 Learn으로 대체하고, 알 수 없는 주소는 원본 URL을 유지한 오류로 처리한다. 공유는 S03의 envelope/시스템 일치 검사까지 거친다.
- S04는 두 공간의 동작하는 진입·이동 경로를 제공한다. 아직 없는 단원/시뮬레이터에는 정직한 미제공 상태와 기존 앱으로 가는 실제 링크를 제공한다.
- 기존 보안 기준선 npm audit high 2/moderate 2 패키지, CodeQL 32건, GitHub default-branch Dependabot high 4건은 미해결이다. 이번 단계에서 재감사·업그레이드·위험 수용하지 않는다.
- 바탕화면 roadmap/실행 계획 사본은 원본과 SHA-256이 각각 일치한다. 원본 두 문서를 수정하지 않으면 복사는 필요하지 않다.
- CP1 구현: bootstrap/application/Learn/Lab의 코드 분할, hash navigation, 주소/공유 검증, loading/cancel/invalid/chunk/render 오류, 같은 URL 새로고침과 기존 앱 복구, 제목/nav/focus/skip link와 기본 320px 배치를 제공했다.
- 교차 검토에서 정적 초기 복구 링크가 상세 hash를 잃게 하는 문제를 찾아 브라우저 새로고침 안내로 수정하고 entry script 차단 E2E를 추가했다.
- 개발 CSP가 Vite CSS runtime 주입을 차단함을 발견하여 HTML 외부 stylesheet link로 수정했다. 스타일 적용 computed CSS와 정상 진입 console/pageerror=0을 확인한다.
- 최초 취소 E2E 1건은 테스트 중 Prettier 변경에 의한 Vite HMR reload가 trace에 확인되었다. 고정 source에서 isolated 3/3 및 전체 dev 재검사 통과했다.
- 최초 production 검사 2건은 새 셸이 기존 엔진 bundle을 요청하는 실제 결함이었다. Vite preload helper가 legacy 연구 탭에 묶인 것이 원인으로, 정확한 가상 helper 모듈만 별도 chunk로 분리했다. 실패를 무시하거나 network 검사를 완화하지 않았다.
- 인벤토리 검사의 최초 stale은 승인된 build 추가를 그대로 비교한 결과다. 기존 S01 snapshot은 유지하고 정확한 추가만 투영하며, 다른 build 변경을 탐지하는 mutation fixture로 보강했다.
- CP1 최종 검증: 관련 Vitest 19개 파일·383개 통과(기존 S01~S03 327개 + 신규 S04 56개), typecheck/대상 ESLint/Prettier/소스 정책/module audit/build 통과.
- 최종 Playwright: dev 34/34, production 34/34, 실패/보류/재시도 0. 각 실행은 Chromium desktop/mobile 17개 시나리오를 포함하고 axe contrast/keyboard/320px, 실제 style, 오류·취소·storage 보존·기존 앱 병행을 검사했다.
- styled desktop Learn과 mobile Lab 캡처를 직접 확인했다. 잘림/겹침은 발견하지 않았다. S05의 정식 시각 baseline/전체 접근성 감사는 수행하지 않았다.
- `redesign:inventory:check`: 883개 파일 legacy 투영, orphan/broken import 0. 실제 기존 파일 변경은 `vite.config.ts`의 두 추가뿐이며 엔진/app/기존 test/fixture source는 그대로다. catalog 134개 유지, audit:modules 491개 source·예외 0.
- CP2 전체 Vitest: 248개 파일·2,030개 테스트 통과, 실패/보류/todo 0. S03 원시 보고서와 test 이름을 대조해 기존 245개 파일·1,974개 테스트 보존과 신규 3개 파일·56개를 확인했다.
- [shell-ko.md](../shell-ko.md)의 상대 링크 15개와 code fence 균형을 확인했다. [S04-verification.json](S04-verification.json)에 테스트 집계, 원시 보고서 SHA-256, build 자산 hash와 보존/제한을 기록했다.
- 보존 경로 Git diff는 0: app.html, physics/chaos/research/runtime/worker/validation, lib 공개 API, package/lockfile, S01 baseline와 characterization tests. build 설정은 기록한 두 줄 추가만 있다.
- CP1 secret scan: 1,192 tracked / 1,162 text / 30 binary, 알려진 패턴 0. 정상 UI 흐름은 console/pageerror=0이다. 보안 기준선 경고는 해결/수용하지 않았다.
- 최종 바탕화면/원본 해시 일치: roadmap `1d46e04691d4119ced60dacb41945c75d9d1a20f66cbaed2b3664909f47f8995`, 실행 계획 `803b191496edd95ebf2199a8983b920058109bb159d55f8bafeb0737fa735fc5`. 원본 두 계획 문서를 수정하지 않아 사본을 다시 쓰지 않았다.

## Commit / 원격 증거

- 명시적 경로만 stage하고 검증된 checkpoint를 push한다. 구현의 원격 존재 확인 전 `nextStage=4`를 유지한다.
- 각 commit과 push 증거는 후속 checkpoint에 기록하고 최종 status hash는 사용자 보고에 남긴다.
- CP0: `3c626180bf0cee9cf6b61b91b1db7fa15931f7c6`, push 성공 및 ls-remote 일치.
- CP1: `7642e5258008e7f7bfbcd48dfdef56354f37b145`, 구현 push 성공 및 ls-remote 일치. 원격 nextStage=4 유지 후 전체 검증을 시작한다.
- CP1 명시적 staging 뒤 secret scan의 알려진 패턴 탐지 0. Git history/ignored/binary 내용/임의 비밀값은 검사 범위 밖이다.
- CP2: `58ecb05a94598387c88afb4bc5a6a6aa52818692`, 문서/검증 증거 push 성공 및 ls-remote 일치. 최종 status commit 전에 모든 구현과 검증 증거의 원격 존재를 확인했다.
- STATUS: CP2 원격 확인 후 본 기록과 status.json만 별도 commit한다. 최종 status hash와 원격 확인은 사용자 보고에 남긴다. 원격 존재 전에는 로컬 완료 표시가 효력을 갖지 않는다.

## 후속

- S04는 사용자 review gate가 아니다. 사람/전문가 검토를 수행했다고 표시하지 않는다.
- 롤백 기준: `543bfc8` 및 계속 제공되는 기존 `app.html`.
- STATUS 원격 확인 후 다음 유효 단계는 S05이다.
- 다음 유효 입력은 “5단계 실행해줘.”이다. S04의 신규 확인 미해결 결함은 없으며, 기존 보안 기준선과 이후 UI/실행/교육·PWA 검증 범위는 남아 있다.
