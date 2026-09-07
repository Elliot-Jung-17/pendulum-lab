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
| CP0 | 실행 기록과 activeStage | redesign:check, redesign:preflight -- 6 | 원격 보존 완료 |
| CP1 | capability selector·mock 상태·실험실 화면·여정 | 관련 Vitest, typecheck, build, Playwright/axe/keyboard/mobile | 원격 보존 완료 |
| CP2 | 전체 회귀·시각 검증·운영 문서·보존 증거 | 전체 Vitest, dev/production E2E, catalog/inventory | candidate-complete, 검증·원격 보존 완료 |
| STATUS | 별도 완료 상태 | 구현 원격 확인, status push 및 원격 HEAD | 별도 status commit; 원격 존재 시 S06 완료 |

## 변경 예정 경로

- src/product/lab/, src/product/catalog/selectors.ts, src/product/app/views/lab.ts, css/product/lab.css.
- next.html: 기존 CSP를 보존하는 외부 Lab stylesheet 연결 한 줄.
- tests/product/lab/, e2e/redesign/lab-shell*, 기존 shell 여정의 S06 기대 동작.
- documents/redesign/lab-shell-ko.md, 본 기록, S06-verification.json, status.json.

## 검증·판단과 위험

- redesign:check와 redesign:preflight -- 6 통과. Git 쓰기와 하위 프로세스 sandbox 제한은 승인된 동일 명령으로 해결했다.
- S06은 mock 상태 흐름이며 물리 결과를 생성하거나 계산 가능성을 가장하지 않는다. 실제 엔진 import는 추가하지 않는다.
- S02 모델별 물성 schema는 legacy 참조이므로 임의로 물리 입력을 만들어 내지 않는다. mock 실행 설정과 catalog 메타데이터를 명시적으로 구분한다.
- S03 공유 설정은 검증된 읽기 전용 요약을 유지하며 실제 실험 복원을 주장하지 않는다.
- 기존 보안 기준선 npm audit high 2/moderate 2, CodeQL 32, default-branch Dependabot high 4는 미해결이다. 이번 단계에서 재감사·수용하지 않는다.
- 바탕화면 두 사본 SHA-256이 저장소 원본과 일치한다. roadmap/실행 계획 원본을 변경하지 않으면 복사할 필요가 없다.
- CP1: 34개 시스템/8개 패밀리의 검색·최근·즐겨찾기, schema-driven Inspector, 호환 분석 선택, timer mock 실행, 설정 보관·복원과 명시적 mock JSON 다운로드 구현.
- 시스템별 draft는 현재 Document 안에서 유지하며 다른 시스템에 자동 이식하지 않는다. 기존 사용자 저장소는 읽거나 쓰지 않는다. 보관함은 12개 초과 시 새 보관을 거부하며 기존 자료를 자동으로 버리지 않는다.
- 관련 Vitest 24개 파일 480/480 통과, 기존 수치 characterization 포함. 새 Lab 23개 테스트는 전체 34개 시스템 기본 실행 준비, 경계 입력, 비호환 거부, 취소 이후 늦은 응답, 실행 오류, 보관 복원·한도, 공유 원본 분리를 검증했다.
- typecheck, 대상 ESLint/Prettier, production build, 소스 정책과 module-size 검사 통과. catalog 134개와 legacy inventory 883개/broken import 0/orphan 0 유지.
- 첫 browser 검사에서 반복 횟수 unit 표시와 색 대비 위반을 발견했다. 근본 원인은 Vite CSS import의 style 주입이 기존 CSP에 차단된 것이며 next.html 외부 stylesheet 방식으로 수정했다. CSS 정책을 완화하지 않고 pageerror/console error 0 검사도 추가했다.
- 개발 서버 테스트 중 소스 변경에 따른 HMR 재시작 실패가 있어, 이후 browser 실행 동안 소스 변경을 멈추고 재검증했다. 실패한 시각 기준을 승인하거나 기존 golden 값을 변경하지 않았다.
- 새 S06 browser 여정 desktop/mobile 14/14 통과, 지정 WCAG axe 위반 0, 320px·keyboard·CSS zoom 200%·640px reflow 검증. 시각 기준 6개 생성, desktop library/workspace와 mobile dark inspector 이미지를 직접 확인했다.
- 독립 코드 검토 후 다운로드 Blob URL 지연 해제와 timer 정리, 진행 tick 음성 알림 중복 억제를 적용했다. 사람/전문가 검토로 기록하지 않는다.
- 시각 기준 갱신 없이 S04/S05/S06 개발 browser 회귀 84/84 통과, 실패·skip·retry 0. 기존 gallery 시각 기준 12개도 그대로 유지했다. S06 정상 여정의 pageerror/console error 0이며 기존 오류 주입 테스트의 의도된 진단 출력만 존재한다.
- CP2 전체 Vitest: 252개 파일 2,124/2,124 통과, 실패·pending 0. S05 전체 보고서 hash를 대조해 기존 251개 파일·2,101개 테스트가 모두 유지됨을 확인했다. 신규 1개 파일·23개 테스트.
- CP2 실제 production browser 회귀: 72/72 통과, 실패·skip·retry 0. S04 shell 34 + S05 gallery 24 + S06 Lab 14이며 시각 기준은 갱신하지 않았다. 개발 전용 lifecycle 12개는 dev 회귀에서 별도로 통과했다.
- [lab-shell-ko.md](../lab-shell-ko.md)의 링크 15개와 code fence를 검사했다. [S06-verification.json](S06-verification.json)에 원시 보고서와 screenshot hash, 기존 test 보존 대조, 입력/데이터/엔진 경계와 한계를 기록했다.
- CP1 stage secret scan: tracked 1,242개/text 1,194개/binary 48개, 알려진 credential 패턴 0. history/ignored/binary 내용과 임의 비밀값은 범위 밖이다.
- 보존 경로 Git diff 0: app.html, physics/chaos/research/runtime/workers/validation, 공개 lib, S03 contracts/persistence, package/lockfile, S01 baseline과 characterization. 기존 S04/S05 tests와 gallery baseline도 변경하지 않았다.
- 최종 바탕화면 사본 hash 일치: roadmap `1d46e04691d4119ced60dacb41945c75d9d1a20f66cbaed2b3664909f47f8995`, 실행 계획 `803b191496edd95ebf2199a8983b920058109bb159d55f8bafeb0737fa735fc5`. 두 원본 계획을 수정하지 않아 다시 쓰지 않았다.
- CP2에서 외부 stylesheet 연결 방식을 설명하는 CSS 주석만 바로잡았다. 실행 코드와 스타일 규칙은 CP1 검증본과 동일하다.

## Commit / 원격 증거

- 명시적 경로만 stage한다. 모든 구현 원격 확인 전 nextStage=6을 유지한다.
- 각 checkpoint commit/push 증거는 후속 checkpoint에 기록한다. 최종 status hash는 사용자 완료 보고에 기록한다.
- CP0: `22bc16e90d61866894bdc46dcd109bba1a8ed027`, push 성공 및 ls-remote 일치.
- CP1: `18cfd9aa501136748990677ced1eb4c510ada11b`, 구현 push 성공 및 ls-remote 일치. 원격 nextStage=6 상태에서 전체 회귀를 시작한다.
- CP2: `9f20427e60bda3b37bbba27dab1b94b31821b94b`, 검증 문서 push 성공 및 ls-remote 일치. 구현과 전체 검증 증거가 원격에 존재함을 확인했다.
- STATUS: CP2 원격 확인 후 본 기록과 status.json만 별도 commit한다. 최종 hash와 원격 확인은 사용자 완료 보고에 기록한다. 원격 존재 전에는 로컬 완료 표시가 효력을 갖지 않는다.

## 후속

- S06은 사용자 review gate가 아니다. 사람/전문가 검토 완료를 주장하지 않는다.
- 롤백 기준: `4933146` 및 기존 app.html. 완료 시 다음 유효 입력: “7단계 실행해줘.”
- 새로 확인된 미해결 S06 결함은 없다. 실제 물리 실행은 S07, 다른 OS/browser와 실제 screen reader·사람 검토 및 기존 보안 기준선은 남아 있다.
