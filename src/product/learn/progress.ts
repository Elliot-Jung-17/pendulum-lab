import { parseContractJson } from '../persistence/json';
import { MAX_LEARN_CHECKPOINTS } from './schema';

export const LEARN_PROGRESS_KEY_PREFIX = 'pendulum-product/learn-progress/v1/';
export const LEARN_PROGRESS_SCHEMA = 'pendulum-learn-progress/v1';
export const LEARN_PROGRESS_LIMITS = Object.freeze({
  bytes: 65_536,
  versions: 32,
  checks: MAX_LEARN_CHECKPOINTS,
  attempts: 1_000_000
});

/** A deliberately small storage boundary: no legacy namespace discovery or migration. */
export interface LearnProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ProgressUnit {
  readonly id: string;
  readonly contentVersion: number;
  readonly checks: readonly {
    readonly id: string;
    readonly options: readonly { readonly id: string }[];
    readonly correctOptionId: string;
  }[];
}

export interface LearnCheckProgress {
  readonly checkpointId: string;
  readonly selectedOptionId: string | null;
  readonly attempts: number;
  readonly correct: boolean;
}

export interface LearnUnitProgress {
  readonly unitId: string;
  readonly contentVersion: number;
  readonly status: 'not-started' | 'in-progress' | 'complete' | 'stale';
  readonly checks: readonly LearnCheckProgress[];
  readonly completedChecks: number;
  readonly totalChecks: number;
  readonly previousVersions: readonly number[];
}

export type LearnProgressErrorCode =
  | 'invalid-data'
  | 'unsupported-schema'
  | 'unknown-fields'
  | 'content-mismatch'
  | 'size-limit'
  | 'storage-unavailable'
  | 'write-failed'
  | 'storage-changed'
  | 'invalid-answer'
  | 'invalid-unit'
  | 'version-limit';

export type LearnProgressResult =
  | { readonly ok: true; readonly progress: LearnUnitProgress; readonly original: string | null }
  | {
      readonly ok: false;
      readonly code: LearnProgressErrorCode;
      readonly message: string;
      readonly original: string | null;
    };

interface StoredVersion {
  contentVersion: number;
  checks: LearnCheckProgress[];
}
interface StoredProgress {
  schema: typeof LEARN_PROGRESS_SCHEMA;
  unitId: string;
  versions: StoredVersion[];
}
type Failure = Extract<LearnProgressResult, { ok: false }>;
type ReadResult = { ok: true; value: StoredProgress; original: string | null } | Failure;

const messages: Record<LearnProgressErrorCode, string> = {
  'invalid-data': '저장된 진도를 읽을 수 없습니다. 원본은 보존했습니다. 진도를 초기화하면 다시 저장할 수 있습니다.',
  'unsupported-schema': '지원하지 않는 진도 저장 버전입니다. 원본을 보존했으며 자동 변환하지 않습니다.',
  'unknown-fields': '알 수 없는 진도 항목이 있어 원본을 보존했습니다. 초기화 전 기존 기록을 확인해 주세요.',
  'content-mismatch': '저장된 답과 현재 단원의 확인 질문이 맞지 않습니다. 원본을 보존했습니다.',
  'size-limit': '진도 저장 크기 제한을 넘었습니다. 원본을 보존했으며 이번 답은 저장하지 못했습니다.',
  'storage-unavailable': '브라우저 저장소에 접근할 수 없습니다. 이번 화면의 답은 새로고침하면 사라집니다.',
  'write-failed': '진도를 저장하지 못했습니다. 저장 공간과 브라우저 설정을 확인해 주세요. 기존 기록은 보존했습니다.',
  'storage-changed': '다른 화면에서 진도가 변경되었습니다. 최신 진도를 확인한 뒤 다시 초기화해 주세요.',
  'invalid-answer': '확인 질문과 선택한 답을 다시 확인해 주세요.',
  'invalid-unit': '단원 진도 정의가 올바르지 않습니다. 콘텐츠를 다시 불러와 주세요.',
  'version-limit': '이 단원의 저장 버전 수가 제한에 도달했습니다. 기존 진도를 확인한 뒤 초기화해 주세요.'
};

function failure(code: LearnProgressErrorCode, original: string | null): Failure {
  return { ok: false, code, message: messages[code], original };
}
function identifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-z0-9][a-z0-9.-]{0,95}$/.test(value) &&
    !['constructor', 'prototype', '__proto__'].includes(value)
  );
}
function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
function record(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function unknownKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).some((key) => !allowed.includes(key));
}
function validUnit(unit: unknown): unit is ProgressUnit {
  return (
    record(unit) &&
    identifier(unit.id) &&
    positiveInteger(unit.contentVersion) &&
    Array.isArray(unit.checks) &&
    unit.checks.length > 0 &&
    unit.checks.length <= LEARN_PROGRESS_LIMITS.checks &&
    Array.from(unit.checks).every(
      (check) =>
        record(check) &&
        identifier(check.id) &&
        Array.isArray(check.options) &&
        check.options.length >= 2 &&
        check.options.length <= LEARN_PROGRESS_LIMITS.checks &&
        Array.from(check.options).every((option) => record(option) && identifier(option.id)) &&
        new Set(check.options.map((option) => option.id)).size === check.options.length &&
        check.options.some((option) => option.id === check.correctOptionId)
    ) &&
    new Set(unit.checks.map((check) => check.id)).size === unit.checks.length
  );
}

/** Completion is derived from the current content, never from a stored completion flag. */
function snapshot(unit: ProgressUnit, versions: readonly StoredVersion[]): LearnUnitProgress {
  const current = versions.find((version) => version.contentVersion === unit.contentVersion);
  const checks = unit.checks.map((definition): LearnCheckProgress => {
    const saved = current?.checks.find((check) => check.checkpointId === definition.id);
    return {
      checkpointId: definition.id,
      selectedOptionId: saved?.selectedOptionId ?? null,
      attempts: saved?.attempts ?? 0,
      correct: saved?.selectedOptionId === definition.correctOptionId
    };
  });
  const completedChecks = checks.filter((check) => check.correct).length;
  const previousVersions = versions
    .map((version) => version.contentVersion)
    .filter((version) => version !== unit.contentVersion)
    .sort((left, right) => left - right);
  const status =
    !current && previousVersions.length > 0
      ? 'stale'
      : checks.length > 0 && completedChecks === checks.length
        ? 'complete'
        : checks.some((check) => check.attempts > 0)
          ? 'in-progress'
          : 'not-started';
  return {
    unitId: unit.id,
    contentVersion: unit.contentVersion,
    checks,
    completedChecks,
    totalChecks: checks.length,
    previousVersions,
    status
  };
}

export function emptyLearnProgress(unit: ProgressUnit): LearnUnitProgress {
  if (!validUnit(unit)) throw new TypeError(messages['invalid-unit']);
  return snapshot(unit, []);
}

/** Pure per-page fallback: callers must label this result unsaved when storage fails. */
export function answerLearnCheckpoint(
  unit: ProgressUnit,
  previous: LearnUnitProgress,
  checkpointId: string,
  optionId: string
): LearnUnitProgress | null {
  if (!validUnit(unit)) return null;
  const definition = unit.checks.find((check) => check.id === checkpointId);
  if (!definition?.options.some((option) => option.id === optionId)) return null;
  const baseline =
    record(previous) &&
    previous.unitId === unit.id &&
    previous.contentVersion === unit.contentVersion &&
    Array.isArray(previous.checks) &&
    Array.isArray(previous.previousVersions)
      ? previous
      : emptyLearnProgress(unit);
  const checks = unit.checks.map((check): LearnCheckProgress => {
    const saved = baseline.checks.find((entry) => record(entry) && entry.checkpointId === check.id);
    const savedOption =
      saved && check.options.some((option) => option.id === saved.selectedOptionId) ? saved.selectedOptionId : null;
    const attempts =
      savedOption && saved && Number.isSafeInteger(saved.attempts) && saved.attempts > 0
        ? Math.min(LEARN_PROGRESS_LIMITS.attempts, saved.attempts)
        : 0;
    const selectedOptionId = check.id === checkpointId ? optionId : attempts > 0 ? savedOption : null;
    return {
      checkpointId: check.id,
      selectedOptionId,
      attempts: check.id === checkpointId ? Math.min(LEARN_PROGRESS_LIMITS.attempts, attempts + 1) : attempts,
      correct: selectedOptionId === check.correctOptionId
    };
  });
  const result = snapshot(unit, [{ contentVersion: unit.contentVersion, checks }]);
  const previousVersions = [
    ...new Set(
      baseline.previousVersions.filter((version) => positiveInteger(version) && version !== unit.contentVersion)
    )
  ]
    .sort((left, right) => left - right)
    .slice(0, LEARN_PROGRESS_LIMITS.versions);
  return { ...result, previousVersions };
}

function decode(original: string, unit: ProgressUnit): ReadResult {
  if (
    original.length > LEARN_PROGRESS_LIMITS.bytes ||
    new TextEncoder().encode(original).length > LEARN_PROGRESS_LIMITS.bytes
  )
    return failure('size-limit', original);
  const parsed = parseContractJson(original);
  if (!parsed.ok || !record(parsed.value)) return failure('invalid-data', original);
  const value = parsed.value;
  if (value.schema !== LEARN_PROGRESS_SCHEMA) return failure('unsupported-schema', original);
  if (unknownKeys(value, ['schema', 'unitId', 'versions'])) return failure('unknown-fields', original);
  if (
    value.unitId !== unit.id ||
    !Array.isArray(value.versions) ||
    value.versions.length > LEARN_PROGRESS_LIMITS.versions
  )
    return failure('invalid-data', original);
  const versions: StoredVersion[] = [];
  for (const rawVersion of value.versions) {
    if (!record(rawVersion)) return failure('invalid-data', original);
    if (unknownKeys(rawVersion, ['contentVersion', 'checks'])) return failure('unknown-fields', original);
    if (
      !positiveInteger(rawVersion.contentVersion) ||
      versions.some((version) => version.contentVersion === rawVersion.contentVersion) ||
      !Array.isArray(rawVersion.checks) ||
      rawVersion.checks.length > LEARN_PROGRESS_LIMITS.checks
    )
      return failure('invalid-data', original);
    const checks: LearnCheckProgress[] = [];
    for (const rawCheck of rawVersion.checks) {
      if (!record(rawCheck)) return failure('invalid-data', original);
      if (unknownKeys(rawCheck, ['checkpointId', 'selectedOptionId', 'attempts', 'correct']))
        return failure('unknown-fields', original);
      if (
        !identifier(rawCheck.checkpointId) ||
        checks.some((check) => check.checkpointId === rawCheck.checkpointId) ||
        !(rawCheck.selectedOptionId === null || identifier(rawCheck.selectedOptionId)) ||
        typeof rawCheck.attempts !== 'number' ||
        !Number.isSafeInteger(rawCheck.attempts) ||
        rawCheck.attempts < 0 ||
        rawCheck.attempts > LEARN_PROGRESS_LIMITS.attempts ||
        typeof rawCheck.correct !== 'boolean' ||
        (rawCheck.selectedOptionId === null ? rawCheck.attempts !== 0 || rawCheck.correct : rawCheck.attempts === 0)
      )
        return failure('invalid-data', original);
      if (rawVersion.contentVersion === unit.contentVersion) {
        const definition = unit.checks.find((check) => check.id === rawCheck.checkpointId);
        if (
          !definition ||
          (rawCheck.selectedOptionId !== null &&
            !definition.options.some((option) => option.id === rawCheck.selectedOptionId))
        )
          return failure('content-mismatch', original);
      }
      checks.push({
        checkpointId: rawCheck.checkpointId,
        selectedOptionId: rawCheck.selectedOptionId,
        attempts: rawCheck.attempts,
        correct: rawCheck.correct
      });
    }
    versions.push({ contentVersion: rawVersion.contentVersion, checks });
  }
  return { ok: true, original, value: { schema: LEARN_PROGRESS_SCHEMA, unitId: unit.id, versions } };
}

/**
 * Each unit owns one key; versions are retained inside it. Fresh reads on every answer
 * merge sequential edits from other tabs without overwriting another unit's progress.
 * localStorage has no compare-and-swap: simultaneous edits to the same unit remain
 * last-writer-wins. A storage-event listener can reload through the read-only load API.
 */
export function createLearnProgressStore(storage: LearnProgressStorage | undefined) {
  function read(unit: ProgressUnit): ReadResult {
    if (!validUnit(unit)) return failure('invalid-unit', null);
    if (!storage) return failure('storage-unavailable', null);
    let original: string | null;
    try {
      original = storage.getItem(`${LEARN_PROGRESS_KEY_PREFIX}${unit.id}`);
    } catch {
      return failure('storage-unavailable', null);
    }
    return original === null
      ? { ok: true, original, value: { schema: LEARN_PROGRESS_SCHEMA, unitId: unit.id, versions: [] } }
      : decode(original, unit);
  }

  return {
    load(unit: ProgressUnit): LearnProgressResult {
      const result = read(unit);
      return result.ok
        ? { ok: true, progress: snapshot(unit, result.value.versions), original: result.original }
        : result;
    },
    submit(unit: ProgressUnit, checkpointId: string, optionId: string): LearnProgressResult {
      const result = read(unit);
      if (!result.ok) return result;
      const progress = answerLearnCheckpoint(unit, snapshot(unit, result.value.versions), checkpointId, optionId);
      if (!progress) return failure('invalid-answer', result.original);
      const versions = result.value.versions.filter((version) => version.contentVersion !== unit.contentVersion);
      if (versions.length >= LEARN_PROGRESS_LIMITS.versions) return failure('version-limit', result.original);
      versions.push({ contentVersion: unit.contentVersion, checks: [...progress.checks] });
      versions.sort((left, right) => left.contentVersion - right.contentVersion);
      const original = JSON.stringify({ ...result.value, versions });
      if (original.length > LEARN_PROGRESS_LIMITS.bytes) return failure('size-limit', result.original);
      try {
        storage!.setItem(`${LEARN_PROGRESS_KEY_PREFIX}${unit.id}`, original);
      } catch {
        return failure('write-failed', result.original);
      }
      return { ok: true, progress, original };
    },
    /** Explicit user action only. The caller confirms removal of all versions for this unit. */
    reset(unit: ProgressUnit, expectedOriginal: string | null): LearnProgressResult {
      if (!validUnit(unit)) return failure('invalid-unit', null);
      if (!storage) return failure('storage-unavailable', null);
      const key = `${LEARN_PROGRESS_KEY_PREFIX}${unit.id}`;
      let original: string | null;
      try {
        original = storage.getItem(key);
      } catch {
        return failure('storage-unavailable', null);
      }
      if (original !== expectedOriginal) return failure('storage-changed', original);
      try {
        storage.removeItem(key);
      } catch {
        return failure('write-failed', original);
      }
      return { ok: true, progress: emptyLearnProgress(unit), original: null };
    }
  };
}
