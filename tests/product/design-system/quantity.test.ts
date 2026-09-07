import { describe, expect, it } from 'vitest';
import { CANONICAL_UNITS } from '../../../src/product/contracts/quantities';
import { parseQuantityInput, type QuantityRange } from '../../../src/product/design-system/quantity';

const lengthRange: QuantityRange = { unit: 'm', min: 0, max: 10 };

describe('S05 canonical quantity input', () => {
  it.each(['', ' ', '\t\n'])('keeps missing values invalid rather than coercing %j to zero', (text) => {
    expect(parseQuantityInput(text, lengthRange)).toMatchObject({ ok: false, code: 'empty' });
  });

  it.each(['NaN', 'Infinity', '-Infinity', '1e309', '0x10', '0b10', '1,5', '1 m', '1e', '--1', '-0'])(
    'rejects unsupported, nonfinite and lossy numeric input %j',
    (text) => {
      expect(parseQuantityInput(text, lengthRange)).toMatchObject({ ok: false, code: 'number' });
    }
  );

  it.each([
    ['0', 0],
    ['10', 10],
    ['1.25', 1.25],
    ['.5', 0.5],
    ['1.', 1],
    ['+1.5', 1.5],
    [' 1e-3 ', 0.001]
  ])('accepts decimal/scientific notation and inclusive boundaries %j', (text, value) => {
    expect(parseQuantityInput(String(text), lengthRange)).toEqual({
      ok: true,
      quantity: { kind: 'scalar', value, unit: 'm' }
    });
  });

  it.each(['-0.00001', '10.00001'])('rejects out-of-range values without clamping %j', (text) => {
    expect(parseQuantityInput(text, lengthRange)).toMatchObject({ ok: false, code: 'range' });
  });

  it('preserves negative values, explicit angles and winding when the declared range allows them', () => {
    const value = -8 * Math.PI;
    expect(parseQuantityInput(String(value), { min: -100, max: 100, unit: 'rad' })).toEqual({
      ok: true,
      quantity: { kind: 'scalar', value, unit: 'rad' }
    });
  });

  it.each(['1e-400', '-1e-400', '1e-324', '-1e-324'])(
    'rejects nonzero underflow without replacing %j by zero',
    (text) => {
      expect(parseQuantityInput(text, { unit: 'm', min: -1, max: 1 })).toMatchObject({ ok: false, code: 'number' });
    }
  );

  it.each([Number.MIN_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE])(
    'preserves the representable finite range at %j',
    (value) => {
      expect(parseQuantityInput(String(value), { unit: 'm', min: -Number.MAX_VALUE, max: Number.MAX_VALUE })).toEqual({
        ok: true,
        quantity: { kind: 'scalar', value, unit: 'm' }
      });
    }
  );

  it('accepts true zero even when its exponent is very small', () => {
    expect(parseQuantityInput('0.000e-400', lengthRange)).toEqual({
      ok: true,
      quantity: { kind: 'scalar', value: 0, unit: 'm' }
    });
  });

  it('uses every canonical unit from S03 without conversions', () => {
    for (const unit of CANONICAL_UNITS) {
      expect(parseQuantityInput('1.25', { unit, min: 0, max: 2 })).toEqual({
        ok: true,
        quantity: { kind: 'scalar', value: 1.25, unit }
      });
    }
  });

  it.each([
    { unit: 'm', min: NaN, max: 10 },
    { unit: 'm', min: 0, max: Infinity },
    { unit: 'm', min: 10, max: 0 },
    { unit: 'deg', min: 0, max: 10 }
  ])('rejects invalid ranges and units %j', (range) => {
    expect(parseQuantityInput('1', range as QuantityRange)).toMatchObject({ ok: false, code: 'configuration' });
  });
});
