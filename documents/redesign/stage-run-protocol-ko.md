# Pendulum Lab 단계 실행 안전 프로토콜

> 계획 버전: v2.1
>
> 적용 조건: 사용자가 명시적으로 `N단계 실행`을 요청했을 때만 적용

## 1. 세 항목 첨부 방식

사용자는 Git 용어를 알 필요가 없다. 다음 세 항목을 첨부하고 단계 번호만 입력할 수 있다.

1. `C:\Users\junge\Desktop\pendulum_lab_modular\` 폴더
2. `C:\Users\junge\Desktop\Pendulum_Lab_Complete_Redesign_Roadmap_KO.md`
3. `C:\Users\junge\Desktop\Pendulum_Lab_Codex_Execution_Steps_KO.md`

예시:

```text
1단계 실행해줘.
```

첨부된 두 Markdown 문서는 탐색을 돕는 전달용 사본이다. 실행 범위와 현재 상태는 반드시 첨부 폴더 안의 다음 파일에서 다시 확인한다.

- `AGENTS.md`
- `documents/redesign/execution-plan-ko.md`
- `documents/redesign/master-roadmap-ko.md`
- `documents/redesign/curriculum-map-ko.md`
- `documents/redesign/status.json`

전달용 사본과 저장소 문서가 다르면 저장소 문서가 원본이다. 차이를 보고하고, 안전한 단계 종료 시 전달용 사본을 원본과 다시 동기화한다.

## 2. 실행 프로필

- 요청 모델: **GPT-6 Astra**
- 요청 reasoning effort: **Ultra**
- 목적: 긴 단계의 일관된 추론, 코드베이스 전수 조사, 수치·UX·migration 검증

모델 선택은 사용자가 Codex UI에서 한다. 실행 agent는 UI의 실제 선택값을 읽을 수 있을 때만 일치 여부를 단정한다. 읽을 수 없으면 사용자의 선택을 전제로 진행하되, 다른 모델로 바꾸었다고 주장하지 않는다.

## 3. 자동 저장소·브랜치 준비

단계를 시작하는 agent는 다음 순서를 자동 수행한다.

1. 첨부 폴더에서 `.git`을 찾고 `git rev-parse --show-toplevel`로 정확한 저장소 루트를 확인한다.
2. `git status --short --branch`, 현재 HEAD, configured remote, upstream을 읽는다.
3. 추적되지 않거나 수정된 파일이 있으면 그것이 직전 미완료 단계의 checkpoint인지 증명한다. 무관하거나 불명확하면 중단하고 파일 목록을 보고한다.
4. `git fetch origin codex/redesign`으로 원격 상태를 갱신한다.
5. 로컬 `codex/redesign`이 있으면 그 브랜치로 전환한다. 로컬에는 없고 원격에만 있으면 `origin/codex/redesign`을 추적해 생성한다.
6. 원격 redesign 브랜치가 없으면 `master`에서 임의 재생성하지 않고 중단한다.
7. 로컬이 원격보다 뒤에 있고 작업 폴더가 깨끗하면 fast-forward만 허용한다.
8. 로컬이 앞서면 직전 stage의 push 실패인지 검사하여 그 push부터 복구한다.
9. 양쪽이 갈라졌으면 merge/rebase/force-push하지 않고 중단한다.
10. `npm run redesign:check`와 `npm run redesign:preflight -- N`을 통과한 뒤에만 파일을 수정한다.

## 4. 단계 내부 checkpoint

30개는 사용자가 관리하는 번호다. 구현 작업은 안전을 위해 더 작은 내부 checkpoint로 나눈다.

단계를 시작할 때 `documents/redesign/stage-runs/SNN-progress.md`를 만들고 다음을 기록한다.

- 기준 HEAD와 원격 HEAD
- 단계 목표와 명시적 범위 밖 항목
- 기존 기능·API·데이터 보존 목록
- 내부 checkpoint 목록과 각 검증
- 변경 예정 경로
- 현재 완료 checkpoint와 남은 항목
- 발견된 위험, 실패, 판단 근거
- commit hash와 원격 push 증거

첫 progress commit에서는 `status.json.activeStage`를 N으로, `activeStageCheckpoint`를 첫 checkpoint ID로 기록하되 `nextStage`와 완료 목록은 바꾸지 않는다. checkpoint가 바뀔 때 이 두 진행 필드와 progress 문서를 함께 갱신한다.

권장 checkpoint 크기:

- 계약/adapter 하나 또는 응집된 기능 하나
- review 가능한 diff
- targeted test를 10분 이내에 재실행할 수 있는 범위
- 실패 시 마지막 원격 checkpoint부터 다시 시작할 수 있는 범위

일반 단계는 보통 1~3개 구현 commit이면 충분하다. S10~S27처럼 범위가 큰 단계는 필요한 만큼 bounded checkpoint commit을 사용한다. 커밋 수를 줄이기 위해 서로 무관한 시스템이나 단원을 한 diff에 섞지 않는다.

각 checkpoint는 다음 순서를 지킨다.

1. 관련 기존 코드를 읽고 characterization test 필요 여부 확인
2. 최소 범위 구현
3. targeted test, typecheck 또는 단계 지정 검증
4. diff와 staged path 확인
5. 명시적 경로만 commit
6. `origin/codex/redesign`에 push하고 원격 hash 확인
7. progress 문서 갱신

checkpoint push가 실패하면 이후 checkpoint로 진행하지 않는다.

직전 단계가 S07, S09, S17, S24, S28이고 사용자가 review 보고서를 받은 뒤 다음 번호를 요청했다면, 새 단계의 첫 checkpoint에서 해당 번호를 `approvedReviewGates`에 기록한다. 질문이나 수정 요청은 승인으로 기록하지 않는다.

## 5. 단계 완료와 push의 원자성

`status.json`의 완료 표시와 원격 상태가 어긋나지 않도록 다음 두 번의 push를 사용한다.

1. 모든 구현·테스트·문서 checkpoint를 먼저 push한다. 이때 `status.json.nextStage`는 아직 현재 단계다.
2. 원격에 모든 구현 commit이 존재하는지 확인한다.
3. progress 문서를 `candidate-complete`로 만들고 단계의 전체 필수 검증을 실행한다.
4. 검증 성공 후에만 `status.json`을 다음 단계로 갱신하고 별도의 status commit을 만든다.
5. status commit을 push하고 원격 branch가 그 commit을 가리키는지 확인한다.

5번이 실패하면 로컬 파일에 완료라고 적혀 있어도 단계는 완료가 아니다. 다음 요청에서 새 작업을 시작하지 않고 해당 status commit의 push와 원격 확인만 복구한다. 원격의 `status.json`이 실행 순서의 최종 권위다.

## 6. 사용자 review checkpoint

다음 단계가 끝나면 Codex는 사용자가 직접 확인할 짧은 checklist와 미리보기 경로를 제공한다.

| 단계 | 확인 대상 | 다음 번호 입력의 의미 |
|---|---|---|
| S07 | 이중·복합진자 전체 Lab 수직 절편 | 핵심 실험실 구조 승인 |
| S09 | 과정 1과 Focus Experiment→Lab 왕복 | 학습 경험 구조 승인 |
| S17 | 전체 시스템 패밀리의 탐색·설정 구조 | 시스템 확장 방향 승인 |
| S24 | 연구 프로젝트와 재현 패키지 | 연구 워크플로 승인 |
| S28 | migration, parity 100%, rollback 증거 | 기본 앱 전환 승인 |

사용자가 review 보고서를 받은 뒤 다음 단계 번호를 입력하면 해당 checkpoint를 승인한 것으로 기록한다. 관찰하지 않은 화면이나 검토하지 않은 과학 내용을 `human-reviewed`라고 표시하지 않는다.

## 7. 과학 콘텐츠 검증 등급

각 단원은 다음 상태를 분리해 기록한다.

- `automated-verified`: 식, 단위, 극한, 예제와 Focus Experiment fixture 통과
- `source-checked`: 신뢰할 수 있는 교과서·논문·공식 참고문헌과 대조 완료
- `human-reviewed`: 물리 전공자가 실제로 검토하고 기록을 남김

AI 검토만으로 `human-reviewed`를 부여하지 않는다. S29 전환 전에는 모든 공개 단원이 최소 `source-checked`여야 한다. `human-reviewed`가 끝나지 않았다면 제품과 release 보고서에 그 사실을 투명하게 표시한다.

## 8. 보안·공급망 검사

- S01에서 dependency lockfile, `npm audit` 결과, secret scan, GitHub 경고를 기준선으로 기록한다.
- 자동 major upgrade나 취약 패키지 일괄 교체는 하지 않는다. 물리 결과와 build에 미치는 영향을 분석해 별도 checkpoint로 처리한다.
- import/share/ZIP/CSV/video 입력에는 크기 제한, path traversal, prototype pollution, formula injection, malformed payload 검사를 둔다.
- S30에서 알려진 high/critical 항목은 해결하거나, 영향·완화·사용자 승인과 함께 명시적으로 보류한다. 근거 없는 무시는 허용하지 않는다.

## 9. 복구 규칙

- 삭제보다 adapter와 deprecation을 우선한다.
- 기존 master 기준 commit `222fe19`와 원격 redesign history를 복구 지점으로 유지한다.
- 실패한 test를 통과시키기 위해 golden 값을 이유 없이 다시 생성하지 않는다.
- migration은 원본을 복사한 뒤 변환하고 round-trip 및 failure fixture를 통과한다.
- S28 parity 100%와 사용자 승인이 없으면 S29 cutover를 실행하지 않는다.
- merge, rebase, force-push, tag, release, branch 삭제는 단계 번호 요청만으로 승인되지 않는다.

## 10. 단계 종료 보고

완료 보고는 최소한 다음을 포함한다.

- 실행한 단계와 내부 checkpoint
- 사용자 관점 결과
- 변경 파일과 보존된 기존 계약
- targeted/전체 test 결과
- 구현 commit, status commit, 각 원격 확인
- 보안·수치·UX·과학 검토 상태
- 미해결 위험과 rollback 방법
- 사용자 review가 필요하면 확인할 화면
- 다음에 입력할 정확한 번호
