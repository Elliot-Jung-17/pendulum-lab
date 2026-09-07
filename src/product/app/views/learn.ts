import { availabilityNote, element, link, pageHeading } from '../dom';
import type { ResolvedRoute, RouteView } from '../types';

export function createView(context: ResolvedRoute, document: Document): RouteView {
  const { route } = context;
  const view = element(document, 'div', 'product-page product-learn-page');
  view.append(element(document, 'p', 'product-eyebrow', 'LEARN · 배우기'));

  if (route.kind === 'learn-course' || route.kind === 'learn-unit') {
    const courseNumber = route.courseId.slice('course-'.length);
    const title = route.kind === 'learn-unit' ? `단원 ${route.unitId}` : `과정 ${courseNumber}`;
    view.append(
      pageHeading(document, title),
      availabilityNote(
        document,
        '이 학습 페이지는 아직 준비 중입니다',
        '주소는 확인했지만 과정 내용과 전용 실험은 아직 제공되지 않습니다. 배우기 안내로 돌아가거나 기존 앱에서 실험할 수 있습니다.'
      )
    );
    const actions = element(document, 'div', 'product-actions');
    actions.append(
      link(document, '배우기 안내로 돌아가기', '#/learn', 'product-action product-action-primary'),
      link(document, '기존 앱에서 실험하기', './app.html', 'product-action product-action-secondary')
    );
    view.append(actions);
    return { element: view, title: `${title} · 배우기` };
  }

  if (route.kind !== 'learn') throw new Error('The Learn view requires a Learn route.');

  const hero = element(document, 'section', 'product-hero');
  const introduction = element(document, 'div', 'product-introduction');
  introduction.append(
    pageHeading(document, '움직임을 이해하는 배우기'),
    element(
      document,
      'p',
      'product-lead',
      '왜 같은 진자가 다른 길을 그릴까요? 배우기는 하나의 질문에서 시작해 이론과 관찰을 연결하는 공간입니다.'
    )
  );
  const distinction = element(document, 'p', 'product-space-description');
  distinction.append(
    document.createTextNode('배우기는 개념을 따라 탐구하고, '),
    link(document, '실험실', '#/lab'),
    document.createTextNode('은 원하는 조건을 직접 정해 탐구하는 공간입니다.')
  );
  introduction.append(distinction);

  const aside = element(document, 'aside', 'product-path-note');
  aside.setAttribute('aria-label', '배우기의 방향');
  aside.append(element(document, 'p', 'product-note-kicker', '하나의 질문에서 시작하기'));
  const steps = element(document, 'ol', 'product-concept-list');
  steps.append(
    element(document, 'li', '', '현상을 보고 질문하기'),
    element(document, 'li', '', '가정과 식의 의미 이해하기'),
    element(document, 'li', '', '조건을 바꾸고 관찰하기')
  );
  aside.append(steps);
  hero.append(introduction, aside);
  view.append(
    hero,
    availabilityNote(
      document,
      '현재는 배우기 진입 안내를 제공합니다',
      '과정과 단원, 전용 실험은 준비 중입니다. 지금 계산과 분석을 사용하려면 기존 앱을 열어 주세요.'
    )
  );
  const actions = element(document, 'div', 'product-actions');
  actions.append(
    link(document, '기존 앱에서 실험하기', './app.html', 'product-action product-action-primary'),
    link(document, '실험실 알아보기', '#/lab', 'product-action product-action-secondary')
  );
  view.append(actions);
  return { element: view, title: '배우기' };
}
