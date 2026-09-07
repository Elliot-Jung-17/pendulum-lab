# S05 디자인 시스템

## 열기

`npm run dev` 후 `/next.html?gallery=components`를 연다. 새 앱 하단의 **컴포넌트 갤러리** 링크도 같은 화면으로 이동한다. production build에도 같은 주소가 포함된다.

갤러리의 예제는 버튼, 값 검증, 탭, 알림, 진행률, 대화상자, 패널 배치의 실제 동작을 보여 준다. 엔진을 실행하거나 실험·메모·테마를 저장하지 않는다. 기존 `/next.html#/learn`, `/next.html#/lab`과 S03의 canonical hash/share 계약은 유지된다. 갤러리는 별도 lazy chunk이며 정상 Learn/Lab 진입 때 다운로드하지 않는다.

## 구성과 사용 계약

- [tokens.css](../../css/product/tokens.css): 의미별 색상, 글꼴/크기/행간/굵기, 간격, 모서리, 최소 조작 크기, focus, motion. light/dark/system의 모든 색상 키를 갖는다.
- [components.css](../../css/product/components.css): 기본 컴포넌트와 갤러리 배치. 새 진입점에서만 외부 stylesheet로 로드한다.
- [primitives.ts](../../src/product/design-system/primitives.ts): button, input, section, card, progress, toast.
- [quantity.ts](../../src/product/design-system/quantity.ts): SI canonical scalar 입력과 오류 모델. S03 quantity validator를 재사용한다.
- [tabs.ts](../../src/product/design-system/tabs.ts), [dialog.ts](../../src/product/design-system/dialog.ts), [split-panel.ts](../../src/product/design-system/split-panel.ts): 복합 상호작용과 정리 함수.
- [theme.ts](../../src/product/design-system/theme.ts): 현재 문서의 `data-theme`만 변경하는 테마 선택기. 기본값은 light, system은 기기 변경을 CSS로 따른다.
- [gallery.ts](../../src/product/design-system/gallery.ts): 위 함수를 사용하는 실행 가능한 예제.

모든 생성 함수는 소유 `Document`를 받으며 텍스트를 DOM의 `textContent`로 배치한다. HTML 문자열, 임의 markup, engine import, storage 접근을 요구하지 않는다. 입력/컨테이너/탭/대화상자/진행률/패널의 `id`는 호출자가 문서 전체에서 유일하게 제공한다.

| 생성 함수 | 반환/주요 동작 | 호출자 책임 |
|---|---|---|
| `createButton` | native button, label/variant/disabled/type/onClick | 실행 상태와 사용할 수 없는 이유 제공 |
| `createInput` | element/input/setError | 도메인 검증 후 setError; 오류 시 저장·실행 차단 |
| `createQuantity` | element/input/read/setValue | label/symbol/meaning/unit/min/max/defaultValue 제공 |
| `createSection`, `createCard` | element/body | 적절한 headingLevel, body에 실제 콘텐츠 append |
| `createTabs` | element/select/selectedId/dispose | 빠르게 표시할 panel Node 제공; 기본 horizontal 자동 활성화 |
| `createDialog` | element/open/close/dispose | document에 append 후 open(trigger); 닫힌 뒤에도 재사용 가능 |
| `createToastRegion` | element/show/clear | 먼저 region을 append하고 동적 알림 전달 |
| `createProgress` | element/progress/setValue | 값은 0..max, 비율 미정은 null; 사용자 언어 상태 설명 |
| `createSplitPanel` | element/separator/setValue/value/dispose | 두 panel Node/이름, 10..90 안의 5% 배수 min/max |

복합 컴포넌트의 `dispose()`는 이벤트·media listener와 DOM을 정리한다. 단순 컴포넌트 이벤트는 소유 노드에만 붙는다. 화면을 해제하는 호출자는 복합 컴포넌트의 dispose와 알림 clear를 호출해야 한다.

```ts
const length = createQuantity(document, {
  id: 'length-1', label: '첫 번째 막대 길이', symbol: 'ℓ₁', unit: 'm',
  meaning: '회전축에서 첫 번째 질점까지의 거리입니다.',
  min: 0.1, max: 10, defaultValue: 1
});
panel.append(length.element);
const parsed = length.read();
if (parsed.ok) {
  // parsed.quantity는 S03 scalar quantity이며 단위와 값을 함께 가진다.
  // 실제 adapter 연결과 도메인별 검증은 해당 시스템 통합 단계에서 수행한다.
}
```

수량은 빈값을 0으로 만들거나 범위 밖 값을 자동 보정하지 않는다. 십진수/지수 표기, 유한성, 범위, 음의 0, 비영값의 0 underflow를 검사한다. 소수점 쉼표/16진수/NaN/Infinity는 명시적으로 거부한다. `setValue`와 잘못된 컴포넌트 초기 설정은 RangeError를 내며 현재 유효 상태를 조용히 바꾸지 않는다. 수량 자체는 S03의 binary64 표현을 따른다. 표시 단위 변환, vector/complex 입력, 시스템별 물리 검증은 후속 단계의 tested adapter 범위다.

## 접근성·반응형 규칙

- 본문은 한국어 keep-all + 긴 문자열 anywhere를 사용한다. 본문 1rem/1.7, 설명 0.875rem, 화면 제목은 clamp로 커지며 글자는 고정 높이에 가두지 않는다.
- 버튼/입력은 최소 44 CSS px 높이, 글자 확대 시 자연스럽게 증가한다. focus는 색과 3px outline으로 표시한다.
- input에는 명시적 label, 설명·오류 ID 연결, aria-invalid, native custom validity가 있다. 상태/알림은 polite live region이며 수치 결과와 같은 메시지를 텍스트로 읽을 수 있다.
- 탭은 한 개의 tab stop, 좌우 방향키 순환, Home/End, 활성 tab과 panel의 ARIA 연결을 사용한다. 사용할 수 없는 탭은 순회에서 제외한다. panel도 키보드로 읽을 수 있다.
- 대화상자는 native modal의 배경 비활성화와 수동 Tab 순환을 함께 사용한다. Escape/닫기는 opener로 focus를 복귀시킨다. 중첩과 정리 시 순서를 유지한다.
- 알림은 시간 제한 없이 유지한다. 닫을 때 focus가 사라지지 않도록 이웃 알림 또는 알림 영역으로 이동한다.
- 진행률은 determinate/indeterminate를 native progress와 텍스트 상태로 구분한다. 업무별 취소는 호출자가 처리한다. 갤러리의 취소는 예제 상태를 초기화한다.
- split separator는 좌우 방향키 5% 조절, Home/End, pointer capture를 지원한다. 40rem 이하에서는 두 영역을 위아래로 읽고 숨겨진 separator는 키보드 순서에서 제외한다. 크기 조절 중 좁아지면 capture를 해제한다.
- 갤러리는 내용 너비에 따라 1~2열로 배치한다. 320px에서도 페이지 수평 스크롤 없이 입력·확인·닫기가 가능하다.
- reduced motion은 transition/animation을 제거한다. prefers-contrast는 border/focus를 강화한다. forced colors는 시스템 색과 명시적 경계로 선택·오류·focus를 보존한다.
- light/dark palette의 본문 대비는 4.5:1 이상, focus/입력 경계/선택 표시는 3:1 이상을 자동 검사한다. 모든 텍스트·hover 조합의 실제 화면 대비는 axe로 추가 확인한다.

## 검증과 한계

필수 C 검증과 S05의 axe/keyboard/320px/200%/시각 baseline을 수행한다. 상세 숫자·명령·원시 보고서 hash는 [S05-verification.json](stage-runs/S05-verification.json), checkpoint/push 증거는 [S05-progress.md](stage-runs/S05-progress.md)에 기록한다.

시각 기준 이미지는 `e2e/redesign/a11y-design-system.spec.ts-snapshots/`의 Windows Chromium desktop/mobile 결과다. 최초 생성 뒤 같은 원본으로 snapshot 갱신 없이 재검사한다. 다른 OS/브라우저의 글꼴·native control raster 기준은 별도 생성과 검토가 필요하다.

200%는 Chromium CSS zoom 2에서 실제 값 편집/대화상자/페이지 overflow를 검사하고 640px reflow를 별도로 검사한다. OS 확대기나 브라우저 도구 모음의 실제 zoom 조작, 실제 screen reader 음성 청취, 사람 접근성 심사 완료를 주장하지 않는다. S05는 지정된 사용자 review gate가 아니다.

기존 app.html, 엔진, 공개 API, 기존 사용자 데이터와 저장 형식은 변경하지 않는다. 새 CSS 두 파일은 additive product 영역이므로 S01 legacy 인벤토리에서 제외한다. [inventory-scope.test.ts](../../tests/product/design-system/inventory-scope.test.ts)는 기존 CSS 변경 탐지가 계속 유지되는지 확인한다. S01 baseline 원본은 갱신하지 않는다.

S05의 범위는 컴포넌트 기반이며 Lab 조립, 실제 계산, 학습 콘텐츠, migration은 이후 단계다. 기존 보안 기준선 항목은 해결/수용하지 않았고 [baseline/security.md](baseline/security.md)를 유지한다. 복구 기준은 S04 status `8edb888`와 계속 사용할 수 있는 기존 app.html이다.
