import { issue, type ContractIssue } from './validation';

export type UnknownRecord = Record<string, unknown>;
export const isRecord = (value: unknown): value is UnknownRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
export const isToken = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
export const isFieldName = (value: string): boolean => /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value);

export function invalid(issues: ContractIssue[], path: string, message: string): void {
  issues.push(issue('invalid-value', path, message));
}

/** Only call after inspectSafeData, which rejects accessors and unusual prototypes. */
export function fields(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  path: string,
  issues: ContractIssue[]
): value is UnknownRecord {
  if (!isRecord(value)) {
    invalid(issues, path, 'Expected an object.');
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!required.includes(key) && !optional.includes(key)) {
      issues.push(
        issue(
          'unknown-field',
          `${path}.${key}`,
          'Unknown fields must be corrected or kept in the original file.',
          'keep-original'
        )
      );
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) invalid(issues, `${path}.${key}`, 'Required field is missing.');
  }
  return true;
}

export function token(value: unknown, path: string, issues: ContractIssue[]): void {
  if (!isToken(value)) invalid(issues, path, 'Expected an opaque ASCII identifier or version (1–128 characters).');
}

export function integer(value: unknown, min: number, max: number, path: string, issues: ContractIssue[]): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    invalid(issues, path, `Expected an integer between ${min} and ${max}.`);
  }
}
