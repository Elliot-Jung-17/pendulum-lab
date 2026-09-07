import { element } from '../app/dom';
import { createInput, createSection } from '../design-system/primitives';
import { getLabSchema, type LabModel } from './model';
import { selectLabCapabilities } from '../catalog/selectors';
import type { SystemDefinition } from '../contracts/catalog';

export function createInspector(document: Document, system: SystemDefinition, model: LabModel) {
  const section = createSection(document, {
    id: 'lab-inspector',
    title: '조건 설정',
    description: '단위와 기본값을 확인하고 시험할 조건을 편집하세요.'
  });
  const schema = getLabSchema(system);
  section.body.append(element(document, 'p', 'lab-muted', schema.note));
  const advanced = element(document, 'details', 'lab-details');
  advanced.append(element(document, 'summary', '', '상세 조건 펼치기'));
  const groups = new Map<string, HTMLElement>();
  for (const [id, label] of [
    ['parameters', '물성'],
    ['initialConditions', '초기 조건'],
    ['runtime', '실행 설정']
  ]) {
    const group = element(document, 'fieldset', 'lab-fieldset');
    group.append(element(document, 'legend', '', label));
    groups.set(id!, group);
  }
  const fields = schema.fields.map((field) => {
    const displayUnit = field.id === 'iterations' ? '회' : field.unit;
    const range = `${field.min === undefined ? '유한한 값' : `${field.min} 이상`}${field.max === undefined ? '' : `, ${field.max} 이하`}`;
    const control = createInput(document, {
      id: `lab-field-${field.id}`,
      label: `${field.label} · ${field.id} (${displayUnit})`,
      value: model.state.fields[field.id] ?? String(field.defaultValue),
      required: true,
      help: `${field.label} 설정값입니다. 범위: ${range} ${displayUnit}. 기본값: ${field.defaultValue} ${displayUnit}. 화면 점검용 값입니다.`,
      onInput: (value) => model.setField(field.id, value)
    });
    control.input.inputMode = 'decimal';
    control.input.autocomplete = 'off';
    (field.advanced ? advanced : groups.get(field.group)!).append(control.element);
    return { field, control };
  });
  for (const group of groups.values()) if (group.children.length > 1) section.body.append(group);
  if (advanced.children.length > 1) section.body.append(advanced);
  const capabilities = selectLabCapabilities(system);
  let integrator: HTMLSelectElement | undefined;
  if (capabilities.integrators.length) {
    const label = element(document, 'label', 'ds-field', '적분 방법 · 시험 선택');
    integrator = element(document, 'select', 'ds-field__control');
    integrator.id = 'lab-integrator';
    label.htmlFor = integrator.id;
    for (const definition of capabilities.integrators) {
      const option = element(document, 'option', '', definition.name.ko);
      option.value = definition.id;
      integrator.append(option);
    }
    integrator.addEventListener('change', () => model.setIntegrator(integrator!.value));
    label.append(integrator);
    section.body.append(label);
  } else {
    section.body.append(
      element(
        document,
        'p',
        'lab-muted',
        system.stepping.kind === 'internal'
          ? `이 시스템은 전용 실행 방법을 사용합니다. ${system.stepping.description.ko}`
          : '현재 시험 입력과 호환되는 선택형 적분 방법이 없습니다.'
      )
    );
  }
  const limitations = element(document, 'details', 'lab-details');
  limitations.append(
    element(document, 'summary', '', '좌표와 과학적 한계'),
    element(document, 'p', '', system.coordinates.ko)
  );
  for (const limitation of system.limitations) limitations.append(element(document, 'p', '', limitation.ko));
  section.body.append(limitations);
  function update(): void {
    const state = model.state;
    const busy = state.status === 'running' || state.status === 'preparing';
    for (const { field, control } of fields) {
      const value = state.fields[field.id] ?? '';
      if (control.input.value !== value) control.input.value = value;
      control.setError(state.fieldErrors[field.id] ?? '');
      control.input.disabled = busy;
      if (state.fieldErrors[field.id] && field.advanced) advanced.open = true;
    }
    if (integrator) {
      integrator.value = state.integratorId ?? '';
      integrator.disabled = busy;
    }
  }
  update();
  return { element: section.element, update };
}
