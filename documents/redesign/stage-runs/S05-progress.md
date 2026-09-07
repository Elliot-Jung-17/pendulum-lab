# S05 진행 기록 — 디자인 시스템·접근성·반응형 기반

## 시작점과 범위

- 기준/원격 HEAD: `8edb88840260c8ae753ab5e3cffd1e2f4dcb634f`, fetch 후 일치, clean worktree.
- 브랜치/upstream: `codex/redesign` / `origin/codex/redesign`.
- 의존성: S01~S04 완료 status와 Git history 확인. S04 구현 `7642e52`, 검증 `58ecb05`, status `8edb888`; next.html 및 shell/router 테스트와 S04-verification.json 존재.
- 목표: light/dark token, button/input/quantity/section/tabs/dialog/toast/progress/split-panel/card, 실제 작동하는 component gallery, keyboard·focus·screen-reader·motion·contrast·320px·200% 기반.
- 범위 밖: S06 Lab 조립, S07 engine adapter, S08 콘텐츠 플랫폼, migration/cutover.
- 보존: app.html, physics/chaos/research/runtime/workers/validation, 공개 API, 기존 storage/share/import/export, 사용자 데이터, package/lockfile, S01 fixture, S02/S03 계약.
- 모델 UI 선택값을 읽을 수 없으므로 선택 확인·변경을 주장하지 않는다.

## Checkpoint

| ID | 작업 | 검증 | 상태 |
|---|---|---|---|
| CP0 | 실행 기록과 activeStage | redesign:check, redesign:preflight -- 5 | 원격 보존 완료 |
| CP1 | token·컴포넌트·gallery·shell 적용 | 관련 Vitest, typecheck, build, axe/keyboard/반응형 | 원격 보존 완료 |
| CP2 | 전체 회귀·시각 baseline·운영 문서·보존 증거 | 전체 Vitest, dev/production E2E, inventory/catalog | candidate-complete, 검증 통과 |
| STATUS | 별도 완료 상태 | 구현 원격 확인, status push 및 원격 HEAD | 예정 |

## 변경 예정 경로

- src/product/design-system/, css/product/, tests/product/design-system/, e2e/redesign/a11y*.
- next.html의 stylesheet, src/product/app/entry.ts의 독립 gallery lazy 진입, shell.ts의 gallery 링크, shell.css의 token 적용.
- documents/redesign/design-system-ko.md, 본 기록, S05-verification.json, status.json.
- scripts/redesign/inventory.ts: additive css/product만 기존 legacy inventory 수집에서 제외. 기존 CSS 변화를 계속 탐지하는 회귀 테스트 포함.

## 검증·판단과 위험

- 필수 redesign:check 및 redesign:preflight -- 5 통과. sandbox의 Git 쓰기/하위 프로세스 제한은 동일 명령의 승인된 확장 실행으로 해결했다.
- gallery는 next.html?gallery=components에서 열며 기존 canonical hash route 계약은 변경하지 않는다. 실제 실험/저장을 가장하지 않는 컴포넌트 예제다.
- 스타일은 외부 stylesheet로 제공해 기존 CSP를 유지한다. 테마 설정은 이번 화면에만 적용하며 사용자 저장소는 변경하지 않는다.
- 기존 npm audit high 2/moderate 2, CodeQL 32, GitHub default-branch Dependabot high 4 기준선은 미해결이며 S05에서 재감사·위험 수용하지 않는다.
- 바탕화면 사본 두 개는 원본과 SHA-256이 일치한다. 원본 roadmap/실행 계획을 바꾸지 않으면 복사는 필요하지 않다.
- CP1: 10종 UI primitive와 실제 gallery, 화면 내 light/dark/system 선택, 기존 shell의 semantic token 적용을 완료했다.
- 관련 Vitest 457/457 통과(수량 38, token 32, CSS inventory 범위 1 포함). typecheck/대상 ESLint/Prettier/build 통과. catalog 134 유지, legacy inventory 883/broken import 0/orphan 0.
- 첫 inventory/관련 테스트의 실패는 새 CSS 2개가 기존 baseline에 포함되었기 때문이다. product 경계만 제외하고 baseline 원본은 유지했으며 legacy CSS 변형 탐지 fixture로 보강했다.
- 첫 browser 검사에서 progress native label이 accessible name으로 노출되지 않아 label ID와 aria-labelledby를 연결했다. 낮은 magnitude 입력이 0으로 underflow되는 경우를 거부하는 fixture를 추가했다.
- 독립 browser 검토에서 radio 그룹 tab stop, showModal의 동기 focus에서 자식 modal 생성, 좁은 화면 전환 때 숨겨지는 separator focus 문제를 발견해 수정했다. lifecycle browser 회귀 12개가 이를 재현·검증한다.
- 모바일 full-page screenshot의 유일한 불안정 영역은 화면 밖 fixed skip link였다. 비활성 링크를 clip-path로 감춰 캡처와 viewport 변경에서도 나타나지 않게 수정했으며 키보드 focus 시 표시/작동 검사를 유지했다.
- 시각 baseline 12개 생성 후 갱신 없이 개발 Playwright 70/70 통과, 실패·skip·retry 0. S04 shell 34 + S05 gallery 24 + lifecycle 12; Chromium desktop/mobile 각각 실행.
- 실제 axe에서 light/dark, 입력 오류, 대화상자, 알림, shell, 320px, zoom/reflow, forced colors에 지정 WCAG 위반 0. 200%는 CSS zoom 2와 독립 640px reflow이며 native 브라우저 메뉴 확대 또는 screen reader 음성 청취를 주장하지 않는다.
- light desktop/dark mobile, desktop/mobile dialog, 320px/forced-colors 이미지를 직접 확인했다. 잘림/겹침은 발견하지 않았다. 이 결과는 Windows Chromium raster 기준이다.
- CP2 최종 전체 Vitest: 251개 파일·2,101개 테스트 통과, 실패/pending 0. S04 원시 보고서의 SHA-256을 대조하고 기존 248개 파일·2,030개 테스트 이름이 모두 유지됨을 확인했다. 신규는 3개 파일·71개 테스트다.
- CP2 production Playwright: 58/58 통과, 실패/skip/retry 0. 같은 Windows 시각 baseline을 갱신하지 않고 S04 shell 34 + S05 gallery 24를 실제 빌드된 chunk에서 검증했다. source 모듈을 직접 호출하는 lifecycle 12개는 dev 전용이며 production에서는 갤러리 여정으로 검증한다.
- build/typecheck/대상 ESLint/Prettier/소스 정책/모듈 크기 검사 모두 통과. 마지막 inventory 883/orphan 0/broken import 0, catalog 134. 정상 gallery 이동의 pageerror/console error 0; 기존 앱 병행과 local/session storage 보존 통과.
- [design-system-ko.md](../design-system-ko.md)의 링크 13개와 code fence를 확인했다. [S05-verification.json](S05-verification.json)에 전체/관련 테스트, E2E 보고서 hash, 12개 screenshot hash, build 자산, 보존 경로 diff와 한계를 기록했다.
- 보존 경로 Git diff 0: app.html, engines/runtime/workers/validation, lib 공개 API, S03 contracts/persistence, package/lockfile, S01 baseline 및 characterization tests. 기존 CSS는 그대로이며 S04 product shell CSS만 token으로 바꾸었다.
- CP1 stage 후 secret scan: 1,221 tracked / 1,179 text / 42 binary, 알려진 패턴 0. Git history/ignored/binary 내용/임의 비밀값은 검사 범위 밖이다.
- 마지막 바탕화면 사본 hash 일치: roadmap `1d46e04691d4119ced60dacb41945c75d9d1a20f66cbaed2b3664909f47f8995`, 실행 계획 `803b191496edd95ebf2199a8983b920058109bb159d55f8bafeb0737fa735fc5`. 두 원본 계획을 수정하지 않아 다시 쓰지 않았다.

## Commit / 원격 증거

- 명시적 경로만 stage한다. 모든 구현 원격 확인 전 nextStage=5를 유지한다.
- commit과 원격 증거는 후속 checkpoint에 기록한다. 최종 status hash는 사용자 보고에 남긴다.
- CP0: `97df9e6fd84350f9bb4ae56c6add7479e6ba3b44`, push 성공 및 ls-remote 일치.
- CP1: `05d1eb100451a2c2302775947a8bcf8e6c132b9a`, 구현 push 성공 및 ls-remote 일치. 원격 nextStage=5를 유지한 뒤 전체 회귀를 실행했다.
- CP2: 본 기록과 운영 문서/검증 증거를 별도 commit/push한다. 이후에만 완료 status를 갱신한다.

## 후속

- S05는 사용자 review gate가 아니다. 사람/전문가 검토 완료를 주장하지 않는다.
- 롤백 기준은 `8edb888` 및 기존 app.html이다. S05 완료 시 다음 유효 단계는 S06이다.
