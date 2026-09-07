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
| CP0 | 사전 점검·실행 기록 | redesign:check, redesign:preflight -- 7 | 통과 |
| CP1 | 실제 physics/analysis adapter와 worker | S01 golden·직접 엔진 동등성·단위/실패/취소, typecheck | 예정 |
| CP2 | Lab 화면·저장·내보내기 수직 절편 | 관련 Vitest, typecheck, build, desktop/mobile/axe/keyboard/visual | 예정 |
| CP3 | 전체 회귀·보존 증거·review 문서 | 전체 Vitest, dev/production 여정, catalog/inventory | 예정 |
| STATUS | 완료 상태 별도 commit/push | 구현 원격 확인 후 status 원격 HEAD 확인 | 예정 |

## 변경 예정 경로

- src/product/adapters/physics/, src/product/adapters/analysis/, src/product/lab/views/, src/product/app/views/lab.ts.
- tests/product/adapters/, tests/product/lab/, e2e/redesign/, css/product/lab.css.
- documents/redesign/core-lab-ko.md, stage-runs/S07-*, status.json.

## 검증·판단과 위험

- 원격 fetch와 두 필수 preflight 검사 통과. sandbox의 Git 쓰기/하위 프로세스 EPERM은 같은 승인된 명령으로 해결했다.
- S06의 두 시스템 mock 경로를 실제 경로로 교체하며, 나머지 시스템은 기존 mock 범위를 유지한다.
- 긴 분석은 worker에서 실행하고 종료/오류/늦은 메시지를 검증한다. 실제 제공하는 적분기만 노출한다.
- 저장은 새 versioned namespace와 canonical restart configuration을 사용한다. 기존 저장소를 변환하거나 solver continuation을 주장하지 않는다.
- 바탕화면 roadmap/실행 계획 사본은 SHA-256이 원본과 같다. 두 계획을 변경하지 않으면 재복사하지 않는다.
- 기존 S01 보안 기준선 npm high 2/moderate 2, CodeQL 32, default-branch Dependabot high 4는 미해결이며 이번 단계의 승인을 뜻하지 않는다.
- S07은 사용자 review gate다. 실제 화면과 확인 목록을 완료 보고에 제공하며 사람/전문가 검토 완료를 기록하지 않는다.

## Commit / 원격 증거

- 명시적 경로만 stage한다. 모든 구현과 검증이 원격에 존재할 때까지 nextStage=7 유지.
- 각 checkpoint hash/push 증거는 다음 checkpoint에서 기록하며 최종 status hash는 사용자 보고에 기록한다.

## 후속

- 롤백 기준: `1cd55d1` 및 운영 가능한 기존 app.html.
- S07 review 보고를 받은 뒤 “8단계 실행해줘.”라는 요청을 받으면 핵심 실험실 구조 승인으로 기록한다.
