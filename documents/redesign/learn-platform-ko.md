# S08 배우기 콘텐츠 플랫폼

## 제공 범위

`next.html#/learn`은 교육과정 지도와 일치하는 8과정·86단원 목차를 제공한다. `#/learn/course-1/1.1`은 하나의 단원 프레임 샘플이며 수식·기호·단위·그림 설명·인용·용어·선수 개념·확인 질문·진도 복구를 실제로 사용한다. 나머지 85개는 준비 중인 콘텐츠로 표시한다. 순서나 진도에 따른 기능 잠금은 없다.

과정 1 전체 제작, 실행 가능한 Focus Experiment와 canonical state를 실험실로 전달하는 왕복은 S09 범위다. 샘플의 실험실 링크는 기존 S07 이중진자 작업 공간을 여는 일반 링크이며 전용 실험이나 값 전달을 가장하지 않는다.

## 콘텐츠 작성과 검증

- [schema](../../src/product/learn/schema.ts)는 `pendulum-learn-course/v1`, `pendulum-learn-unit/v1`과 한국어·영어·번역 키를 가진 block을 정의한다.
- [curriculum](../../content/learn/curriculum.ts)은 목차 메타데이터이며 [modules](../../content/learn/modules.ts)는 공개 가능한 단원별 명시적 dynamic import다. 실제 단원 본문은 해당 URL에 진입할 때만 가져온다.
- [validator](../../src/product/learn/validation.ts)는 안전한 데이터 사본을 만든 뒤 알 수 없는 필드, 잘못된 ID/버전, 중복, 누락된 변수 설명·단위, 그림 연결, 인용·선수 단원·실험 참조, 선택지와 정답을 검사한다. 함수·getter·prototype 오염·비유한 값·과대 입력은 거부한다.
- [build 검사](../../scripts/redesign/validate-learn.ts)는 authoritative curriculum의 ID·제목·순서·개수, 실제 파일과 loader의 양방향 대응을 검사한다. 누락/고아 파일이나 잘못된 콘텐츠는 build 이전에 실패한다. `npm run redesign:learn:check`로도 독립 실행한다.
- 기존 `prebuild`, `prebuild:lib`, `prebuild:standalone`의 명령은 보존하고 그들이 호출하는 catalog gate에 콘텐츠 검사를 추가했다. 의존성이나 lockfile은 변경하지 않는다.

S08 수식은 평가하지 않는 제한된 문자열과 모든 기호의 정의, 단위, 읽기 설명으로 구성한다. `role="math"`의 접근성 이름과 별도 보이는 설명을 함께 제공한다. 그림은 검증된 좌표·선·라벨만 SVG DOM으로 구성하며 계산 결과가 아닌 개략도임을 표시한다. 임의 HTML/TeX 실행이나 외부 이미지 로드는 없다.

## 진도와 복구

[progress store](../../src/product/learn/progress.ts)는 명시적으로 답을 확인할 때만 `pendulum-product/learn-progress/v1/{unitId}`에 쓴다. 단원을 읽는 것만으로 저장소를 바꾸지 않는다. 저장 envelope는 schema, unitId와 콘텐츠 버전별 답·시도 횟수를 갖는다. 완료 여부는 현재 질문의 정답에서 다시 계산하며 권한이나 실험 설정으로 사용하지 않는다.

이전 버전 기록은 보존하며 새 버전에서 다시 확인할 수 있다. 손상된 JSON, 미래 schema, 알 수 없는 필드, 한도 초과는 원문을 덮어쓰지 않는다. 저장 불가 시 현재 페이지에서 문제를 풀 수 있고 저장되지 않았음을 표시한다. 명시적인 단원 초기화는 확인 시점의 원문과 현재 저장값이 같은 경우에만 그 단원의 기록을 삭제한다.

각 제출은 최신 저장값을 읽고 같은 단원의 질문을 합친다. 다른 단원의 기록을 덮어쓰지 않는다. localStorage는 원자적인 compare-and-swap이 없어 같은 단원을 두 탭에서 정확히 동시에 쓰면 마지막 쓰기가 남을 수 있다. 다른 탭의 순차 변경은 storage event로 반영한다. 확인 전 선택은 다른 질문 제출이나 외부 진도 변경으로 지워지지 않는다.

## 오류·접근성·과학 검토

콘텐츠 loading/취소/실패는 단원 내부에서 안내하고 주소와 진도를 보존한다. 취소·화면 이동 뒤 늦은 결과는 무시한다. import 실패의 재시도는 실패한 모듈 캐시를 벗어나도록 같은 주소를 새로고침한다. 키보드용 제목 focus, native radio/fieldset/legend, 진행률 label, feedback status, 선수 개념 disclosure와 light/dark token을 사용한다.

샘플 기하와 각도 정의는 MIT Underactuated Robotics의 Simple Double Pendulum과 S07 `planarPositions`를 대조했다. MIT의 두 번째 상대각과 이 앱의 두 번째 절대각을 구분한다. 정적 위치 예제는 공용 S07 구현과 자동 비교한다. 콘텐츠 구조 검증과 이 출처 대조를 전체 과학 fixture 검증 또는 사람·전문가 검토로 표시하지 않는다. Focus Experiment의 전체 `automated-verified`와 `human-reviewed`는 미완료다.

## 보존·미리보기·다음 단계

기존 app.html, physics/chaos/research/runtime/workers/validation, 공개 API, S03 상태·공유·라우트 계약, Lab 동작, 사용자 데이터, S01 baseline/golden은 보존한다. 기존 앱으로 복귀하려면 `/app.html`을 연다. 시작 복구 기준은 `acd7f869db182376b726e337606335eeabe0d541`이며 자동 브랜치 rollback은 수행하지 않는다.

`npm run dev` 후 다음 URL에서 확인한다.

- `http://127.0.0.1:5173/next.html#/learn`
- `http://127.0.0.1:5173/next.html#/learn/course-1`
- `http://127.0.0.1:5173/next.html#/learn/course-1/1.1`

S07 사용자 구조 승인은 이번 S08 요청으로 기록했다. S08 자체는 별도 사용자 review gate가 아니며 다음 유효 단계는 S09다. 과학 전문가 검토, 실제 screen reader 음성, 다른 OS/브라우저 범위와 전체 release 감사는 수행 범위에 포함되지 않는다. 기존 S01 보안 기준선의 npm high 2/moderate 2, CodeQL 32는 미해결이다. S08 시작 push에서 GitHub가 별도로 default-branch Dependabot high 5를 알렸으며 종전 보고의 high 4와 구분한다. 이번 단계는 취약점 해결이나 위험 수용을 뜻하지 않는다.

검증 수치와 commit/push 증거는 [S08 progress](stage-runs/S08-progress.md)와 최종 검증 JSON에 기록한다.
