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
| CP0 | 실행 기록과 activeStage | redesign:check, redesign:preflight -- 5 | 검증 통과 |
| CP1 | token·컴포넌트·gallery·shell 적용 | 관련 Vitest, typecheck, build, axe/keyboard/반응형 | 진행 중 |
| CP2 | 전체 회귀·시각 baseline·운영 문서·보존 증거 | 전체 Vitest, dev/production E2E, inventory/catalog | 예정 |
| STATUS | 별도 완료 상태 | 구현 원격 확인, status push 및 원격 HEAD | 예정 |

## 변경 예정 경로

- src/product/design-system/, css/product/, tests/product/design-system/, e2e/redesign/a11y*.
- next.html의 stylesheet, src/product/app/entry.ts의 독립 gallery lazy 진입, shell.ts의 gallery 링크, shell.css의 token 적용.
- documents/redesign/design-system-ko.md, 본 기록, S05-verification.json, status.json.

## 검증·판단과 위험

- 필수 redesign:check 및 redesign:preflight -- 5 통과. sandbox의 Git 쓰기/하위 프로세스 제한은 동일 명령의 승인된 확장 실행으로 해결했다.
- gallery는 next.html?gallery=components에서 열며 기존 canonical hash route 계약은 변경하지 않는다. 실제 실험/저장을 가장하지 않는 컴포넌트 예제다.
- 스타일은 외부 stylesheet로 제공해 기존 CSP를 유지한다. 테마 설정은 이번 화면에만 적용하며 사용자 저장소는 변경하지 않는다.
- 기존 npm audit high 2/moderate 2, CodeQL 32, GitHub default-branch Dependabot high 4 기준선은 미해결이며 S05에서 재감사·위험 수용하지 않는다.
- 바탕화면 사본 두 개는 원본과 SHA-256이 일치한다. 원본 roadmap/실행 계획을 바꾸지 않으면 복사는 필요하지 않다.

## Commit / 원격 증거

- 명시적 경로만 stage한다. 모든 구현 원격 확인 전 nextStage=5를 유지한다.
- commit과 원격 증거는 후속 checkpoint에 기록한다. 최종 status hash는 사용자 보고에 남긴다.

## 후속

- S05는 사용자 review gate가 아니다. 사람/전문가 검토 완료를 주장하지 않는다.
- 롤백 기준은 `8edb888` 및 기존 app.html이다. S05 완료 시 다음 유효 단계는 S06이다.
