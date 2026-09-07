import { element, link } from '../app/dom';
import { createButton, createInput, createSection, createCard, createProgress, createToastRegion } from './primitives';
import { createQuantity } from './quantity';
import { createTabs } from './tabs';
import { createDialog } from './dialog';
import { createSplitPanel } from './split-panel';
import { createThemeControl } from './theme';

/** Interactive component examples, isolated from experiment routes and engines. */
export function mountApplication(root: HTMLElement) {
  const document = root.ownerDocument;
  root.classList.add('product-app');
  const skip = link(document, '본문으로 건너뛰기', '#gallery-main', 'product-skip-link');
  const header = element(document, 'header', 'ds-gallery-header');
  const theme = createThemeControl(document, 'gallery-theme');
  header.append(link(document, 'Pendulum Lab', './next.html#/learn', 'product-brand'), theme.element);
  const main = element(document, 'main', 'ds-gallery');
  main.id = 'gallery-main';
  main.tabIndex = -1;
  const title = element(document, 'h1', '', '작은 요소부터, 명확하게.');
  main.append(
    element(document, 'p', 'ds-kicker', 'PENDULUM LAB / COMPONENTS'),
    title,
    element(
      document,
      'p',
      'ds-muted',
      '값을 읽고, 선택하고, 결과를 확인하는 공통 화면 요소입니다. 아래 예제는 이 화면 안에서만 동작합니다.'
    )
  );
  const swatches = element(document, 'div', 'ds-row');
  swatches.setAttribute('aria-label', '의미별 색상 예제');
  for (const [kind, label] of [
    ['accent', '주요 행동'],
    ['surface', '정보 영역'],
    ['warning', '주의 · 조건 확인'],
    ['error', '오류 · 값 수정']
  ] as const) {
    swatches.append(element(document, 'span', `ds-swatch ds-swatch-${kind}`, label));
  }
  main.append(swatches);
  const grid = element(document, 'div', 'ds-gallery-grid');
  main.append(grid);

  const basics = createSection(document, {
    id: 'gallery-basics',
    title: '01 · 행동과 상태',
    description: '동작의 이름을 읽고 실행합니다. 사용할 수 없는 행동은 이유를 함께 표시합니다.'
  });
  const actions = element(document, 'div', 'ds-row');
  const actionStatus = element(document, 'p', 'ds-muted', '버튼을 눌러 상태를 확인하세요.');
  actionStatus.setAttribute('role', 'status');
  const primary = createButton(document, {
    label: '예제 실행',
    onClick: () => {
      actionStatus.textContent = '예제를 실행했습니다. 실제 계산은 하지 않습니다.';
    }
  });
  const reset = createButton(document, {
    label: '예제 초기화',
    variant: 'secondary',
    onClick: () => {
      actionStatus.textContent = '예제가 초기화되었습니다.';
    }
  });
  const unavailable = createButton(document, { label: '결과 내보내기', disabled: true });
  unavailable.setAttribute('aria-describedby', 'gallery-no-result');
  actions.append(primary, reset, unavailable);
  const empty = element(document, 'p', 'ds-muted', '아직 결과가 없어 내보낼 수 없습니다.');
  empty.id = 'gallery-no-result';
  basics.body.append(actions, actionStatus, empty);

  const fields = createSection(document, {
    id: 'gallery-fields',
    title: '02 · 이름과 수량',
    description: '기호, 단위, 범위와 기본값을 함께 읽습니다. 잘못된 값은 적용하지 않습니다.'
  });
  const name = createInput(document, {
    id: 'gallery-name',
    label: '실험 이름',
    value: '두 진자의 움직임',
    help: '한글과 공백을 사용할 수 있습니다.',
    required: true
  });
  const quantity = createQuantity(document, {
    id: 'gallery-length',
    label: '첫 번째 막대 길이',
    symbol: 'ℓ₁',
    unit: 'm',
    meaning: '회전축에서 첫 번째 질점까지의 거리입니다.',
    defaultValue: 1,
    min: 0.1,
    max: 10
  });
  const applied = element(document, 'p', 'ds-muted', '적용된 길이: 1 m');
  applied.setAttribute('role', 'status');
  const apply = createButton(document, {
    label: '입력 확인',
    onClick: () => {
      const validName = name.input.value.trim().length > 0;
      name.setError(validName ? '' : '실험 이름을 입력해 주세요.');
      const value = quantity.read();
      if (!validName) name.input.focus();
      else if (!value.ok) quantity.input.focus();
      else applied.textContent = `적용된 길이: ${quantity.input.value} m`;
    }
  });
  fields.body.append(name.element, quantity.element, apply, applied);

  const choices = createSection(document, {
    id: 'gallery-choices',
    title: '03 · 차례와 맥락',
    description: '탭 안에서 방향키·Home·End로 이동할 수 있습니다.'
  });
  const overview = createCard(document, {
    id: 'gallery-card',
    title: '하나의 질문에 집중하기',
    description: '막대의 길이가 바뀌면 무엇이 달라질까요? 조건과 관찰을 한 카드에 모읍니다.'
  });
  overview.body.append(
    element(document, 'p', 'ds-muted', '카드는 정보를 묶고, 실제 행동에는 이름이 있는 버튼이나 링크를 사용합니다.')
  );
  const conditions = element(
    document,
    'p',
    '',
    '길이는 m, 질량은 kg, 시간은 s 단위로 읽습니다. 입력한 수량은 의미와 단위를 함께 유지합니다.'
  );
  const tabs = createTabs(document, {
    id: 'gallery-tabs',
    label: '예제 설명',
    items: [
      { id: 'overview', label: '개요', content: overview.element },
      { id: 'conditions', label: '조건', content: conditions },
      {
        id: 'observation',
        label: '관찰',
        content: element(
          document,
          'p',
          '',
          '관찰 결과가 아직 없습니다. 예제 버튼의 동작은 화면 요소의 상태만 바꿉니다.'
        )
      }
    ]
  });
  choices.body.append(tabs.element);

  const feedback = createSection(document, {
    id: 'gallery-feedback',
    title: '04 · 진행과 알림',
    description: '완료, 취소와 오류를 텍스트로 알려 줍니다. 알림은 직접 닫을 때까지 유지됩니다.'
  });
  const progress = createProgress(document, { id: 'gallery-progress', label: '예제 진행률', value: 0 });
  const notifications = createToastRegion(document);
  let progressValue = 0;
  const progressActions = element(document, 'div', 'ds-row');
  progressActions.append(
    createButton(document, {
      label: '25% 진행',
      onClick: () => {
        progressValue = Math.min(100, progressValue + 25);
        progress.setValue(
          progressValue,
          progressValue === 100 ? '예제 작업이 완료되었습니다.' : `예제 작업 ${progressValue}% 진행`
        );
      }
    }),
    createButton(document, {
      label: '대기 상태',
      variant: 'secondary',
      onClick: () => {
        progress.setValue(null, '완료 시간을 확인하는 중입니다. 취소할 수 있습니다.');
      }
    }),
    createButton(document, {
      label: '작업 취소',
      variant: 'secondary',
      onClick: () => {
        progressValue = 0;
        progress.setValue(0, '예제 작업을 취소했습니다. 다시 시작할 수 있습니다.');
      }
    }),
    createButton(document, {
      label: '알림 보기',
      variant: 'secondary',
      onClick: () => {
        notifications.show('설정 예제를 확인했습니다. 이 알림은 닫기 버튼으로 지울 수 있습니다.');
      }
    })
  );
  feedback.body.append(progress.element, progressActions, notifications.element);

  const modalSection = createSection(document, {
    id: 'gallery-modal',
    title: '05 · 확인 대화상자',
    description: '대화상자가 열리면 내부에서 포커스가 이동합니다. Escape로 닫고 원래 버튼으로 돌아옵니다.'
  });
  const dialogBody = element(document, 'div', 'ds-stack');
  const dialogName = createInput(document, {
    id: 'gallery-dialog-name',
    label: '예제 메모',
    help: '이 메모는 저장되지 않습니다.'
  });
  dialogBody.append(dialogName.element);
  const dialog = createDialog(document, {
    id: 'gallery-dialog',
    title: '예제 확인',
    description: '입력과 닫기 동작을 확인해 보세요.',
    content: dialogBody
  });
  const modalStatus = element(document, 'p', 'ds-muted');
  modalStatus.setAttribute('role', 'status');
  dialogBody.append(
    createButton(document, {
      label: '확인하고 닫기',
      onClick: () => {
        modalStatus.textContent = '대화상자를 확인했습니다.';
        dialog.close('confirmed');
      }
    })
  );
  const openDialog = createButton(document, { label: '대화상자 열기', onClick: () => dialog.open(openDialog) });
  modalSection.body.append(openDialog, modalStatus, dialog.element);

  const layout = createSection(document, {
    id: 'gallery-layout',
    title: '06 · 나누고 읽기',
    description: '넓은 화면에서는 구분선을 드래그하거나 방향키로 크기를 조절합니다. 좁은 화면에서는 위아래로 읽습니다.'
  });
  const primaryPanel = element(document, 'div', 'ds-stack');
  primaryPanel.append(
    element(document, 'h3', '', '관찰 공간'),
    element(document, 'p', '', '움직임과 관찰 결과를 확인하는 영역입니다.')
  );
  const secondaryPanel = element(document, 'div', 'ds-stack');
  secondaryPanel.append(
    element(document, 'h3', '', '설정 공간'),
    element(document, 'p', '', '현재 값의 의미와 단위를 함께 읽는 영역입니다.')
  );
  const split = createSplitPanel(document, {
    id: 'gallery-split',
    label: '관찰 공간 너비',
    primaryLabel: '관찰 공간',
    secondaryLabel: '설정 공간',
    primary: primaryPanel,
    secondary: secondaryPanel
  });
  layout.body.append(split.element);
  grid.append(basics.element, fields.element, choices.element, feedback.element, modalSection.element, layout.element);
  const footer = element(document, 'footer', 'product-footer');
  footer.append(
    link(document, '배우기로 돌아가기', './next.html#/learn'),
    element(document, 'p', '', '테마는 현재 화면에만 적용됩니다. 새로고침하면 밝은 테마로 시작합니다.')
  );
  const skipToMain = (event: MouseEvent) => {
    event.preventDefault();
    main.focus();
    main.scrollIntoView({ block: 'start' });
  };
  skip.addEventListener('click', skipToMain);
  root.replaceChildren(skip, header, main, footer);
  root.dataset.bootstrapState = 'ready';
  document.title = '컴포넌트 갤러리 | Pendulum Lab';
  const dispose = () => {
    theme.dispose();
    tabs.dispose();
    dialog.dispose();
    split.dispose();
    notifications.clear();
    skip.removeEventListener('click', skipToMain);
    root.replaceChildren();
    root.classList.remove('product-app');
  };
  return { dispose };
}
