import { describe, expect, test } from 'vitest';
import {
  gradeOrder,
  gradeBelow,
  runReferenceValidation,
  EXPECTED_ORDER,
  type IntegratorValidation
} from '../src/validation/referenceSuite';

describe('grading helpers', () => {
  test('gradeOrder passes when measured order meets the target (with tolerance)', () => {
    expect(gradeOrder(4.0, 4, false, 1e-6)).toBe(true);
    expect(gradeOrder(3.5, 4, false, 1e-6)).toBe(true); // within 0.6 tolerance
    expect(gradeOrder(3.0, 4, false, 1e-6)).toBe(false);
    expect(gradeOrder(null, 4, false, 1e-6)).toBe(false);
  });

  test('gradeOrder treats a round-off-limited method as passing if it is very accurate', () => {
    expect(gradeOrder(null, 6, true, 1e-13)).toBe(true);
    expect(gradeOrder(null, 6, true, 1e-3)).toBe(false);
  });

  test('gradeBelow requires a finite value strictly below the threshold', () => {
    expect(gradeBelow(0.5, 1)).toBe(true);
    expect(gradeBelow(1, 1)).toBe(false);
    expect(gradeBelow(Infinity, 1e9)).toBe(false);
    expect(gradeBelow(NaN, 1e9)).toBe(false);
  });
});

describe('runReferenceValidation', () => {
  const report = runReferenceValidation();
  const byId = new Map<string, IntegratorValidation>(report.checks.map((c) => [c.id, c]));

  test('covers every registered integrator and reports a summary', () => {
    expect(report.checks.length).toBe(Object.keys(EXPECTED_ORDER).length);
    expect(report.summary.integrators).toBe(report.checks.length);
    expect(report.summary.passed).toBeGreaterThanOrEqual(report.checks.length - 0);
  });

  test('all integrators stay finite (no NaN/Inf blow-ups) on the validation runs', () => {
    for (const c of report.checks) {
      expect(Number.isFinite(c.energy.value)).toBe(true);
      expect(Number.isFinite(c.agreement.value)).toBe(true);
    }
  });

  test('classical methods hit their theoretical convergence order', () => {
    expect(byId.get('euler')!.order.measured).toBeGreaterThan(0.8);
    expect(byId.get('rk2')!.order.measured).toBeGreaterThan(1.7);
    expect(byId.get('rk4')!.order.measured).toBeGreaterThan(3.6);
    expect(byId.get('rkf45')!.order.measured).toBeGreaterThan(4.5);
    expect(byId.get('dopri5')!.order.measured).toBeGreaterThan(4.5);
  });

  test('the reference method (gbs) agrees with itself exactly', () => {
    expect(byId.get('gbs')!.agreement.value).toBe(0);
  });

  test('higher-order methods agree with the reference more tightly than Euler', () => {
    const euler = byId.get('euler')!.agreement.value;
    expect(byId.get('rk4')!.agreement.value).toBeLessThan(euler);
    expect(byId.get('dopri5')!.agreement.value).toBeLessThan(euler);
  });

  test('high-accuracy methods conserve energy on the conservative run', () => {
    expect(byId.get('rk4')!.energy.value).toBeLessThan(1e-2);
    expect(byId.get('dopri5')!.energy.value).toBeLessThan(1e-2);
    expect(byId.get('gbs')!.energy.value).toBeLessThan(1e-2);
  });

  test('every integrator passes its full envelope', () => {
    expect(report.summary.passed).toBe(report.summary.integrators);
  });
});
