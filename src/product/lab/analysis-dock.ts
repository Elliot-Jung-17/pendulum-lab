import { element } from '../app/dom';
import { createButton, createInput, createSection } from '../design-system/primitives';
import { selectLabCapabilities } from '../catalog/selectors';
import type { SystemDefinition } from '../contracts/catalog';
import type { LabModel } from './model';

export function createAnalysisDock(document: Document, system: SystemDefinition, model: LabModel) {
  const section = createSection(document, {
    id: 'lab-analysis',
    title: '분석 도구',
    description: '호환되는 입력을 갖춘 도구를 시험 구성에 추가하세요. 실제 분석 결과는 계산하지 않습니다.'
  });
  const definitions = selectLabCapabilities(system).analyses;
  const selected = element(document, 'div', 'lab-selected-analyses');
  const empty = element(document, 'p', 'lab-empty', '추가한 분석이 없습니다. 아래 목록에서 관찰할 도구를 선택하세요.');
  const chooser = element(document, 'div', 'lab-analysis-choices');
  const more = element(document, 'details', 'lab-details');
  more.append(element(document, 'summary', '', '더 많은 분석 도구'));
  const search = createInput(document, {
    id: 'lab-analysis-search',
    label: '호환 분석 검색',
    type: 'search',
    onInput: () => renderChoices()
  });
  const noMatches = element(document, 'p', 'lab-muted', '검색 조건과 호환되는 분석이 없습니다.');
  const count = element(document, 'p', 'lab-muted');
  count.setAttribute('role', 'status');
  section.body.append(selected, empty, search.element, count, chooser, more, noMatches);
  const buttons = new Map<string, HTMLButtonElement>();
  function renderChoices(): void {
    const query = search.input.value.trim().toLocaleLowerCase();
    const matches = definitions.filter((definition) =>
      [definition.name.ko, definition.name.en, ...definition.tags].join(' ').toLocaleLowerCase().includes(query)
    );
    chooser.replaceChildren();
    while (more.children.length > 1) more.lastElementChild!.remove();
    buttons.clear();
    count.textContent = `호환 분석 ${matches.length}개`;
    noMatches.hidden = matches.length > 0;
    more.hidden = matches.length <= 4;
    matches.forEach((definition, index) => {
      const entry = element(document, 'article', 'lab-analysis-choice');
      entry.append(
        element(document, 'h3', '', definition.name.ko),
        element(document, 'p', 'lab-muted', definition.description.ko)
      );
      const details = element(document, 'details', 'lab-details');
      details.append(
        element(document, 'summary', '', '입력·비용·해석 안내'),
        element(document, 'p', '', `필요 입력: ${definition.inputs.map((input) => input.description.ko).join(' ')}`),
        element(document, 'p', '', `계산 비용: ${definition.computation.cost.ko}`)
      );
      for (const limitation of definition.limitations) details.append(element(document, 'p', '', limitation.ko));
      const button = createButton(document, {
        label: `${definition.name.ko} 추가`,
        variant: 'secondary',
        onClick() {
          model.toggleAnalysis(definition.id);
        }
      });
      buttons.set(definition.id, button);
      entry.append(details, button);
      (index < 4 ? chooser : more).append(entry);
    });
    updateButtons();
  }
  function updateButtons(): void {
    const busy = ['preparing', 'running'].includes(model.state.status);
    for (const [id, button] of buttons) {
      const added = model.state.analysisIds.includes(id as `analysis:${string}`);
      button.disabled = busy;
      button.setAttribute('aria-pressed', String(added));
      button.textContent = `${definitions.find((definition) => definition.id === id)!.name.ko} ${added ? '제거' : '추가'}`;
    }
  }
  let signature = '';
  function update(): void {
    updateButtons();
    const next = JSON.stringify(model.state.analysisIds);
    if (signature === next) return;
    signature = next;
    selected.replaceChildren();
    empty.hidden = model.state.analysisIds.length > 0;
    for (const id of model.state.analysisIds) {
      const definition = definitions.find((candidate) => candidate.id === id);
      if (!definition) continue;
      const item = element(document, 'div', 'lab-analysis-selected');
      item.append(
        element(document, 'h3', '', definition.name.ko),
        element(document, 'p', 'lab-muted', '시험 구성에 추가됨 · 물리 결과 없음')
      );
      selected.append(item);
    }
  }
  renderChoices();
  update();
  return { element: section.element, update };
}
