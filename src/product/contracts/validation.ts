/** Recoverable contract failures never mutate or silently migrate the original input. */
export interface ContractIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
  readonly recovery: 'keep-original' | 'use-supported-version' | 'export-file' | 'correct-input';
}

export type ContractResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: readonly ContractIssue[] };

export function success<T>(value: T): ContractResult<T> {
  return { ok: true, value };
}

export function issue(
  code: string,
  path: string,
  message: string,
  recovery: ContractIssue['recovery'] = 'correct-input'
): ContractIssue {
  return { code, path, message, recovery };
}

export function failure<T = never>(
  code: string,
  path: string,
  message: string,
  recovery: ContractIssue['recovery'] = 'correct-input'
): ContractResult<T> {
  return { ok: false, issues: [issue(code, path, message, recovery)] };
}
