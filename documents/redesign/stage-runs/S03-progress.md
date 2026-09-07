# S03 진행 기록 — canonical 상태·공유·라우트 계약

## 시작점과 범위

- 기준/원격 HEAD: `d2743f15b63ecf57f0b497593abcd7e612d9c200`, fetch 후 일치, 작업 폴더 clean.
- 브랜치/upstream: `codex/redesign` / `origin/codex/redesign`.
- S02 의존성: status commit `d2743f1`, 구현 `1421d1a`, 검증 `6dade3d`, 카탈로그 134개와 S02 검증 보고서 확인. S01 기준선 산출물과 이력 유지.
- 목표: versioned 실험/단위/runtime/분석/provenance 계약, 별도 UI 상태, deterministic JSON와 compact share envelope, hash route, adapter interface 및 왕복/공격 fixture.
- 범위 밖: S04 화면/라우터 실행, 기존 저장 migration 적용(S28), 엔진/worker 실행 adapter, dependency upgrade.
- 보존: physics/chaos/research/runtime/workers/validation, 공개 API, 기존 state/storage/share/import/export, app.html, 사용자 데이터, lockfile, S01 fixture.
- 모델 UI 선택값은 확인할 수 없어 확인 또는 변경했다고 주장하지 않는다.

## Checkpoint

| ID | 작업 | 검증 | 상태 |
|---|---|---|---|
| CP0 | 실행 기록 및 activeStage | redesign:check, redesign:preflight -- 3 | 통과, commit 준비 |
| CP1 | canonical 상태/단위와 안전한 직렬화·공유·route, adapter 계약 | 관련 unit/property/round-trip/unsafe tests, typecheck | 대기 |
| CP2 | 계약 문서·전체 회귀·보존 증거 | D, 전체 Vitest, baseline/catalog 검증 | 대기 |
| STATUS | 구현 원격 확인 후 완료 상태 | 별도 status commit/push, 원격 HEAD 확인 | 대기 |

## 변경 예정 경로

- `src/product/contracts/`와 `src/product/persistence/` 신규 계약 및 codec.
- `tests/product/contracts/` 정상/경계/실패 및 결정론 fixture.
- `documents/redesign/state-contract-ko.md`, 본 기록, `S03-verification.json`, `status.json`.

## 검증·판단과 위험

- `redesign:check` 통과. fetch 및 preflight의 sandbox Git 쓰기/하위 프로세스 제한은 확장 실행으로 해소하여 `redesign:preflight -- 3` 통과.
- 기존 보안 기준선 High 2/Moderate 2 패키지와 CodeQL 32건은 미해결이며 이번 단계에서 위험 수용하지 않는다.
- unknown field/version은 조용히 버리지 않고 원본 유지·복구 안내가 있는 오류로 반환한다.
- 공유에는 실험 의미만 담고 UI/로컬 경로/자유 서술 개인정보를 넣지 않는다. 큰 배열은 명시적으로 거부하여 향후 파일 저장 경로로 안내한다.

## Commit / 원격 증거

- checkpoint는 검증 후 명시적 경로만 stage하고 push한다. 구현 원격 확인 전 nextStage=3 유지.
- 각 hash와 원격 확인 결과는 후속 checkpoint에 기록한다. STATUS는 최종 사용자 보고에도 남긴다.

## 후속

- S03은 사용자 review gate가 아니다. 사람/전문가 검토 완료를 주장하지 않는다.
- 롤백 기준은 `d2743f1` 및 변경하지 않는 기존 app.html이다.
- STATUS 원격 확인 뒤에만 다음 유효 입력은 “4단계 실행해줘.”이다.
