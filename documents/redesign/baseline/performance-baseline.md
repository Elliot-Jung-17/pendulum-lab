# S01 legacy 앱 성능 기준선

실측 UTC: 2026-09-07T03:35:14.532Z. 대상: 기존 app.html, production build, 3개 독립 browser context.

## 재실행

```sh
node scripts/redesign/measure-performance.mjs
```

설치된 Vite/Playwright/Chromium만 사용한다. 스크립트는 npm run build의 세 명령을 순서대로 실행한 뒤 localhost preview를 시작한다. 사용자 브라우저 프로필은 읽지 않는다. 완료 또는 오류 시 임시 browser/server를 닫는다.
다른 benchmark/build/test를 멈춘 같은 장치에서 다시 측정한다. 자동 성능 합격선이나 개선 주장은 없으며 S30 비교의 출발점이다.

## 환경과 입력

- Git HEAD: `ccfd9ef0a57b8a6ac93ca83bf8db494b21dbcc5d`; branch: `codex/redesign`.
- src tree: `df4b29a69d82c03e9fd4dcca4c1394a96f8706b0`; 측정 시작/끝 application 입력 변경 검사: 통과.
- 제품: 10.36.0; Node v26.3.0; Playwright 1.61.1; Vite 8.1.4.
- OS: Windows_NT 10.0.26200; arch: x64; CPU: Intel(R) Core(TM) Ultra 7 256V; 논리 CPU: 8; RAM: 15.54 GiB.
- Browser: headless Chromium 149.0.7827.55; 1440×900 CSS px; DPR 1; locale en-US; research audience, 나머지 fresh storage.
- lockfile SHA-256: `c19b38e230056a32b42bc9189720031accb0c214ccee7fa7c590578936ba0d33`.
- 빌드 app.html SHA-256: `8ca66a348f445963a1ef48ba7b2ddaafaa482f2dff546e6b7a54aabfc06c8244`.
- 전체 설정, 런타임 품질/backend, 20개 개별 프레임 진단, raw 메모리와 RQA 결과는 performance-baseline.json에 보존한다.

## 측정 결과

| 지표 | 중앙값 | 최소–최대 | MAD (unscaled) |
|---|---:|---:|---:|
| 시작: navigation → engine time > 0 + main canvas 존재 (ms) | 253.900 | 238.900–377.400 | 15.000 |
| DOMContentLoaded (ms) | 233.700 | 219.300–340.700 | 14.400 |
| load (ms) | 253.200 | 238.400–376.100 | 14.800 |
| 앱 FPS (각 실행의 20회 진단 평균) | 59.946 | 59.922–60.073 | 0.023 |
| headless rAF callback/s | 60.002 | 60.002–60.003 | 0.000 |
| physics ms/frame (각 실행의 20회 평균) | 0.100 | 0.090–0.105 | 0.005 |
| render ms/frame (각 실행의 20회 평균) | 0.145 | 0.135–0.155 | 0.010 |
| 측정 종료 JS heap (MiB) | 5.234 | 4.464–5.547 | 0.312 |
| 5초 구간 JS heap 변화 (MiB) | -0.007 | -2.140–0.397 | 0.404 |
| RQA click → 결과/plot 완료 (ms) | 144.800 | 132.900–147.500 | 2.700 |

## 측정 정의와 한계

- 첫 샘플부터 fresh context/cache/storage를 사용하지만 browser process, OS 파일 cache와 build는 공유한다. 완전한 cold-device 또는 실제 네트워크 측정이 아니다.
- Startup은 navigation 시작부터 기존 engine이 진행하고 main canvas가 존재한 시점까지다. 전체 lazy 연구 UI 완료/첫 사용자 입력 가능 시간을 뜻하지 않는다. FCP와 load 타이밍은 raw 보고서에 별도로 남긴다.
- 앱 FPS는 기존 RenderScheduler의 최근 30 frame 이동 평균을 250ms마다 읽어 실행별 평균을 낸 값이다. 별도 rAF callback rate도 함께 기록하지만 headless 예약/실행 빈도이며 실제 디스플레이에 보인 frame 수가 아니다.
- CDP Runtime.getHeapUsage의 main renderer V8 usedSize를 사용한다. GC 강제 실행 없이 두 시점을 기록하므로 음수 변화도 가능하다. 전체 browser/worker/GPU/OS 메모리나 누수 검사를 대표하지 않는다.
- RQA 시간은 lazy tab mount 이후 UI click부터 기존 결과 DOM/plot 갱신까지의 end-to-end 시간이다. worker 전달, observable 생성, 계산, 결과 렌더를 포함하며 순수 알고리즘 시간이나 모든 분석의 비용을 대표하지 않는다.
- 3회 짧은 실행의 장치별 기준선이며 thermal/background task/브라우저 버전에 따른 변동이 있다. S30 회귀 한계와 실제 장치/모바일/장시간 검증은 별도다.
- S01 측정 스크립트/문서/fixture 작성 중의 dirty worktree를 명시하되 application 입력은 시작/끝 HEAD 일치를 검사했다. 원본 앱, 엔진, worker, API와 사용자 데이터는 변경하지 않았다.

RQA 경로: src/app/RqaTab.ts → src/runtime/ChaosClient.ts → src/workers/chaosJobHandlers.ts. 기존 UI 기본 dimension/delay 값을 읽고 target recurrence rate 0.1을 사용한다. 기존 worker 기본값은 dt=0.01, sampleEvery=20, samples=360, transientSteps=2000이며 uncertainty block 4개다. 각 결과에 worker 사용 여부를 나타내는 computing 상태를 기록한다.

검증: 3/3 실험에서 simulation time 증가, 유한한 FPS/DET, pageerror 0, console error 0. 성능 측정은 수치 정확성/누수 부재/실제 디스플레이 FPS 검증을 대신하지 않는다.
