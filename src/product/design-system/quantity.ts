import { validateQuantityValue, type CanonicalUnit, type QuantityValue } from '../contracts/quantities';
import { createInput, type InputControl } from './primitives';

export interface QuantityRange {
  readonly unit: CanonicalUnit;
  readonly min: number;
  readonly max: number;
}

type ScalarQuantity = Extract<QuantityValue, { kind: 'scalar' }>;
export type QuantityInputResult =
  | { readonly ok: true; readonly quantity: ScalarQuantity }
  | { readonly ok: false; readonly code: 'empty' | 'number' | 'range' | 'configuration'; readonly message: string };

/** Parse only decimal/scientific notation, without rounding, clamping or empty-to-zero coercion. */
export function parseQuantityInput(text: string, range: QuantityRange): QuantityInputResult {
  if (!Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min > range.max) {
    return { ok: false, code: 'configuration', message: '입력 범위가 올바르지 않습니다.' };
  }
  const source = text.trim();
  if (!source) return { ok: false, code: 'empty', message: '값을 입력해 주세요.' };
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(source)) {
    return { ok: false, code: 'number', message: '유한한 숫자를 입력해 주세요. 예: 1.5 또는 1e-3' };
  }
  const value = Number(source);
  if (!Number.isFinite(value) || Object.is(value, -0)) {
    return { ok: false, code: 'number', message: '유한한 숫자를 입력해 주세요. 음의 0은 지원하지 않습니다.' };
  }
  if (value === 0 && /[1-9]/.test(source.split(/[eE]/, 1)[0] ?? '')) {
    return { ok: false, code: 'number', message: '값이 너무 작아 표현할 수 없습니다. 단위와 크기를 확인해 주세요.' };
  }
  if (value < range.min || value > range.max) {
    return {
      ok: false,
      code: 'range',
      message: `${range.min} 이상 ${range.max} 이하 ${range.unit} 값을 입력해 주세요.`
    };
  }
  const quantity: ScalarQuantity = { kind: 'scalar', value, unit: range.unit };
  const result = validateQuantityValue(quantity);
  return result.ok
    ? { ok: true, quantity }
    : { ok: false, code: 'configuration', message: '지원하는 SI 단위인지 확인해 주세요.' };
}

export interface QuantityOptions extends QuantityRange {
  readonly id: string;
  readonly label: string;
  readonly symbol: string;
  readonly meaning: string;
  readonly defaultValue: number;
  readonly value?: number;
  readonly disabled?: boolean;
  readonly onChange?: (result: QuantityInputResult) => void;
}

export interface QuantityControl extends InputControl {
  read(): QuantityInputResult;
  setValue(value: number): void;
}

function checkedValue(value: number, range: QuantityRange): QuantityInputResult & { readonly ok: true } {
  // String(-0) loses its sign; reject before serializing to the visible control.
  const parsed = parseQuantityInput(Object.is(value, -0) ? '-0' : String(value), range);
  if (!parsed.ok) throw new RangeError(parsed.message);
  return parsed;
}

/** S05 controls accept canonical SI units; display-unit adapters belong to their tested integration stages. */
export function createQuantity(document: Document, options: QuantityOptions): QuantityControl {
  checkedValue(options.defaultValue, options);
  const initial = checkedValue(options.value ?? options.defaultValue, options);
  const field = createInput(document, {
    id: options.id,
    label: `${options.label} · ${options.symbol} (${options.unit})`,
    value: String(initial.quantity.value),
    help: `${options.meaning} 범위: ${options.min}–${options.max} ${options.unit}. 기본값: ${options.defaultValue} ${options.unit}.`,
    required: true,
    disabled: options.disabled ?? false,
    onInput() {
      const parsed = read();
      options.onChange?.(parsed);
    }
  });
  field.element.classList.add('ds-quantity');
  field.input.inputMode = 'decimal';
  field.input.autocomplete = 'off';
  field.element.querySelector('.ds-field__help')?.classList.add('ds-quantity__meta');

  function read(): QuantityInputResult {
    const parsed = parseQuantityInput(field.input.value, options);
    field.setError(parsed.ok ? '' : parsed.message);
    return parsed;
  }

  return {
    ...field,
    read,
    setValue(value) {
      const parsed = checkedValue(value, options);
      field.input.value = String(parsed.quantity.value);
      field.setError('');
    }
  };
}
