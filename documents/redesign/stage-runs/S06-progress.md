# S06 진행 기록 — 자유 실험실 골격

## 시작점과 범위

- 기준/원격 HEAD: `4933146027e703c8c88a8296b1de912e8ca7f01c`, fetch 후 일치, clean worktree.
- 브랜치/upstream: `codex/redesign` / `origin/codex/redesign`.
- 의존성: S01~S05 status/Git history와 catalog/contracts/next.html/design-system 및 기존 검증 보고서 확인. S05 구현 `05d1eb1`, 검증 `367188e`, status `4933146`.
- 목표: System Library 검색/패밀리/최근/즐겨찾기, Workspace, schema-driven Inspector, Analysis Dock, mock Run Bar, Experiment Tray, Export Center의 실제 상태 흐름.
- 범위 밖: S07 실제 물리·분석 adapter와 수치 결과, 이후 패밀리별 모델 schema, Learn 콘텐츠, migration/cutover.
- 보존: app.html, physics/chaos/research/runtime/workers/validation, lib 공개 API, 기존 저장·공유·import/export, 사용자 데이터, package/lockfile, S01 baseline과 S02/S03 계약.
- 모델 UI 선택값은 읽을 수 없으므로 선택 확인·변경을 주장하지 않는다.

## Checkpoint

| ID | 작업 | 검증 | 상태 |
|---|---|---|---|
| CP0 | 실행 기록과 activeStage | redesign:check, redesign:preflight -- 6 | 검증 완료 |
| CP1 | capability selector·mock 상태·실험실 화면·여정 | 관련 Vitest, typecheck, build, Playwright/axe/keyboard/mobile | 진행 예정 |
| CP2 | 전체 회귀·시각 검증·운영 문서·보존 증거 | 전체 Vitest, dev/production E2E, catalog/inventory | 진행 예정 |
| STATUS | 별도 완료 상태 | 구현 원격 확인, status push 및 원격 HEAD | 진행 예정 |

## 변경 예정 경로

- src/product/lab/, src/product/catalog/selectors.ts, src/product/app/views/lab.ts, css/product/lab.css.
- tests/product/lab/, e2e/redesign/lab-shell*, 기존 shell 여정의 S06 기대 동작.
- documents/redesign/lab-shell-ko.md, 본 기록, S06-verification.json, status.json.

## 검증·판단과 위험

- redesign:check와 redesign:preflight -- 6 통과. Git 쓰기와 하위 프로세스 sandbox 제한은 승인된 동일 명령으로 해결했다.
- S06은 mock 상태 흐름이며 물리 결과를 생성하거나 계산 가능성을 가장하지 않는다. 실제 엔진 import는 추가하지 않는다.
- S02 모델별 물성 schema는 legacy 참조이므로 임의로 물리 입력을 만들어 내지 않는다. mock 실행 설정과 catalog 메타데이터를 명시적으로 구분한다.
- S03 공유 설정은 검증된 읽기 전용 요약을 유지하며 실제 실험 복원을 주장하지 않는다.
- 기존 보안 기준선 npm audit high 2/moderate 2, CodeQL 32, default-branch Dependabot high 4는 미해결이다. 이번 단계에서 재감사·수용하지 않는다.
- 바탕화면 두 사본 SHA-256이 저장소 원본과 일치한다. roadmap/실행 계획 원본을 변경하지 않으면 복사할 필요가 없다.

## Commit / 원격 증거

- 명시적 경로만 stage한다. 모든 구현 원격 확인 전 nextStage=6을 유지한다.
- 각 checkpoint commit/push 증거는 후속 checkpoint에 기록한다. 최종 status hash는 사용자 완료 보고에 기록한다.

## 후속

- S06은 사용자 review gate가 아니다. 사람/전문가 검토 완료를 주장하지 않는다.
- 롤백 기준: `4933146` 및 기존 app.html. 완료 시 다음 유효 입력: “7단계 실행해줘.”
