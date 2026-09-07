# S07 이중·복합진자 실험실

## 미리보기와 사용자 검토

`npm run dev` 후 다음 경로를 연다. 이미 실행 중인 서버의 포트가 다르면 그 포트를 사용한다.

- `http://127.0.0.1:5173/next.html#/lab`: 시스템 목록.
- `http://127.0.0.1:5173/next.html#/lab/double`: 점질량 이중진자.
- `http://127.0.0.1:5173/next.html#/lab/compound-double`: 균일 막대 복합진자.
- `http://127.0.0.1:5173/app.html`: 보존된 기존 앱.

S07은 첫 사용자 review checkpoint다. 다음 항목을 확인한 뒤 “8단계 실행해줘.”라고 요청하면 핵심 실험실 구조를 승인한 것으로 기록한다. 이 기록 자체는 사람이나 물리 전문가의 검토 완료를 뜻하지 않는다.

- [ ] 시스템 목록에서 두 모델을 각각 선택하고 실행·일시정지·한 단계·처음으로를 사용한다. 자세, 물리 시간, 각속도와 에너지가 함께 변한다.
- [ ] 조건 패널의 질량·길이·각도·적분기와 상세 조건의 감쇠·각속도·시간 간격을 바꾼다. 잘못된 값은 실행 전에 수정 안내가 나타난다.
- [ ] 분석 패널에서 상태/시간·에너지·위상공간을 보고, Poincaré와 최대 Lyapunov를 계산한다. 긴 분석을 취소하고 다시 실행한다.
- [ ] 보관함의 “현재 설정 저장” 뒤 새로고침한다. 설정이 복원되며 계산 시간은 초기 시각부터 시작한다. 비교용 “현재 설정 보관”도 복원해 본다.
- [ ] 상태 JSON·궤적 CSV·그림 SVG를 내려받고, JSON을 다시 가져온다. 모바일 또는 좁은 화면에서 조건 편집과 실행이 가능한지 확인한다.

## 실제 동작과 모델 범위

두 시스템은 기존 `physics/double`, `physics/compoundDouble`의 운동방정식·에너지와 기존 RK4/RK2/Euler를 사용한다. 별도의 교육용 운동방정식을 만들지 않는다. 복합진자는 균일한 두 막대이며 임의의 질량분포 편집은 제공하지 않는다. 아래 수직선을 기준으로 하는 절대각을 rad로 표시하고, 감지 않은 각도를 저장한다. Cartesian 위치는 m, 양의 y는 위쪽이며 그림 투영에서만 화면 좌표로 바꾼다.

조건은 어댑터의 공통 schema로 검증한다. 질량·길이는 0.001–1000 kg/m, 중력과 힌지 감쇠계수는 0–1000 범위다. 감쇠계수의 단위는 kg·m²/s이고 일반적인 각속도 감쇠율 s⁻¹과 다르다. 시간 간격은 10⁻⁶–0.05 s, 관찰 시간은 최대 300 s, 실행과 분석에는 각각 100,000 step 한도가 있다. 범위 안에서도 수치적 불안정성이 생길 수 있으므로 비유한 계산은 마지막 유효 상태를 보존한 채 멈춘다. Euler와 큰 시간 간격, 감쇠의 에너지 해석에 대한 안내를 표시한다.

애니메이션은 한 프레임에 최대 200 step을 처리한다. 설정 변경은 이전 실행을 초기화한다. 일시정지는 같은 상태에서 재개하며 취소 후 새 실행은 초기조건에서 시작한다. 화면 이동은 실행과 분석을 취소하고 늦은 응답은 무시한다. 입력·진행 중 실패는 다시 실행할 수 있다.

시스템 목록과 Learn에서는 계산 코드를 로드하지 않는다. 검증된 double/compound 시스템 route에 진입할 때만 core-lab chunk를 가져오며, 긴 분석 worker는 분석 버튼을 누를 때 생성한다. 원래 셸의 지연 로딩·저장 보존 검사를 그대로 유지한다.

다른 32개 시스템은 S06의 명시적 모의 실행을 유지한다. 이 단계에서 이후 시스템 연결이나 Learn 콘텐츠를 구현하지 않는다. 시스템·분석·적분기의 전체 catalog 정의 수와 기존 앱의 접근 경로는 유지한다.

## 분석과 과학적 해석

- 상태/시간·에너지·위상공간은 현재 실행의 실제 기록 표본을 투영한다. 위상공간은 각도와 각속도 좌표로 표시하며 canonical momentum으로 표기하지 않는다.
- Poincaré는 현재 초기조건에서 기존 RK4 사건 검출기를 별도 실행한다. 애니메이션의 적분기와 다를 수 있음을 명시한다. 좌표·각도·교차 방향·제외 교차 수·최대 점 수를 설정하고, 교차점과 근 잔차를 제공한다. 교차가 없는 경우 원인과 조정 방법을 표시한다. 근 찾기 작업량은 데이터에 따라 달라지므로 진행률 대신 실제 운동방정식 평가 수를 표시한다.
- 최대 Lyapunov는 기존 두 궤적 추정기를 선택한 적분기로 실행한다. 분석 기간·과도 구간·재규격화 간격·교란 seed를 저장한다. 유한시간 추정치, 수렴 이력, 표준오차와 block SE, 근사 CI를 표시한다. 짧은 기간의 양수 추정치만으로 카오스를 확정할 수 없으며, 좌표 스케일과 적분오차·통계적 불확실성을 구분한다.
- 긴 계산은 전용 worker에서 수행한다. 취소는 worker를 종료하며 부분 결과를 최종값으로 표시하지 않는다. 시작 실패·실행 실패·응답 오류·늦은 결과를 처리한다. UI에 없는 고급 분석을 실행했다고 주장하지 않는다.

## 저장·공유·내보내기 계약

상태 파일은 S03의 `pendulum-experiment/v1` 계약이며 모델 버전 `planar-model-v1`, 적분기 버전 `planar-integrator-v1`을 사용한다. SI 값, 초기조건, 시작 시각, 기간, 간격, sampleEvery, 분석 설정 및 입력에 존재하는 seed/provenance를 보존한다. 이는 초기조건에서 다시 실행하는 구성 파일이고 중단된 solver의 정확한 continuation snapshot은 아니다.

- 명시적 저장 버튼만 새 `pendulum-product/planar/v1/{systemId}` localStorage 키에 쓴다. 기존 앱의 키는 읽거나 수정하지 않는다. 저장 실패는 JSON 다운로드로 복구할 수 있다. 손상된 새 저장값은 원본을 보존하고 기본값 표시 사실을 안내한다.
- 비교용 보관함은 시스템별 최대 12개이며 현재 Document에서만 유지한다. 한도 초과로 기존 항목을 자동 삭제하지 않는다.
- 공유 링크는 기존 S03 codec을 사용한다. 실행할 수 없는 모델 버전·단위·옵션은 원본을 보존하고 명시적으로 거부한다. 다른 시스템 파일은 자동 이식하지 않는다.
- JSON 가져오기는 최대 200 KB이며 기존 안전한 JSON/schema parser를 통과한 뒤에만 적용한다. 잘못된 파일은 현재 설정과 원본을 보존한다.
- CSV는 고정된 SI header와 유한한 숫자만 포함한다. 요청한 sampleEvery 간격과 초기/최종 표본을 기록한다. 그림은 상태/시간 SVG이며 축·단위·설정 metadata를 포함한다. 그림만 약 600점/선으로 축약한다. 분석의 상세 수치는 별도 결과 펼치기에서 읽을 수 있다.

## 구현과 검증 증거

- [물리 adapter](../../src/product/adapters/physics/planar.ts), [schema](../../src/product/adapters/physics/planar-schema.ts).
- [분석 adapter](../../src/product/adapters/analysis/planar.ts), [worker client](../../src/product/adapters/analysis/client.ts).
- [Lab 화면](../../src/product/lab/views/core-workspace.ts), [실행 상태](../../src/product/lab/views/core-model.ts), [저장 codec](../../src/product/lab/views/core-storage.ts).
- [브라우저 여정](../../e2e/redesign/core-pendulum.spec.ts), [진행 기록](stage-runs/S07-progress.md), [검증 보고서](stage-runs/S07-verification.json).

기존 S06 double 화면의 두 시각 기준은 과거 증거로 보존한다. 현재 검사는 새 S07 실제 화면과 S06 모의 spherical 화면을 구분한다. 시스템 목록의 설명은 실제 두 모델의 제공 상태에 맞게 갱신한다. S05 gallery 기준은 변경하지 않는다.

## 보존과 한계

`app.html`, physics/chaos/research/runtime/workers/validation, 공개 lib API, S03 contracts/persistence, 기존 데이터, package/lockfile, S01 baseline과 golden은 변경하지 않는다. S07 진입점은 계속 `next.html`이며 기존 앱으로 즉시 돌아갈 수 있다. S07 전 저장소 복구 기준은 `1cd55d14dfe8f837b7eef747307242c383116287`이다. 브랜치 rollback/merge는 별도 요청 없이 수행하지 않는다.

자동 브라우저 검증 범위는 Windows Chromium 데스크톱·모바일 에뮬레이션과 320px/CSS zoom 200%다. 실제 screen reader 음성, 다른 OS·브라우저, 사람/전문가 검토는 수행하지 않았다. 기존 S01 npm high 2/moderate 2, CodeQL 32와 별도 default-branch Dependabot high 4는 미해결 기준선으로 남으며 이번 단계가 위험 수용을 의미하지 않는다.
