# S06 자유 실험실 골격

## 확인할 화면

개발 서버 `npm run dev`에서 `http://127.0.0.1:5173/next.html#/lab`을 연다.

- 시스템 라이브러리: 한국어·영어·키워드 검색, 8개 패밀리, 최근 8개 선택, 즐겨찾기. catalog의 34개 시스템을 같은 selector로 제공한다.
- `#/lab/double` 또는 `#/lab/compound-double`: 시스템 선택 한 번으로 시험 실행 준비. 조건을 바꾸고 실행·일시정지·한 단계·처음으로·취소를 사용할 수 있다.
- 작업 공간·조건·분석·보관함·내보내기 패널은 화살표/Home/End와 Tab으로 조작한다. 좁은 화면은 한 패널만 표시한다.
- 분석은 해당 시스템과 계획 입력에 호환되는 도구만 선택한다. 검색과 상세 펼치기로 추가 도구·필요 입력·비용·해석 한계를 확인한다.
- 현재 시스템의 설정을 보관하고 다른 값을 시험한 뒤 복원할 수 있다. 최대 12개이며 초과 시 기존 항목을 버리지 않는다.
- 내보내기는 실제 `pendulum-lab-mock/v1` JSON 파일을 생성한다. `mode: mock`, `scientificResults: false`를 필수로 포함하며 canonical 실험 가져오기 파일이 아님을 명시한다.
- 작업 공간의 “오류 복구 체험”은 오류→동일 설정 재실행을 검증하는 공개 시험 기능이다.

## 계약과 단계 경계

S06은 timer 기반 mock adapter로 화면 상태 흐름을 검증한다. 물리 엔진·분석·worker를 호출하지 않고 물리 시간·궤적·에너지·과학적 결과를 생성하지 않는다. 실제 이중/복합진자 엔진 연결과 수치 검증은 S07이다.

이중/복합진자에는 기존 매개변수 이름과 SI 단위의 입력 fixture를 제공한다. 범위는 화면 검증용이며 실제 모델의 과학적 유효성을 보증하지 않는다. 다른 시스템의 물성 schema는 기존 API 참조 상태로 보존하고, 이번 단계에서 임의의 모델 입력을 추가하지 않는다. 연속계에는 관찰 시간, 이산/양자계에는 반복 수를 표시하며 내부 solver에는 범용 시간 간격이나 선택형 적분기를 노출하지 않는다.

`selectLabCapabilities`의 입력은 **planned mock inputs**이다. 실제 생성한 데이터가 아니므로 후속 adapter는 실제로 검증한 availableInputs로 기존 capability predicate를 호출해야 한다. 이번 JSON 출력만 제공하며 사용할 수 없는 CSV/figure 버튼은 만들지 않는다. 분석 계산, sweep/ensemble builder, 연구 provenance, 저장 migration은 각 후속 단계 범위다.

S03 공유 URL은 기존 parser/validator가 검증하고 읽기 전용 요약으로 표시한다. 공유 원본은 mock 기본값과 별도 보관해 export에 담으며, sourceExperiment를 실제로 실행·변환·복원했다고 표시하지 않는다.

시스템별 draft와 보관함, 최근/즐겨찾기는 Document 수명 동안 메모리에만 유지한다. 시스템을 바꾸어도 이전 시스템의 draft가 남지만 다른 시스템에 값을 자동 이식하지 않는다. 새로고침은 초기화하며 화면에서 이 사실을 안내한다. localStorage/sessionStorage/IndexedDB와 기존 사용자 데이터는 읽거나 쓰지 않는다.

## 상태와 수명

- empty: 시스템 선택 전 모델; 라이브러리의 빈 검색·최근·즐겨찾기 결과를 안내한다.
- ready: schema 기본값으로 즉시 시험 준비. 유효하지 않은 필드는 오류와 수정 안내를 표시하고 실행·보관·내보내기를 막는다.
- preparing/running: 준비 중 취소 가능; 중복 실행과 조건 변경을 막는다. 진행은 12회 시험 tick이며 물리 시간과 분리한다.
- paused: 같은 tick부터 계속하거나 한 단계씩 진행한다.
- cancelled: 예약 timer를 해제하고 generation guard로 늦은 응답을 무시한다. route 이탈도 취소한다.
- error/completed: 설정을 보존해 재시도·보관·내보내기를 허용한다.

입력 변경·시스템 변경·복원은 이전 시험 진행과 결과를 재사용하지 않는다. 보관 복원은 설정을 다시 가져와 tick 0부터 시작한다. route disposal은 UI 구독을 해제하고 실행을 취소한다. 다운로드 Blob URL은 지연 해제하며 화면을 떠날 때 잔여 URL과 timer를 정리한다.

## 구현 경로

- [selector](../../src/product/catalog/selectors.ts): 카탈로그 기반 검색·패밀리·호환성.
- [model](../../src/product/lab/model.ts), [schema](../../src/product/lab/schema.ts), [mock adapter](../../src/product/lab/mock-adapter.ts): 순수 상태/검증·timer lifecycle.
- [library](../../src/product/lab/library.ts), [workspace](../../src/product/lab/workspace.ts): 탐색, 페이지 단위 설정 유지, 실행·패널 조립.
- [inspector](../../src/product/lab/inspector.ts), [analysis dock](../../src/product/lab/analysis-dock.ts), [tray/export](../../src/product/lab/tray-export.ts): 설정·호환 도구·보관·파일 출력.
- [route view](../../src/product/app/views/lab.ts)는 기존 병렬 셸에 lazy 연결한다. [style](../../css/product/lab.css)은 next.html의 외부 stylesheet이며 Lab 클래스에만 적용한다.
- [unit tests](../../tests/product/lab/model.test.ts), [browser tests](../../e2e/redesign/lab-shell.spec.ts).
- [실행 기록](stage-runs/S06-progress.md), [검증 증거](stage-runs/S06-verification.json).

## 보존과 검토 한계

기존 app.html, physics/chaos/research/runtime/workers/validation, 공개 lib API, S01 기준선과 수치 fixture, S02/S03 계약·저장 형식, package/lockfile은 보존한다. 기존 앱은 독립 실행·복구 경로다. S06 이전 기준 commit은 `4933146027e703c8c88a8296b1de912e8ca7f01c`이다.

S06은 사용자 review gate가 아니다. 과학 콘텐츠를 공개하지 않으며 사람/전문가 검토를 주장하지 않는다. 브라우저 검증은 Windows Chromium desktop/mobile emulation이며 실제 screen reader 음성, 다른 OS·브라우저 시각 검증은 별도 범위다. 200% 검사는 CSS zoom 2와 640px reflow로 수행한다. 기존 보안 기준선은 해결되거나 새로 수용된 것이 아니다.
