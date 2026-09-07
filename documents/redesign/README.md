# Pendulum Lab 재설계 실행 폴더

이 폴더는 기존 Pendulum Lab을 보존하면서 새 `배우기`와 `실험실` UI로 교체하기 위한 source of truth다.

## 파일

- `master-roadmap-ko.md`: 제품 구조, 보존 범위, 목표 아키텍처, 품질 기준
- `execution-plan-ko.md`: 실제로 순서대로 실행할 30단계
- `curriculum-map-ko.md`: 8개 과정·86개 단원의 범위와 전용 실험
- `stage-run-protocol-ko.md`: 첨부 방식, Git 자동 선택, 중간 보존, 승인 게이트
- `stage-runs/`: 각 단계의 내부 checkpoint와 commit/push 증거
- `status.json`: 완료된 단계와 다음 단계

## 새 대화에서 실행하는 방법

사용자는 다음 세 항목을 새 대화에 첨부해도 된다.

1. `pendulum_lab_modular` 폴더
2. `Pendulum_Lab_Complete_Redesign_Roadmap_KO.md`
3. `Pendulum_Lab_Codex_Execution_Steps_KO.md`

그 뒤 다음처럼 번호만 입력한다.

```text
1단계 실행해줘.
```

또는:

```text
재설계 1단계 실행해줘.
```

사용자가 Git 브랜치를 알 필요는 없다. Codex는 첨부된 폴더에서 Git 저장소를 찾고, 사용자 변경이 없는지 검사하고, 원격 `codex/redesign`을 가져온 뒤 안전한 경우에만 해당 브랜치로 자동 전환한다. 저장소 안의 `documents/redesign/`가 항상 원본이며 바탕화면 문서는 전달용 사본이다.

루트 `AGENTS.md`는 Codex가 전체 계획과 상태를 읽고 해당 단계만 수행하도록 지시한다. 큰 단계는 내부 checkpoint로 나누어 중간 결과도 commit/push하지만, 사용자는 같은 단계 요청을 한 번만 입력하면 된다. 단계 완료는 최종 상태 commit이 `origin/codex/redesign`에 존재할 때만 인정한다.

Codex는 변경 전에 `npm run redesign:check`와 `npm run redesign:preflight -- N`으로 계획 구조, 단계 순서, 현재 branch와 원격 동기 상태를 기계적으로 검사한다.

## 중요한 사용 규칙

- 번호를 건너뛰지 않는다.
- 한 요청에서는 한 단계만 실행한다.
- 실패한 단계는 같은 번호로 다시 실행한다.
- 다음 단계 번호를 입력하는 것은 직전 review checkpoint 결과를 확인하고 승인한다는 뜻이다.
- Codex가 dirty worktree, branch divergence, 실패한 test, 미완료 push를 발견하면 자동으로 다음 단계로 넘어가지 않는다.
- `master` merge는 30단계 완료 후 별도로 승인한다.
- Landing Page는 이 계획에서 수정하지 않는다.

## 현재 계획 버전

- 계획: v2.1 안전 보강판
- 권장 실행 프로필: GPT-6 Astra / Ultra
- 실행 단계: 30개
- 학습 과정: 8개
- 학습 단원: 86개
- 기능 잠금: 없음
- 신규 저장소 생성: 없음
