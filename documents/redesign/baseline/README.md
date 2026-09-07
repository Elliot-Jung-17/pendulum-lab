# S01 — 재설계 기준선

현재 앱의 동작과 기능을 이후 단계에서 비교할 수 있도록 고정했다. 제품/UI를 바꾸는 단계가 아니다. 원본 제품 커밋은 `222fe192b694138e0f771074c2ec35ef56b19377`, 측정 시작 HEAD는 `ccfd9ef0a57b8a6ac93ca83bf8db494b21dbcc5d`다.

## 산출물

- [기능 inventory](inventory.md)와 [전체 목록](inventory.json): 기존 기능과 기계적으로 발견한 항목을 구분하고 소유 파일·향후 단계·import 참조를 검사한다. S02 제품 registry와 S28 parity의 입력이다.
- [수치 설명](numerical-golden.md), [fixture](../../../tests/characterization/numerical-golden.fixture.json), [재실행 검사](../../../tests/characterization/numerical-golden.test.ts): double/compound, seeded Langevin, standard map, FFT/RQA/Poincaré의 현재 공개 엔진 결과를 고정했다. 고정 입력과 수치 오차를 fixture에 명시한다.
- [성능 보고서](performance-baseline.md)와 [원자료](performance-baseline.json): production 앱의 시작/FPS/JS heap/RQA 경로를 같은 장치에서 3회 측정했다.
- [보안 보고서](security.md)와 [snapshot](security-snapshot.json): lockfile hash, 공식 npm audit, GitHub Dependabot/CodeQL/secret scanning, redacted 로컬 패턴 검사를 기록했다.
- [최종 검증 결과](verification.json): 전체 232개 파일·1,670개 통과, 기존 테스트 보존, 원본 Git 객체 비교와 실행 명령을 기록했다.
- [진행 및 원격 기록](../stage-runs/S01-progress.md): checkpoint 검증·커밋·push 증거와 최종 상태.

## 테스트 기준과 해석

인벤토리는 883개 파일, 의미 기능 118개, 기계 관찰 6,825개, relative import 2,548개를 기록했다. 소유/향후 단계/선언 누락과 깨진 정적 import·named binding은 0개다. 파일 112개는 명시적 기능 소유, 771개는 모듈 계열별 이관 책임 배정이다. GPU 검증·benchmark 도구의 계산된 import 12개는 별도 목록으로 남겼으며 정적 해석 성공으로 표시하지 않았다.

변경 전 `npm test -- --reporter=json --outputFile=tmp/S01-initial-vitest.json`은 **229개 파일, 1,647개 테스트, 실패 0**이었다. 실행 계획의 출발점과 차이가 없다. 이후 추가된 S01 검사는 기존 테스트 개수를 대체하지 않고 합산한다. `numTotalTestSuites`는 Vitest의 중첩 suite 집계이므로 파일 개수로 쓰지 않고 `testResults.length`를 사용한다.

구현 checkpoint의 관련 검사는 `npm test -- tests/characterization` **3개 파일·23개 통과**(inventory 7, golden 13, secret scan 3), typecheck 통과다. 문서 fence/JSON/local link 검사와 대상 TS ESLint도 통과했다.

구현 `1d6191a`의 원격 push 확인 후 전체 `npm test`를 다시 실행해 **232개 파일·1,670개 테스트, 실패/보류 0**을 확인했다. 기존 229개 테스트 파일은 변경되지 않았고 기존 테스트 식별자 전부가 최종 결과에 유지된다. 계획 검사·inventory 재현 검사·typecheck도 통과했다.

수치 fixture는 현재 구현을 보존하는 characterization이다. 새로운 독립 물리 증명이나 전문가 검토가 아니다. 기존 수치 테스트와 함께 실행하며, 실패를 통과시키기 위한 golden 자동 갱신 모드는 제공하지 않는다.

## 성능 기준

Windows 11 계열 build 26200 / Intel Core Ultra 7 256V / 8 logical CPU / RAM 15.54 GiB / Node 26.3.0 / headless Chromium 149.0.7827.55. 1440×900, DPR 1, research audience, fresh storage, double/RK4 설정에서 측정했다.

| 지표 | 3회 중앙값 |
|---|---:|
| navigation → engine time 증가 + canvas 존재 | 253.9 ms |
| 앱 진단 FPS | 59.946 |
| main renderer V8 heap | 5.234 MiB |
| RQA UI click → worker 결과/plot | 144.8 ms |

headless FPS는 실제 디스플레이 프레임 수가 아니며 heap은 전체 browser/worker/GPU 메모리가 아니다. 3회 측정의 분산과 자세한 한계는 성능 보고서에 있다. S30에서 같은 절차로 비교한다.

## 재실행과 보존

```powershell
npm run redesign:check
npm run redesign:inventory:check
npm run redesign:golden
npm run redesign:secrets
npm run typecheck
npm test
```

성능을 다시 측정하려면 production 입력 파일이 HEAD와 일치하고 다른 무거운 작업이 없는 상태에서 `npm run redesign:performance`를 실행한다. 해당 명령은 production build와 두 성능 보고서를 새로 생성한다. 이전 기준선을 비교하려면 기존 보고서를 별도로 보존한다. 보안 조회는 보안 문서의 명령과 기준 snapshot을 비교한다.

S01은 기존 `src/`, `app.html`, CSS, worker, validation, API 및 저장/공유/import/export 구현, 기존 테스트와 lockfile을 변경하지 않았다. package.json에는 재실행용 script만 추가했다. 사용자 데이터나 브라우저 프로필은 읽거나 변환하지 않았다.

## 검토와 남은 위험

- 사용자 review gate: S01 해당 없음. 사람/전문가 검토 완료를 기록하지 않았다.
- 보안: 공식 npm High 2개·Moderate 2개 패키지, 기존 CodeQL 32건 미해결. 이는 S01 기록 범위이며 S30 해결/판정 게이트는 별도다. npm의 초기 0건 응답은 모순되어 증거에서 제외했다.
- inventory의 기계적 추출은 기능 동등성 인증이 아니다. S02에서 typed catalog 양방향 coverage, S28에서 실제 UI 접근·결과·migration을 검증해야 한다.
- 복구: 기존 앱과 엔진은 그대로 사용한다. 기준 제품 커밋 `222fe19`와 원격 S01 checkpoint를 비교 기준으로 유지한다. 새 재설계 단계나 cutover는 실행하지 않았다.
