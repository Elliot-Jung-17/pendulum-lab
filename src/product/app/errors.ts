import type { RouteError } from './types';

const messages = {
  'invalid-route': {
    title: '주소를 확인해 주세요',
    message:
      '지원하지 않는 주소이거나 공유 설정을 읽을 수 없습니다. 원래 주소는 그대로 유지됩니다. 보낸 사람에게 링크를 확인하거나 아래에서 공간을 선택해 주세요.'
  },
  'chunk-error': {
    title: '화면을 불러오지 못했습니다',
    message:
      '연결이 끊겼거나 앱이 업데이트되었을 수 있습니다. 연결을 확인한 뒤 다시 시도해 주세요. 다른 공간으로 이동할 수도 있습니다.'
  },
  'render-error': {
    title: '화면을 표시하지 못했습니다',
    message: '화면을 여는 중 문제가 생겼습니다. 같은 주소로 다시 시도하거나 다른 공간으로 이동해 주세요.'
  },
  bootstrap: {
    title: '앱을 열지 못했습니다',
    message:
      '시작에 필요한 화면을 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요. 기존 앱도 계속 이용할 수 있습니다.'
  }
} as const;

/** Error details and share tokens stay out of the DOM; recovery never rewrites storage. */
export function createErrorView(document: Document, kind: RouteError | 'bootstrap', reload: () => void) {
  const section = document.createElement('section');
  section.className = 'product-message';
  const heading = document.createElement('h1');
  heading.className = 'product-title';
  heading.textContent = messages[kind].title;
  heading.tabIndex = -1;
  const message = document.createElement('p');
  message.textContent = messages[kind].message;
  message.setAttribute('role', 'alert');
  const actions = document.createElement('div');
  actions.className = 'product-actions';
  if (kind !== 'invalid-route') {
    const button = document.createElement('button');
    button.className = 'product-action product-action-primary';
    button.type = 'button';
    button.textContent = '다시 시도';
    button.addEventListener('click', reload);
    actions.append(button);
  }
  for (const [href, label] of [
    ['./next.html#/learn', '배우기로 이동'],
    ['./next.html#/lab', '실험실로 이동'],
    ['./app.html', '기존 앱 열기']
  ]) {
    const link = document.createElement('a');
    link.className = 'product-action product-action-secondary';
    link.href = href!;
    link.textContent = label!;
    actions.append(link);
  }
  section.append(heading, message, actions);
  return { element: section, title: messages[kind].title };
}
