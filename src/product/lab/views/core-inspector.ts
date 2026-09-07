import { element } from '../../app/dom';
import { createSection } from '../../design-system/primitives';
import { createQuantity, type QuantityControl } from '../../design-system/quantity';
import {
  PLANAR_FIELDS,
  PLANAR_INTEGRATOR_IDS,
  planarWarnings,
  validatePlanarConfig,
  type PlanarConfig,
  type PlanarState
} from '../../adapters/physics/planar';
import type { CoreModel } from './core-model';

export function createCoreInspector(document: Document, model: CoreModel, onChange: () => void) {
  const section = createSection(document, {
    id: 'core-inspector',
    title: '실험 조건',
    description: 'SI 단위의 초기조건에서 실행합니다. 값을 바꾸면 이전 궤적과 분석을 지웁니다.'
  });
  const basic = element(document, 'div', 'lab-fieldset');
  const details = element(document, 'details', 'lab-details');
  details.append(element(document, 'summary', '', '상세 조건 펼치기'));
  const advanced = element(document, 'div', 'lab-fieldset');
  details.append(advanced);
  const errors = element(document, 'p', 'ds-field__error');
  errors.setAttribute('role', 'alert');
  errors.hidden = true;
  const controls = new Map<string, QuantityControl>();
  const readValues = (config: PlanarConfig): Record<string, number> => ({
    ...config.parameters,
    gamma: config.gamma,
    theta1: config.initialState[0],
    theta2: config.initialState[1],
    omega1: config.initialState[2],
    omega2: config.initialState[3],
    duration: config.duration,
    step: config.step
  });
  const initial = readValues(model.state.config);
  let syncing = false;
  function edit() {
    if (syncing) return;
    const values: Record<string, number> = {};
    let valid = true;
    for (const [id, control] of controls) {
      const parsed = control.read();
      if (parsed.ok) values[id] = parsed.quantity.value;
      else valid = false;
    }
    if (!valid) {
      onChange();
      model.setValid(false);
      return;
    }
    const next: PlanarConfig = {
      ...model.state.config,
      parameters: { m1: values.m1!, m2: values.m2!, l1: values.l1!, l2: values.l2!, g: values.g! },
      gamma: values.gamma!,
      initialState: [values.theta1!, values.theta2!, values.omega1!, values.omega2!] as PlanarState,
      duration: values.duration!,
      step: values.step!,
      integratorId: integrator.value as PlanarConfig['integratorId']
    };
    const checked = validatePlanarConfig(next);
    errors.hidden = checked.ok;
    errors.textContent = checked.ok ? '' : checked.issues.map((item) => item.message).join(' ');
    if (!checked.ok && checked.issues.some((item) => item.code === 'step-budget'))
      controls.get('step')?.setError(errors.textContent ?? '시간 간격을 확인하세요.');
    onChange();
    if (checked.ok) model.configure(checked.value);
    else model.setValid(false);
  }
  for (const field of PLANAR_FIELDS) {
    const control = createQuantity(document, {
      ...field,
      id: `lab-field-${field.id}`,
      symbol: field.id,
      value: initial[field.id]!,
      meaning:
        field.id === 'gamma'
          ? '힌지 토크 = −γ·각속도.'
          : field.group === 'initialConditions'
            ? '실행 시작 상태입니다.'
            : '선택한 진자 모델에 적용됩니다.',
      onChange: edit
    });
    controls.set(field.id, control);
    (field.advanced ? advanced : basic).append(control.element);
  }
  const label = element(document, 'label', 'ds-field__label', '적분기');
  label.htmlFor = 'lab-integrator';
  const integrator = element(document, 'select', 'ds-field__control');
  integrator.id = 'lab-integrator';
  for (const id of PLANAR_INTEGRATOR_IDS) {
    const option = element(
      document,
      'option',
      '',
      id === 'integrator:rk4' ? 'RK4 (4차)' : id === 'integrator:rk2' ? 'RK2 (2차)' : '명시적 Euler (1차)'
    );
    option.value = id;
    integrator.append(option);
  }
  integrator.value = model.state.config.integratorId;
  integrator.addEventListener('change', edit);
  const warnings = element(document, 'div', 'lab-preview-note');
  section.body.append(
    basic,
    details,
    label,
    integrator,
    errors,
    warnings,
    element(
      document,
      'p',
      'lab-muted',
      '이 화면은 RK4·RK2·Euler를 제공합니다. 최대 100,000 단계, 관찰 시간 300 s. 저장은 초기조건 재실행 설정입니다.'
    )
  );
  return {
    element: section.element,
    update() {
      const busy = model.state.status === 'running';
      for (const control of controls.values()) control.input.disabled = busy;
      integrator.disabled = busy;
      const text = planarWarnings(model.state.config).join(' ');
      if (warnings.textContent !== text) warnings.textContent = text;
    },
    sync() {
      syncing = true;
      const values = readValues(model.state.config);
      for (const [id, control] of controls) control.setValue(values[id]!);
      integrator.value = model.state.config.integratorId;
      errors.hidden = true;
      errors.textContent = '';
      syncing = false;
    }
  };
}
