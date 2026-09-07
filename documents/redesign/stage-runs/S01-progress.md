# S01 진행 기록 — 기준선 안전망과 전수 인벤토리

## 시작점과 범위

- 기준/원격 HEAD: `3bb80147cffbde27364cb814f685bc06da3e1dea` (2026-09-07 fetch 후 일치).
- 브랜치/upstream: `codex/redesign` / `origin/codex/redesign`; 시작 작업 트리 clean.
- 선행 단계: 없음. `lastCompletedStage=0`, `nextStage=1` 확인.
- 목표: read-only 기능 inventory, 재실행 가능한 수치 golden, 현재 성능 및 보안 기준선.
- 범위 밖: S02 registry 구현, 새 UI, 엔진 변경, dependency upgrade, master/배포/릴리스.
- 보존: `src/physics`, `src/chaos`, `src/research`, `src/runtime`, `src/workers`, `src/validation`, 공개 API, 기존 fixture/preset, 저장/공유/import/export 형식과 `app.html`.
- 모델 UI 선택은 도구로 확인할 수 없어 선택값 검증을 주장하지 않는다.

## Checkpoint와 검증

| ID | 작업 | 필수 검증 | 상태 |
|---|---|---|---|
| CP0 | 실행 기록과 activeStage 설정 | redesign:check, redesign:preflight -- 1 | 검증 완료, commit/push 예정 |
| CP1 | inventory 및 golden, 성능/보안 기준선 | inventory owner/stage/import 검사, 관련 unit, golden 재실행, typecheck | 진행 예정 |
| CP2 | 전체 검증과 최종 보고 | D + 전체 npm test, 문서/JSON 검사, diff 보존 확인 | 진행 예정 |
| STATUS | 구현 원격 확인 후 완료 상태 | status 일관성 및 원격 HEAD 확인 | 진행 예정 |

## 변경 예정 경로

- `scripts/redesign/`: inventory/측정/보안 기준선 도구.
- `documents/redesign/baseline/`: 자동 생성 목록과 측정/보안 보고서.
- `tests/characterization/`: golden 및 inventory 검증.
- `package.json`: S01 재실행 명령만 추가 가능.
- 본 문서 및 `documents/redesign/status.json`.

## 검증·판단 기록

- `npm run redesign:check`: 30단계/86단원 통과.
- `npm run redesign:preflight -- 1`: 통과.
- sandbox에서 Git 쓰기/하위 프로세스가 제한되어 승인된 확장 실행으로 fetch/preflight 완료.
- 두 바탕화면 전달용 문서와 저장소 원본 SHA-256 일치; 원본 계획 내용 변경 없음.
- 수치 fixture는 기존 엔진의 현재 동작 보존 증거이며 독립 과학 검증 또는 사람 검토를 의미하지 않는다.
- 감사에서 접근 불가능한 외부 보안 정보는 clean으로 표시하지 않고 미확인으로 기록한다.

## Commit / 원격 증거

- CP0: 아직 commit/push하지 않음.
- 구현 checkpoint와 status commit은 각각 push하고 `git ls-remote origin refs/heads/codex/redesign`으로 검증한다.

## 남은 작업

CP1, CP2, STATUS. 다음 단계는 시작하지 않았다.
