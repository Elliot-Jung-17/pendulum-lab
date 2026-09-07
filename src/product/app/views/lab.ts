import { catalog } from '../../catalog';
import { availabilityNote, element, link, pageHeading } from '../dom';
import type { ResolvedRoute, RouteView } from '../types';

export function createView(context: ResolvedRoute, document: Document): RouteView {
  const { route, experiment } = context;
  const view = element(document, 'div', 'product-page product-lab-page');
  view.append(element(document, 'p', 'product-eyebrow', 'LAB · 실험실'));

  if (route.kind === 'lab-system') {
    const system = catalog.systems.find((definition) => definition.id === route.systemId);
    if (!system) throw new Error('The laboratory route requires a registered system.');
    view.append(
      pageHeading(document, system.name.ko),
      element(document, 'p', 'product-lead', system.description.ko),
      availabilityNote(
        document,
        '이 시스템의 새 실험 화면은 준비 중입니다',
        '등록된 시스템 주소를 확인했습니다. 새 공간에서는 아직 실행할 수 없습니다. 계산과 분석은 기존 앱에서 이용해 주세요.'
      )
    );
    if (experiment) {
      const summary = element(document, 'section', 'product-share-summary');
      summary.append(
        element(document, 'h2', 'product-note-title', '공유된 실험 설정을 확인했습니다'),
        element(
          document,
          'p',
          '',
          '공유 데이터의 형식과 시스템을 확인했습니다. 계산을 시작하거나 기존 앱으로 설정을 전달하지는 않았습니다.'
        )
      );
      const details = element(document, 'dl', 'product-detail-list');
      details.append(
        element(document, 'dt', '', '모델 버전'),
        element(document, 'dd', '', experiment.modelVersion),
        element(document, 'dt', '', '분석 설정'),
        element(document, 'dd', '', `${experiment.analyses.length}개`)
      );
      summary.append(details);
      view.append(summary);
    }
    const actions = element(document, 'div', 'product-actions');
    actions.append(
      link(document, '기존 앱에서 실험하기', './app.html', 'product-action product-action-primary'),
      link(document, '실험실 안내로 돌아가기', '#/lab', 'product-action product-action-secondary')
    );
    view.append(actions);
    return { element: view, title: `${system.name.ko} · 실험실` };
  }

  if (route.kind !== 'lab') throw new Error('The laboratory view requires a Lab route.');

  const hero = element(document, 'section', 'product-hero');
  const introduction = element(document, 'div', 'product-introduction');
  introduction.append(
    pageHeading(document, '질문을 직접 시험하는 실험실'),
    element(
      document,
      'p',
      'product-lead',
      '길이, 질량, 시작 각도를 바꾸면 운동은 어떻게 달라질까요? 실험실은 시스템과 조건을 직접 정하고 결과를 비교하는 공간입니다.'
    )
  );
  const distinction = element(document, 'p', 'product-space-description');
  distinction.append(
    document.createTextNode('개념을 먼저 살펴보고 싶다면 '),
    link(document, '배우기', '#/learn'),
    document.createTextNode('로 이동하세요. 학습 진도가 실험실의 이용 조건이 되지는 않습니다.')
  );
  introduction.append(distinction);

  const aside = element(document, 'aside', 'product-path-note');
  aside.setAttribute('aria-label', '실험실의 방향');
  aside.append(element(document, 'p', 'product-note-kicker', '내 조건으로 탐구하기'));
  const steps = element(document, 'ol', 'product-concept-list');
  steps.append(
    element(document, 'li', '', '관찰할 시스템 고르기'),
    element(document, 'li', '', '초기 조건과 물성 정하기'),
    element(document, 'li', '', '운동과 분석 결과 비교하기')
  );
  aside.append(steps);
  hero.append(introduction, aside);
  view.append(
    hero,
    availabilityNote(
      document,
      '현재는 실험실 진입 안내를 제공합니다',
      '시스템 선택과 실행 도구는 새 공간에 연결할 준비 중입니다. 지금 사용할 수 있는 시뮬레이션과 분석은 기존 앱에서 열 수 있습니다.'
    )
  );
  const actions = element(document, 'div', 'product-actions');
  actions.append(
    link(document, '기존 앱에서 실험하기', './app.html', 'product-action product-action-primary'),
    link(document, '배우기 알아보기', '#/learn', 'product-action product-action-secondary')
  );
  view.append(actions);
  return { element: view, title: '실험실' };
}
