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
| CP0 | 실행 기록과 activeStage | redesign:check, redesign:preflight -- 4 | 기록 작성 |
| CP1 | 병렬 진입점·공통 셸·라우터·오류 복구·테스트 | 관련 Vitest, typecheck, build, route/keyboard/axe smoke | 예정 |
| CP2 | 전체 회귀·운영 설명·보존 증거 | C + 핵심 Playwright, 전체 Vitest, inventory/catalog | 예정 |
| STATUS | 구현 원격 확인 후 완료 상태 | 별도 status commit/push와 원격 HEAD | 예정 |

## 변경 예정 경로

- `next.html`, `vite.config.ts`의 추가 build entry.
- `src/product/app/`, `tests/product/app/`, `e2e/redesign/shell*`.
- `documents/redesign/shell-ko.md`, 본 기록, `S04-verification.json`, `status.json`.

## 검증·판단과 위험

- `redesign:check` 통과. fetch와 preflight의 sandbox Git 쓰기/하위 프로세스 제한은 같은 명령의 확장 실행으로 해소; `redesign:preflight -- 4` 통과.
- 빈 hash만 명시적으로 Learn으로 대체하고, 알 수 없는 주소는 원본 URL을 유지한 오류로 처리한다. 공유는 S03의 envelope/시스템 일치 검사까지 거친다.
- S04는 두 공간의 동작하는 진입·이동 경로를 제공한다. 아직 없는 단원/시뮬레이터에는 정직한 미제공 상태와 기존 앱으로 가는 실제 링크를 제공한다.
- 기존 보안 기준선 npm audit high 2/moderate 2 패키지, CodeQL 32건, GitHub default-branch Dependabot high 4건은 미해결이다. 이번 단계에서 재감사·업그레이드·위험 수용하지 않는다.
- 바탕화면 roadmap/실행 계획 사본은 원본과 SHA-256이 각각 일치한다. 원본 두 문서를 수정하지 않으면 복사는 필요하지 않다.

## Commit / 원격 증거

- 명시적 경로만 stage하고 검증된 checkpoint를 push한다. 구현의 원격 존재 확인 전 `nextStage=4`를 유지한다.
- 각 commit과 push 증거는 후속 checkpoint에 기록하고 최종 status hash는 사용자 보고에 남긴다.

## 후속

- S04는 사용자 review gate가 아니다. 사람/전문가 검토를 수행했다고 표시하지 않는다.
- 롤백 기준: `543bfc8` 및 계속 제공되는 기존 `app.html`.
- STATUS 원격 확인 후 다음 유효 단계는 S05이다.
