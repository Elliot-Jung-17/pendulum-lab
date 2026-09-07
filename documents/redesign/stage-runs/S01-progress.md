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
| CP0 | 실행 기록과 activeStage 설정 | redesign:check, redesign:preflight -- 1 | 원격 보존 완료 |
| CP1 | inventory 및 golden, 성능/보안 기준선 | inventory owner/stage/import 검사, 관련 unit, golden 재실행, typecheck | 원격 보존 완료 |
| CP2 | 전체 검증과 최종 보고 | D + 전체 npm test, 문서/JSON 검사, diff 보존 확인 | candidate-complete; 전체 검증 통과, 보고서 push 예정 |
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
- 기존 전체 Vitest: 229개 파일·1,647개 통과, 계획 출발점과 일치.
- CP1 관련 Vitest: 3개 파일·23개 통과(inventory 7, golden 13, secret scan 3), typecheck 및 대상 ESLint 통과.
- inventory: 883개 파일/118개 의미 기능/6,825개 관찰/2,548개 relative import, orphan 및 깨진 import/binding 0. 모듈 계열 배정 771개와 GPU 도구의 계산된 import 12개를 명시적으로 구분했다.
- 교차 검토에서 선언 anchor 불일치, 기존 npm 명령 삭제 누락, CRLF 동적 import 표현식, 마지막 export 삭제 탐지 문제를 수정하고 corruption fixture로 검증했다.
- Golden 최초 Poincaré assertion 1개는 rootTol의 단위를 시간 bracket으로 바로잡았다. 생산 코드/고정 예상값은 변경하지 않았다.
- Production build 및 3회 실제 browser 성능 측정 통과; 중앙값 시작 253.9 ms, 앱 FPS 59.946, JS heap 5.234 MiB, RQA 144.8 ms. console/page error 0.
- 공식 npm audit exit 1: High 2/Moderate 2 패키지. 첫 sandbox audit의 0건 응답은 모순되어 clean 근거에서 제외했다. GitHub Dependabot 4 High, 기존 master CodeQL 32건(18 High/14 Medium), secret scanning 열린 경고 0건. 기존 위험은 미해결로 기록하고 패키지는 변경하지 않았다.
- CP1 문서 검사: Markdown 7개, JSON 4개, 로컬 링크 131개 통과; 바탕화면 두 원본 사본 hash 재확인 일치.
- CP2: CP1 원격 확인 뒤 전체 `npm test` 232개 파일·1,670개 통과(실패/보류 0). 기존 1,647개 테스트 식별자 보존, 기존 테스트 파일 229개 변경 없음. 최종 기록은 `baseline/verification.json`.
- CP2: `redesign:check`, `redesign:inventory:check`, `typecheck` 통과. `src`, `app.html`, `css`, `public`, npm/Python lockfile의 원본 Git 객체가 일치한다.

## Commit / 원격 증거

- CP0: `ccfd9ef0a57b8a6ac93ca83bf8db494b21dbcc5d`; push 성공, ls-remote와 로컬 HEAD 일치 확인.
- CP1: `1d6191ac8faf5b2b5240c4eed588af88943741ac`; push 성공, ls-remote와 로컬 HEAD 일치 확인. 신규 파일 포함 staged secret scan: 1,114 tracked / 1,084 text / 30 binary / 탐지 0.
- 구현 checkpoint와 status commit은 각각 push하고 `git ls-remote origin refs/heads/codex/redesign`으로 검증한다.

## 남은 작업

CP2 보고서 원격 보존, STATUS. 전체 필수 검증을 통과한 candidate-complete 상태다. 다음 단계는 시작하지 않았다.
