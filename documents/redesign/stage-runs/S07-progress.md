# S07 진행 기록 — 이중·복합진자 수직 절편

## 시작점과 범위

- 기준/원격 HEAD: `1cd55d14dfe8f837b7eef747307242c383116287`, fetch 후 일치, clean worktree.
- 브랜치/upstream: `codex/redesign` / `origin/codex/redesign`.
- S01~S06 status와 Git history, baseline golden, catalog, canonical contracts, next.html, design-system, Lab 및 S06 검증 산출물을 확인했다.
- 목표: double/compound 실제 엔진, 애니메이션, 상태/시간·에너지·위상·Poincaré·최대 Lyapunov, 저장/복원, CSV/figure/state export.
- 범위 밖: S08 이후 콘텐츠·시스템·고급 분석 확장, legacy migration, cutover, master merge와 release.
- 보존: app.html, physics/chaos/research/runtime/workers/validation, lib 공개 API, 기존 저장·공유·import/export와 사용자 데이터, package/lockfile, S01 수치 fixture, S03 계약.
- 모델 UI 선택값을 읽을 수 없으므로 실제 선택 확인이나 변경을 주장하지 않는다.

## Checkpoint

| ID | 작업 | 필수 검증 | 상태 |
|---|---|---|---|
| CP0 | 사전 점검·실행 기록 | redesign:check, redesign:preflight -- 7 | 원격 보존 완료 |
| CP1 | 실제 physics/analysis adapter와 worker | S01 golden·직접 엔진 동등성·단위/실패/취소, typecheck | 원격 보존 완료 |
| CP2 | Lab 화면·저장·내보내기 수직 절편 | 관련 Vitest, typecheck, build, desktop/mobile/axe/keyboard/visual | 원격 보존 완료 |
| CP2B | 시스템별 지연 로딩 경계 수정 | router 36 tests, 원래 shell 보존 검사, 실제 core 라우트, typecheck/build | 원격 보존 완료 |
| CP3 | 전체 회귀·보존 증거·review 문서 | 전체 Vitest, dev/production 여정, catalog/inventory | candidate-complete, 최종 검증 통과 |
| STATUS | 완료 상태 별도 commit/push | 구현 원격 확인 후 status 원격 HEAD 확인 | 예정 |

## 변경 경로

- src/product/adapters/physics/, src/product/adapters/analysis/, src/product/lab/views/, src/product/app/application.ts, router.ts, views/core-lab.ts, views/lab.ts.
- tests/product/adapters/, tests/product/lab/, tests/product/app/router.test.ts, e2e/redesign/, css/product/lab.css.
- documents/redesign/core-lab-ko.md, stage-runs/S07-*, status.json.

## 검증·판단과 위험

- 원격 fetch와 두 필수 preflight 검사 통과. sandbox의 Git 쓰기/하위 프로세스 EPERM은 같은 승인된 명령으로 해결했다.
- S06의 두 시스템 mock 경로를 실제 경로로 교체하며, 나머지 시스템은 기존 mock 범위를 유지한다.
- 긴 분석은 worker에서 실행하고 종료/오류/늦은 메시지를 검증한다. 실제 제공하는 적분기만 노출한다.
- 저장은 새 versioned namespace와 canonical restart configuration을 사용한다. 기존 저장소를 변환하거나 solver continuation을 주장하지 않는다.
- 바탕화면 roadmap/실행 계획 사본은 SHA-256이 원본과 같다. 두 계획을 변경하지 않으면 재복사하지 않는다.
- 기존 S01 보안 기준선 npm high 2/moderate 2, CodeQL 32, default-branch Dependabot high 4는 미해결이며 이번 단계의 승인을 뜻하지 않는다.
- S07은 사용자 review gate다. 실제 화면과 확인 목록을 완료 보고에 제공하며 사람/전문가 검토 완료를 기록하지 않는다.
- CP2: 두 실제 모델의 animation/조건/실행/분석/보관/저장/공유/JSON·CSV·SVG 경로를 연결했다. 새 localStorage namespace만 사용하고 기존 앱 자료는 건드리지 않는다.
- CP2: model lifecycle/sampling/storage의 새 32개 테스트와 어댑터 72개 테스트를 추가했다. 전체 Vitest 256개 파일 2,228개 통과, 기존 S06 252개 파일 2,124개 테스트의 이름을 대조해 누락 0개 확인.
- CP2: desktop/mobile 동작 여정 각 18/18 통과. 실제 worker 결과·계산량 progress·취소·시작 실패 재시도, 파일 round trip·오류 보존, 320px·keyboard·200% 확대와 WCAG axe 위반 0을 확인했다.
- CP2: 큰 시간 간격에서 프레임 최소 1 step이 재생 속도를 앞당기는 문제를 자체 검토로 찾아 누적 목표 시간으로 수정했다. step 0.05 s, 1×/0.25×, pause·reset·마지막 짧은 step 테스트를 추가해 통과했다.
- CP2: 시각 검사는 S07 실제 화면과 S06의 남은 spherical 모의 화면을 분리했다. 기존 double 모의 화면 PNG와 S05 gallery PNG는 과거 증거로 보존한다. 라이브러리 설명만 실제 지원 상태에 맞게 갱신했다.
- CP2: 초기 Lab chunk와 별도 worker로 build 성공. 기존 catalog 134개, legacy inventory 883개/broken import 0/orphan 0, typecheck·ESLint·Prettier·source policy·module-size 검사 통과.
- CP2: 독립 코드 검토로 다운로드 URL 해제, 비동기 import 세대 구분, 분석 상태에 따른 버튼 차단, 지원하지 않는 저장 분석의 명시적 복구, 현재 시각의 반복 음성 알림 억제를 점검했다. 이는 사람/전문가 검토가 아니다.
- CP2 시각 결과: 기본 화면 캡처 6/6, 실제 Lyapunov 분석 화면 비교 4/4 통과. 새 분석 이미지 최초 생성에서는 없는 기준 이미지 4건이 실패로 기록되었고, 생성 이미지를 확인한 뒤 기준 갱신 없이 같은 4개 비교를 재실행해 통과했다. 제품 오류나 수치 golden 변경은 없었다.
- CP3 최초 전체 browser 회귀에서 dev 110/112, production 98/100이었다. 두 프로젝트의 S04 동일 검사에서 시스템 목록 진입 시 계산 코드가 로드되는 문제가 발견되어 완료 표시를 보류했다. 실패 보고서는 tmp/S07-initial-dev-playwright.json 및 tmp/S07-initial-production-playwright.json에 보존했다.
- CP2B: router가 검증된 route를 loader에 전달하고, double/compound는 별도 core-lab lazy chunk로 선택하도록 수정했다. 원래 S04 shell E2E는 완화하거나 변경하지 않았다. 기존 지연 로딩·저장 보존 검사 dev 2/2 및 production 2/2 통과, production core 실행·내보내기 4/4와 router 36개 테스트·typecheck·build 통과. 빠른 같은 공간 이동의 늦은 chunk 결과/실패 무시 및 오류 복구를 검증했다.
- CP3 최종: CP2B 구현본에서 전체 Vitest 256개 파일 2,233/2,233 통과, 실패·보류 0. S06의 2,124개 기존 테스트를 대조해 누락 0, 신규 109개다. 기존 router의 5개 매개변수 사례는 loader의 route 전달까지 확인하도록 강화하면서 이름을 바꾸었고, 검증 JSON에 이전/현재 이름 대응을 기록했다.
- CP3 최종: 전체 dev Chromium desktop/mobile 112/112, production 100/100 통과. 실패·건너뜀·flaky 0이며 시각 기준을 추가 갱신하지 않았다. 18개 변경/신규 시각 자료를 검토했으며 겹침·잘림을 발견하지 않았다. 실제 screen-reader 음성이나 별도 기기·브라우저·사람 검토는 수행하지 않았다.
- CP3 최종: typecheck/build, 변경 소스 ESLint/Prettier, source policy/module-size, catalog/inventory 및 secret scan 통과. 원본 app.html·계산 엔진·공개 API·S03 계약/저장·package/lock·baseline/golden 경로의 Git 변경 0과 두 바탕화면 사본 SHA-256 일치를 확인했다. 전체 결과·원시 보고서 hash·초기 실패와 수정 증거는 [검증 보고서](S07-verification.json)에 기록했다.
- CP3 최종: [사용자 확인 목록과 미리보기](../core-lab-ko.md)를 제공한다. 사용자 review gate 7은 아직 미승인이고, 다음 단계 요청 전까지 S08 작업을 시작하지 않는다.

## Commit / 원격 증거

- 명시적 경로만 stage한다. 모든 구현과 검증이 원격에 존재할 때까지 nextStage=7 유지.
- 각 checkpoint hash/push 증거는 다음 checkpoint에서 기록하며 최종 status hash는 사용자 보고에 기록한다.
- CP0: `d00804e97e9848de86c236516b607f45afc5d13e`, push 성공, ls-remote 일치.
- CP1: physics와 analysis targeted Vitest 및 S01 golden 통과 (`tmp/S07-adapters-vitest.json`), typecheck와 대상 ESLint 통과. 기존 engine/chaos 코드는 변경하지 않았다.
- CP1 수치 범위: 두 시스템 S01 상태/RHS/에너지 golden, RK4/RK2/Euler 직접 엔진 parity, 단위·모델 버전·자원 한도·실패 rollback, Poincaré 교차/근 인증, 최대 Lyapunov 결정론과 실제 RHS progress, worker 종료/오류/늦은 메시지 무시.
- CP1: `cbd4efefe9255747d0a43ce44468884edac0adf4`, push 성공, ls-remote 일치. 해당 checkpoint의 85/85 검증은 새 어댑터 72개와 기존 S01 golden 13개다.
- CP2: `18540b850d91d13a127341d4ab9876951b365195`, push 성공, ls-remote 일치. nextStage=7을 유지한 채 모든 구현이 원격에 존재함을 확인하고 전체 최종 검증을 시작한다.
- CP2B: `302f2374fbe57aa1e77f6ac1acde1ad46389f69e`, 지연 로딩 수정 push 성공, ls-remote 일치. 이 구현본에서 모든 최종 검사를 다시 수행한다.

## 후속

- 롤백 기준: `1cd55d1` 및 운영 가능한 기존 app.html.
- S07 review 보고를 받은 뒤 “8단계 실행해줘.”라는 요청을 받으면 핵심 실험실 구조 승인으로 기록한다.
