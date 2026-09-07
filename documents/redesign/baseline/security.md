# S01 보안 기준선

관측일: 2026-09-07. 제품 기준 `222fe192b694138e0f771074c2ec35ef56b19377`, 실행 기준 `ccfd9ef0a57b8a6ac93ca83bf8db494b21dbcc5d`.
이 문서는 S01의 기존 위험 기록이다. 보안 결함 해결, 위험 수용 승인, S30 보안 게이트 통과를 뜻하지 않는다. dependency/lockfile/제품 코드 변경은 없다.

## Dependency audit

- `npm audit --package-lock-only --json --registry=https://registry.npmjs.org`: exit 1, 취약 패키지 High 2 / Moderate 2 / Critical 0.
- npm 감사의 개수는 패키지 기준이다. 직접 advisory는 8건이며 `typed-rest-client`는 `qs`의 간접 영향이다.
- sandbox 내 첫 감사는 exit 0과 0건을 반환했지만, 확장 실행의 공식 registry 응답과 모순된다. 첫 결과도 `security-snapshot.json`에 남겼으며 **0건 결과는 보안 판단 근거에서 제외**했다. 차이의 정확한 원인은 확인하지 못했다.
- lockfile v3의 dependency 448개 항목에 integrity가 있다. Python `requirements.lock`도 SHA-256을 고정하나 이번 npm 감사는 Python 의존성을 검사하지 않는다.

| 패키지 / 고정 버전 | 위험 | 실제 의존 경로와 S01 판단 | 후속 조치 |
|---|---|---|---|
| fast-uri 3.1.5 | High, URI 정규화 관련 advisory 4개 | Stryker → ajv의 개발 의존성. npm override가 3.1.5를 고정한다. 브라우저 제품 코드에서 직접 import하지 않는다고 해서 개발 환경 위험이 사라지는 것은 아니다. | S30 전 override 3.1.6 이상 전환을 별도 검증; 현재는 미해결 |
| browserslist 4.28.5 | High, 메모리 증가 및 custom stats 처리 advisory 2개 | Stryker → Babel의 개발 의존성. 신뢰되지 않은 query/stats를 처리할 때의 노출을 검토해야 한다. | S30 전 advisory 범위를 벗어난 버전 및 mutation/build 회귀 검사; 현재는 미해결 |
| qs 6.15.3 | Moderate, 입력 처리 DoS advisory 2개 | Stryker → typed-rest-client의 개발 의존성. override `^6.15.3`과 실제 lock 버전을 구분한다. | S30 전 6.16.0 이상 및 관련 도구 검증; 현재는 미해결 |
| typed-rest-client 2.3.1 | Moderate, qs 영향 | Stryker 개발 의존 경로의 간접 경고 | qs 수정 후 감사 재확인; 현재는 미해결 |

판정 근거는 공식 audit snapshot의 URL/영향 범위와 `npm explain` 의존 경로다. S01에서는 자동 upgrade를 하지 않는다. 현재 완화 경계는 로컬 개발 도구와 기존 입력 validation이며, 적대적 입력에 대한 실제 악용 가능성을 검증 완료했다고 주장하지 않는다. 릴리스 전 S30에서 해결 또는 영향·완화·사용자 승인 기록이 필요하다.

## GitHub 경고

- Dependabot API: 열린 경고 4건, 전부 High `fast-uri`; #19, #20, #22, #23. 패치 버전은 3.1.6. 기본 브랜치 경고이므로 npm 패키지 개수와 합산하지 않는다.
- CodeQL API: 열린 경고 32건(High 18, Medium 14), 28개 파일. 가장 최근 instance는 모두 `master`의 `222fe19`에 연결된다. 새 S01 CodeQL 실행 결과가 아니며, 현재 코드는 해당 기준에서 보존되어 있다.
- CodeQL의 rule, 소유 파일, 줄, 원본 커밋과 경고 URL은 `security-snapshot.json`에 전수 보존했다. 경고는 **미해결·추가 분석 필요**이며 false positive로 일괄 처리하지 않았다.
- 후속 검토 소유: `scripts/`의 빌드·출판·sanitization은 S30, `src/physics/`와 `src/chaos/`의 동적 property는 해당 시스템/분석 연결 단계 및 S30, figure/research export는 S24, worker 메시지 및 PWA는 해당 adapter 단계와 S30. 실제 수정은 해당 단계에서 characterization과 입력 공격 fixture를 먼저 검토한다.
- GitHub secret-scanning API: 열린 경고 0건(exit 0). 이는 GitHub에서 현재 열린 경고가 없다는 뜻이며 전체 Git history의 독립 재검사를 뜻하지 않는다. 조회 시 비밀 값은 저장하지 않았다.

## 로컬 secret scan

`scripts/redesign/secret-scan.ts`는 Git 추적 파일만 읽고, 알려진 키/token/URL credential 패턴의 경로·줄·규칙만 반환한다. 비밀 값이나 snippet을 출력하지 않는다. 결과의 정확한 파일 수, 제외된 binary 파일, rules, source commit과 파일 내용 digest는 `security-snapshot.json`에 있다. 초기 스캔은 추적 파일 1,097개 중 텍스트 1,067개, binary 30개, 탐지 0건이다.

검사 제한: entropy 및 임의 password 탐지, Git history, ignored/untracked 파일, binary 내부, 외부 서비스의 비밀 존재는 판정하지 않는다. 따라서 “비밀정보 없음”으로 확대 해석하지 않는다.

## 재실행

현재 저장소에서 다음 읽기 명령을 사용한다. 출력은 필요 시 `tmp/` 등 별도 경로로 저장하고 기준 snapshot을 자동 덮어쓰지 않는다.

```powershell
npm audit --package-lock-only --json --registry=https://registry.npmjs.org
npm run redesign:secrets
gh api --paginate 'repos/elliotjung/pendulum-lab/dependabot/alerts?state=open' --jq '.[] | {number,state,dependency,security_advisory,security_vulnerability,html_url}'
gh api --paginate 'repos/elliotjung/pendulum-lab/code-scanning/alerts?state=open' --jq '.[] | {number,state,rule,most_recent_instance,html_url}'
gh api --paginate 'repos/elliotjung/pendulum-lab/secret-scanning/alerts?state=open' --jq '.[] | {number,state,secret_type,html_url}'
```

네트워크/권한 오류가 발생하면 미확인으로 기록한다. npm exit 1은 취약점 발견이며, JSON 오류 또는 접근 실패와 구분해야 한다. S01 필수 게이트는 기존 위험의 기록이며 S30의 해결 게이트를 대신하지 않는다.
