# S01 수치 golden 기준선

## 기준과 재실행

- 제품: `10.36.0`
- 생산 코드 기준 commit: `ccfd9ef0a57b8a6ac93ca83bf8db494b21dbcc5d` (S01 CP0)
- 환경: Node `v26.3.0`, V8 `14.6.202.34-node.20`, Windows x64
- 입력, 단위, seed, 허용 오차, 캡처 시간과 13개 관련 생산 파일 SHA-256은 [고정 fixture](../../../tests/characterization/numerical-golden.fixture.json)에 있다.
- [실행 사례](../../../tests/characterization/numerical-golden-cases.ts)는 기존 생산 모듈을 호출한다. 운동방정식, 적분기, FFT, RQA, 사건 검출기를 다시 구현하지 않는다.

저장소 루트에서 다음 명령으로 검증한다. fixture를 변경하는 옵션은 없다.

```powershell
npm test -- tests/characterization/numerical-golden.test.ts
```

## 고정한 범위

| 대상 | 입력과 실행 | 고정 출력 |
|---|---|---|
| double | 서로 다른 질량·길이, 초기 각도·각속도, 감쇠 0, RK4, `dt=0.001 s`, 1,024 steps | 5시점의 상태, RHS, KE/PE/total과 전체 궤적의 최대 에너지 편차 |
| compound | double과 같은 물성·초기조건·시간 격자, 기존 uniform rod 모델 | 5시점의 상태, RHS, KE/PE/total과 최대 에너지 편차 |
| stochastic double | 감쇠 `0.08`, 두 각속도에 additive noise, Euler–Maruyama, `dt=0.001 s`, 256 steps, seed `20260907` | normal stream 첫 8개와 5시점 상태 |
| standard map | `theta=0.37`, `p=-0.23`, `K=0.7`, 16 iterations | 5시점의 wrapped angle·unwrapped momentum |
| FFT | double `theta1`에서 4 steps마다 256 samples, window 없음 | DC, 저주파, 중간, Nyquist, 음의 주파수를 포함한 11개 bin의 실수·허수 |
| RQA | double `theta1`에서 16 steps마다 64 samples, embedding 2, delay 2, epsilon `0.04 rad`, Theiler 2 | recurrence rate, determinism, laminarity, line length, divergence, entropy 등의 전체 결과 |
| Poincaré | double, `theta1=0` 양방향, `dt=0.002 s`, 최대 6초, 최초 4교차 | 교차 상태·시간·방향·root residual·bracket width·metadata |

확률계는 기존 `mulberry32` + cached Box–Muller sampler를 그대로 사용한다. 생산 코드의 RNG 버전 필드는 없으므로 구현 파일 hash와 commit으로 출처를 고정했다. deterministic 사례는 난수를 사용하지 않는다.

## 허용 오차와 별도 건전성 검사

일반 숫자는 `|actual - expected| <= 1e-11 + 1e-10 * |expected|`로 비교한다. Poincaré는 `2e-8 + 1e-9 * |expected|`로 비교한다. Float64와 수학 라이브러리의 작은 차이를 허용하면서 짧은 궤적의 상태·스케일·부호·순서 변화는 탐지한다. 모든 key, 배열 길이, 비수치 값도 검사하고 NaN/Infinity는 거부한다.

golden 일치와 별도로 다음을 확인한다.

- 보존계 두 모델의 최대 절대 에너지 편차 `< 1e-8 J`; 실측 double `1.1338414651618223e-9 J`, compound `1.763901025242376e-9 J`.
- 두 모델의 정지 평형 유지와 0 질량 거부.
- 같은 seed의 비트 단위 재실행 일치, 다른 seed의 최종 상태 차이.
- diffusion 0에서 기존 Euler 결과와 일치하며 random stream을 소비하지 않음.
- standard map의 angle wrapping, 0 kick에서 unwrapped momentum 보존.
- FFT의 해석적으로 알려진 impulse 결과와 inverse 정규화.
- Poincaré의 증가하는 교차 시간, 각속도와 교차 방향 일치, bracket width `<= 1e-10 s`, section residual `< 1e-8 rad`.

`rootTol`은 `events.ts`와 `eventLocator.ts`에서 **시간 bracket 폭**이다. 각도 residual에 같은 숫자를 적용한 최초 검사 1개가 실패하여 생산 계약을 읽고 검사 단위를 수정했다. 실측 최대 각도 residual은 약 `2.17e-10 rad`다. 생산 코드나 golden 예상값을 바꾸지 않았다.

## 검증 결과와 한계

- targeted Vitest: **1파일·13개 테스트 통과**.
- `tsc --noEmit`: 통과.
- 신규 TypeScript 파일 ESLint: 경고·오류 0.
- 신규 파일 Prettier: 적용 완료.
- 기존 생산 코드·공개 API·저장 데이터·기존 테스트: 변경 없음.

이 fixture는 기존 구현과의 **행동 동등성 기준**이며 독립적인 과학 정답을 증명하지 않는다. 단기 네 가지 시스템과 세 분석의 대표 사례이며 전체 모델·적분기·worker·장시간 카오스·GPU/WASM 결과를 포괄하지 않는다. 기존 수치·독립 검증 테스트는 계속 병행한다. S07 및 후속 시스템 단계에서 adapter를 연결할 때 같은 입력과 출력 계약으로 범위를 확장한다.

예상값 변경 전에는 원인, 기존 계약 영향, 독립 검증 근거와 변경 diff를 기록한다. 실패를 없애기 위한 일괄 재캡처나 허용 오차 완화는 하지 않는다. 이번 캡처는 새 파일 생성 시 `wx` 모드로 한 번 수행했으며 재실행 명령은 fixture를 쓰지 않는다. provenance hash는 당시 파일 바이트에 대한 기록이고, 향후 검증에서 원본 파일이 영원히 같은 hash여야 한다는 요구는 아니다.
