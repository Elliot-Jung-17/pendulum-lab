# S04 병렬 앱 셸

## 실행과 범위

`npm run dev`가 출력하는 주소에서 `/next.html#/learn` 또는 `/next.html#/lab`을 연다. `npm run build`는 기존 `app.html`, `reviewer.html`과 새 `next.html`을 함께 생성한다. production 확인은 `npm run preview`로 한다. 상대 자산 경로와 hash를 사용하므로 정적 호스팅의 하위 경로에서도 진입점을 유지한다.

이번 단계의 결과는 독립적인 진입점, 공통 헤더, 공간별 안내 화면, 브라우저 탐색과 오류 복구다. Learn 과정/단원과 Lab 시스템 실행 도구는 이후 단계의 범위다. 예약된 상세 주소는 유효한 주소임을 구별하되 현재 이용 가능 상태를 정직하게 안내하고 실제 기존 앱 링크를 제공한다. 공유 형식 검증은 계산 실행 또는 기존 앱으로 설정 전달을 의미하지 않는다.

## 경로와 상태

| 주소/상태 | 동작 |
|---|---|
| `next.html`의 빈 hash | `replaceState`로 `#/learn`을 설정하며 불필요한 뒤로가기 항목을 만들지 않는다. |
| `#/learn`, `#/lab` | 각 공간의 목적과 기존 앱 진입, 두 공간 사이 이동을 제공한다. |
| `#/learn/{courseId}`, `#/learn/{courseId}/{unitId}` | S03에서 예약한 ID인지 확인하고 아직 제공되지 않는 내용임을 안내한다. |
| `#/lab/{systemId}` | 카탈로그의 실제 시스템명·설명과 새 실행 화면의 이용 가능 상태를 표시한다. |
| `#/lab/{systemId}?state={token}` | S03 공유 envelope·checksum·버전·시스템 일치를 검증한 뒤 모델 버전과 분석 설정 개수만 요약한다. |
| 알 수 없는 주소·손상된 공유 | 원래 URL을 유지한다. 상세 token/오류 원문을 화면에 노출하지 않으며 정상 공간으로 이동할 수 있다. |
| lazy loading | 공통 헤더를 유지하고 읽기 상태와 취소 버튼을 제공한다. |
| loading 취소 | 현재 화면 요청의 결과 적용을 취소한다. 늦게 끝난 import는 표시하지 않는다. 브라우저의 모듈 다운로드 자체를 중단했다고 주장하지 않는다. |
| bootstrap/initialization 오류 | 앱 모듈과 독립적인 오류 화면, 같은 주소 다시 시도, 기존 앱 링크를 제공한다. |
| chunk/render 오류 | 공통 헤더와 복구 링크를 유지하고 같은 주소 다시 시도 또는 다른 공간 이동을 제공한다. |

직접 주소 열기, 새로고침, 뒤로/앞으로 이동은 같은 route/share 계약을 사용한다. 본문 바로가기 링크는 hash를 바꾸지 않고 본문에 초점을 옮긴다. 페이지를 표시하면 제목·활성 navigation·본문 초점을 함께 갱신한다. 기본 오류 메시지는 한국어이며 내부 예외 문자열이나 공유 token은 DOM에 삽입하지 않는다.

## 구현 경계

- [next.html](../../next.html)은 JavaScript가 시작되지 않아도 읽을 수 있는 기본 안내와 기존 앱 링크를 가진다. CSS는 외부 link로 로드하여 개발 서버의 엄격한 CSP에서도 인라인 style 삽입이 필요하지 않다.
- [entry.ts](../../src/product/app/entry.ts)와 [bootstrap.ts](../../src/product/app/bootstrap.ts)는 application chunk의 import/초기화 실패를 처리한다.
- [application.ts](../../src/product/app/application.ts)는 공통 셸, browser port, 제목/초점/상태와 전역 오류 경계를 연결한다. Learn과 Lab 모듈은 별도 dynamic import다.
- [router.ts](../../src/product/app/router.ts)는 S03 [resolveProductRoute](../../src/product/persistence/share-route.ts)를 재사용한다. 세대 번호로 오래된 비동기 완료/실패를 무시하고 listener와 view 정리를 소유한다.
- [shell.ts](../../src/product/app/shell.ts), [learn.ts](../../src/product/app/views/learn.ts), [lab.ts](../../src/product/app/views/lab.ts)는 text-only DOM을 생성한다. [shell.css](../../src/product/app/shell.css)는 이 진입점의 기본 배치에 한정한다. S05 공용 디자인 시스템이나 S06 시스템 라이브러리는 구현하지 않았다.
- 오류를 다시 시도할 때 전체 문서를 같은 URL로 새로고침하여 브라우저가 기억하는 실패한 module import도 다시 요청할 수 있게 한다. 설정이나 local/session storage를 쓰지 않는다.

## 보존과 검증

기존 `app.html`, 엔진, 분석, worker, 공개 API, 저장/공유/import/export와 dependency lockfile은 변경하지 않는다. 새 진입점은 기존 bootstrap이나 실행 엔진을 로드하지 않는다. PWA/standalone 등록·전환 및 저장 migration은 적용하지 않는다. 일반 build의 service-worker 자산 목록·revision은 기존 빌드 규칙에 따라 새 출력 자산도 포함한다.

S01 인벤토리 원본과 numerical golden은 재생성하지 않는다. [inventory.ts](../../scripts/redesign/inventory.ts)는 `vite.config.ts`의 기존 app/reviewer 사이에 정확히 `next: 'next.html'`을 추가한 block과 Vite preload helper만 별도 chunk로 지정하는 정확한 한 줄을 legacy 비교에서 투영해 제외한다. 나머지 build byte와 AST 관찰은 유지하고 기존/새 entry 대상, helper 이름/조건, 다른 build 옵션 변경은 실패한다. 이 예외와 실제 동시 build는 [build-scope.test.ts](../../tests/product/app/build-scope.test.ts)에서 검증한다.

preload helper 분리는 production 관찰에 근거한다. 자동 chunk 배정에 두면 helper가 기존 연구 탭에 포함되어 새 셸도 물리/카오스/연구 bundle을 요청했다. 해당 Vite 가상 모듈만 `preload-helper`로 분리하여 이 연결을 제거했으며, Playwright가 production의 실제 network 요청을 검사한다. 기존 엔진 source나 호출 방식은 바꾸지 않는다.

검증 명령:

```text
npm run redesign:check
npm run redesign:catalog:check
npm run redesign:inventory:check
npx vitest run tests/product/app tests/product/contracts tests/product/catalog tests/characterization
npm run typecheck
npm run build
npx playwright test e2e/redesign/shell.spec.ts --project=chromium --project=mobile-chrome
```

production smoke는 `PLAYWRIGHT_USE_PREVIEW=1`과 충돌하지 않는 `PLAYWRIGHT_PORT`를 설정해 같은 Playwright spec을 실행한다. [shell.spec.ts](../../e2e/redesign/shell.spec.ts)는 실제 network 차단/지연과 테스트 응답 교체로 오류·취소·경합을 검증하며 제품에 테스트용 fault hook을 넣지 않는다. WCAG axe 검사에서 contrast 검사를 끄지 않는다. 결과 집계는 [S04-progress.md](stage-runs/S04-progress.md)와 [S04-verification.json](stage-runs/S04-verification.json)에 기록한다.

## 남은 범위와 복구

S04는 사람 검토 게이트가 아니며 교육 콘텐츠나 과학적 검토 완료를 주장하지 않는다. 기존 S01 보안 기준선의 npm high 2/moderate 2, CodeQL 32건과 GitHub default-branch Dependabot high 4건은 미해결 상태로 유지한다. 이 단계에서 재감사·업그레이드·위험 수용을 하지 않았다.

신규 화면에 문제가 있으면 같은 배포의 `/app.html`을 계속 이용한다. 코드 복구 기준은 S04 직전 `543bfc8`이며 branch reset이나 강제 push 없이 별도 검토된 되돌림 커밋을 사용할 수 있다. S05는 최종 S04 status commit이 원격에 확인된 뒤 사용자가 요청해야 시작한다.
