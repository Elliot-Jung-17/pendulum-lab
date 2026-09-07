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
| CP0 | 실행 기록 및 activeStage | redesign:check, redesign:preflight -- 3 | 원격 보존 완료 |
| CP1 | canonical 상태/단위와 안전한 직렬화·공유·route, adapter 계약 | 관련 unit/property/round-trip/unsafe tests, typecheck | 원격 보존 완료 |
| CP2 | 계약 문서·전체 회귀·보존 증거 | D, 전체 Vitest, baseline/catalog 검증 | candidate-complete, 검증·원격 보존 완료 |
| STATUS | 구현 원격 확인 후 완료 상태 | 별도 status commit/push, 원격 HEAD 확인 | 별도 status commit; 원격 존재 시 S03 완료 |

## 변경 예정 경로

- `src/product/contracts/`와 `src/product/persistence/` 신규 계약 및 codec.
- `tests/product/contracts/` 정상/경계/실패 및 결정론 fixture.
- `documents/redesign/state-contract-ko.md`, 본 기록, `S03-verification.json`, `status.json`.

## 검증·판단과 위험

- `redesign:check` 통과. fetch 및 preflight의 sandbox Git 쓰기/하위 프로세스 제한은 확장 실행으로 해소하여 `redesign:preflight -- 3` 통과.
- 기존 보안 기준선 High 2/Moderate 2 패키지와 CodeQL 32건은 미해결이며 이번 단계에서 위험 수용하지 않는다.
- unknown field/version은 조용히 버리지 않고 원본 유지·복구 안내가 있는 오류로 반환한다.
- 공유에는 실험 의미만 담고 UI/로컬 경로/자유 서술 개인정보를 넣지 않는다. 큰 배열은 명시적으로 거부하여 향후 파일 저장 경로로 안내한다.
- CP1: 17개 신규 source와 9개 fixture/test 파일을 추가했다. [상태 계약](../state-contract-ko.md)에 API·버전·단위·주소·오류·한도와 남은 adapter 책임을 명시했다.
- `npx vitest run tests/product/contracts tests/product/catalog tests/characterization`: 16개 파일, 327개 통과(신규 계약 239개 + S01/S02 88개), 실패/보류 0. 마지막 JSON 출력 byte 제한 보강 뒤 신규 계약 8개 test 파일 239개 재검사 통과.
- 고정 seed property 검사로 scalar/vector/complex, signed seed, deterministic JSON/공유, route 왕복을 확인했다. 34개 시스템·86개 단원 주소는 카탈로그/공식 curriculum과 전수 대조한다.
- 교차 검토에서 enum의 배열/객체 문자열 강제변환과 array length 접근을 보강했고, 공유 credential 이름 필터를 확장했다. 테스트 fixture의 잘못된 catalog ID/검색 가정도 수정 후 통과했다. 기존 golden 값은 바꾸지 않았다.
- `typecheck`, 대상 ESLint/Prettier, `audit:modules`(481개 source, 예외 0), `git diff --check` 통과. 계약 문서 상대 링크 14개와 code fence 2개 확인.
- `redesign:catalog:check`: S02 134개 정의 유지. `redesign:inventory:check`: S01 883개 파일·118개 의미 기능 일치, orphan/broken import 0.
- 기존 app/엔진/API/storage/worker/검증/lockfile과 baseline fixture를 수정하지 않았다. master roadmap 및 실행 계획 사본은 각각 SHA-256 `1d46e04691d4119ced60dacb41945c75d9d1a20f66cbaed2b3664909f47f8995`, `803b191496edd95ebf2199a8983b920058109bb159d55f8bafeb0737fa735fc5`로 원본/바탕화면 일치.
- 공유 CRC32는 손상 탐지이며 인증/암호화가 아니다. 선언형 model field·단위·generator 실행 적합성, solver/RNG/delay 내부 상태와 전체 legacy migration은 후속 adapter 단계 책임이다.
- CP0 push 응답에서 GitHub default branch Dependabot 4 high 경고도 관찰했다. S01 npm audit의 2 high/2 moderate 패키지와는 다른 집계이며 별도로 기록한다. 재감사나 해결/수용은 수행하지 않았다.
- CP2: 구현 원격 확인 후 `npm test -- --reporter=json --outputFile=tmp/s03-vitest-results.json` 전체 245개 파일·1,974개 테스트 통과. 기존 237개 파일·1,735개와 신규 8개 파일·239개가 모두 통과하고 실패/보류/todo 0이다.
- `redesign:check`, `redesign:catalog:check`, `redesign:inventory:check` 재확인 통과. 원격 CP1 status가 nextStage=3인 상태에서 전체 검증했다. 집계·원시 결과 SHA-256은 [S03-verification.json](S03-verification.json)에 기록한다.
- 바탕화면 두 사본과 원본의 hash 최종 일치. 원본 roadmap/실행 계획 본문을 수정하지 않아 사본을 다시 쓰지 않았다.

## Commit / 원격 증거

- checkpoint는 검증 후 명시적 경로만 stage하고 push한다. 구현 원격 확인 전 nextStage=3 유지.
- 각 hash와 원격 확인 결과는 후속 checkpoint에 기록한다. STATUS는 최종 사용자 보고에도 남긴다.
- CP0: `c66f435693dceb83c53aefd47818379d1c2d582d`, push 성공 및 ls-remote 일치 확인.
- CP1: `d0b1693ea06fcd15cc6216d6a363ffb84f2b5f8e`, 구현 push 성공, ls-remote와 로컬 HEAD 일치. 완료 목록/nextStage=3 유지.
- CP1 stage 후 secret scan: 1,174 tracked / 1,144 text / 30 binary, 알려진 패턴 탐지 0. history/ignored/binary 내용/임의 비밀값은 검사 범위 밖.
- CP2: `af19bf8e014ee6978b61b2c49bf1063ee6e114bc`, 검증 증거 push 성공, ls-remote와 로컬 HEAD 일치.
- STATUS: CP2 원격 확인 뒤 본 문서와 status.json만 별도 commit한다. status commit hash와 원격 일치 확인은 최종 사용자 보고에 남긴다. 원격 존재 전 로컬 완료 표시는 효력이 없다.

## 후속

- S03은 사용자 review gate가 아니다. 사람/전문가 검토 완료를 주장하지 않는다.
- 롤백 기준은 `d2743f1` 및 변경하지 않는 기존 app.html이다.
- STATUS 원격 확인 뒤에만 다음 유효 입력은 “4단계 실행해줘.”이다.
- 모든 구현/필수 검증/증거 checkpoint를 원격에 보존했다. 최종 status commit까지 원격에 존재할 때 S03 완료 판정이 유효하다.
- 기존 UI·계산 경로는 그대로 유지되며 S04를 선행 구현하지 않았다. 사용자 review gate 대상이 아니고 사람/전문가 과학 검토를 수행했다고 표시하지 않았다.
