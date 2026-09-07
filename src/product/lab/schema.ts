import type { SystemDefinition } from '../contracts/catalog';
import type { CanonicalUnit } from '../contracts/quantities';
import { parseQuantityInput } from '../design-system/quantity';

export interface LabField {
  readonly id: string;
  readonly label: string;
  readonly unit: CanonicalUnit;
  readonly defaultValue: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly integer?: boolean;
  readonly group: 'parameters' | 'initialConditions' | 'runtime';
  readonly advanced: boolean;
}

export interface LabSchema {
  readonly fields: readonly LabField[];
  readonly physicalSchema: 'inline' | 'reference';
  readonly note: string;
}

/** UI fixture metadata mirrors existing parameter names; it is not a physics adapter. */
const doubleFields: readonly LabField[] = [
  {
    id: 'm1',
    label: '첫 번째 질량',
    unit: 'kg',
    defaultValue: 1,
    min: 0.001,
    max: 1000,
    group: 'parameters',
    advanced: false
  },
  {
    id: 'm2',
    label: '두 번째 질량',
    unit: 'kg',
    defaultValue: 1,
    min: 0.001,
    max: 1000,
    group: 'parameters',
    advanced: false
  },
  {
    id: 'l1',
    label: '첫 번째 길이',
    unit: 'm',
    defaultValue: 1,
    min: 0.001,
    max: 1000,
    group: 'parameters',
    advanced: false
  },
  {
    id: 'l2',
    label: '두 번째 길이',
    unit: 'm',
    defaultValue: 1,
    min: 0.001,
    max: 1000,
    group: 'parameters',
    advanced: false
  },
  {
    id: 'g',
    label: '중력 가속도',
    unit: 'm/s^2',
    defaultValue: 9.81,
    min: 0,
    max: 1000,
    group: 'parameters',
    advanced: true
  },
  {
    id: 'theta1',
    label: '첫 번째 시작 각도',
    unit: 'rad',
    defaultValue: 1.2,
    group: 'initialConditions',
    advanced: false
  },
  {
    id: 'theta2',
    label: '두 번째 시작 각도',
    unit: 'rad',
    defaultValue: 0.6,
    group: 'initialConditions',
    advanced: false
  },
  { id: 'omega1', label: '첫 번째 각속도', unit: 'rad/s', defaultValue: 0, group: 'initialConditions', advanced: true },
  { id: 'omega2', label: '두 번째 각속도', unit: 'rad/s', defaultValue: 0, group: 'initialConditions', advanced: true }
];

export function getLabSchema(system: SystemDefinition): LabSchema {
  const inline = system.id === 'system:double' || system.id === 'system:compound-double';
  const runtimeFields: LabField[] = ['map', 'quantum'].includes(system.evolution)
    ? [
        {
          id: 'iterations',
          label: '반복 횟수',
          unit: '1',
          defaultValue: 1000,
          min: 1,
          max: 1000000,
          integer: true,
          group: 'runtime',
          advanced: false
        }
      ]
    : ['spectral', 'diagnostic'].includes(system.evolution)
      ? []
      : [
          {
            id: 'duration',
            label: '관찰 시간',
            unit: 's',
            defaultValue: 10,
            min: 0.001,
            max: 10000,
            group: 'runtime',
            advanced: false
          },
          ...(system.stepping.kind === 'selectable'
            ? [
                {
                  id: 'step',
                  label: '시간 간격',
                  unit: 's',
                  defaultValue: 0.01,
                  min: 0.000001,
                  max: 1,
                  group: 'runtime',
                  advanced: true
                } as const
              ]
            : [])
        ];
  return {
    fields: [...(inline ? doubleFields : []), ...runtimeFields],
    physicalSchema: inline ? 'inline' : 'reference',
    note: inline
      ? 'SI 단위로 조건을 입력하는 모의 설정입니다. 입력 범위는 화면 점검용이며 물리 검증을 대신하지 않습니다.'
      : '이 시스템의 물성·초기 조건 편집은 실제 계산을 연결할 때 제공됩니다. 지금은 시스템 선택과 모의 실행 흐름을 확인할 수 있습니다.'
  };
}

export function validateLabFields(schema: LabSchema, values: Readonly<Record<string, string>>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of schema.fields) {
    const parsed = parseQuantityInput(values[field.id] ?? '', {
      unit: field.unit,
      min: field.min ?? -Number.MAX_VALUE,
      max: field.max ?? Number.MAX_VALUE
    });
    if (!parsed.ok) errors[field.id] = parsed.message;
    else if (field.integer && !Number.isInteger(parsed.quantity.value)) errors[field.id] = '정수를 입력하세요.';
  }
  if (!errors.duration && !errors.step && Number(values.step) > Number(values.duration)) {
    errors.step = '시간 간격은 관찰 시간 이하여야 합니다.';
  }
  return errors;
}
