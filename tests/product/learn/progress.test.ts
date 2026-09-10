import { describe, expect, it, vi } from 'vitest';
import { getSystem, selectLabCapabilities, selectSystems } from '../../../src/product/catalog/selectors';
import {
  answerLearnCheckpoint,
  createLearnProgressStore,
  emptyLearnProgress,
  LEARN_PROGRESS_KEY_PREFIX,
  LEARN_PROGRESS_LIMITS,
  LEARN_PROGRESS_SCHEMA,
  type LearnProgressResult,
  type LearnProgressStorage,
  type LearnUnitProgress,
  type ProgressUnit
} from '../../../src/product/learn/progress';

const unit: ProgressUnit = {
  id: '1.1',
  contentVersion: 1,
  checks: [
    { id: 'coordinates', options: [{ id: 'one' }, { id: 'two' }], correctOptionId: 'two' },
    { id: 'position', options: [{ id: 'above' }, { id: 'below' }], correctOptionId: 'below' }
  ]
};
const key = `${LEARN_PROGRESS_KEY_PREFIX}${unit.id}`;
const storedCheck = (checkpointId = 'coordinates', selectedOptionId = 'two', attempts = 1, correct = true) => ({
  checkpointId,
  selectedOptionId,
  attempts,
  correct
});
const storedVersion = (contentVersion = 1, checks: unknown[] = [storedCheck()]) => ({ contentVersion, checks });
const envelope = (versions: unknown[] = [storedVersion()], unitId = unit.id) => ({
  schema: LEARN_PROGRESS_SCHEMA,
  unitId,
  versions
});

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage: LearnProgressStorage = {
    getItem: vi.fn((id) => values.get(id) ?? null),
    setItem: vi.fn((id, value) => {
      values.set(id, value);
    }),
    removeItem: vi.fn((id) => {
      values.delete(id);
    })
  };
  return { values, storage, store: createLearnProgressStore(storage) };
}
function success(result: LearnProgressResult) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.code);
  return result;
}
function rejected(result: LearnProgressResult, code: string, original: string | null) {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.code).toBe(code);
    expect(result.original).toBe(original);
    expect(result.message.length).toBeGreaterThan(0);
  }
}

describe('Learn progress storage isolation and restoration', () => {
  it('does not read or mutate storage while constructing the store', () => {
    const { storage } = memoryStorage();
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it('visiting an unanswered unit reads only its own key and does not create progress', () => {
    const { store, storage, values } = memoryStorage({ legacy: 'keep', 'pendulum-product/planar/v1/double': 'run' });
    const loaded = success(store.load(unit));
    expect(loaded).toMatchObject({
      original: null,
      progress: { status: 'not-started', completedChecks: 0, totalChecks: 2, previousVersions: [] }
    });
    expect(
      loaded.progress.checks.every((check) => check.selectedOptionId === null && check.attempts === 0 && !check.correct)
    ).toBe(true);
    expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(key);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect([...values.entries()]).toEqual([
      ['legacy', 'keep'],
      ['pendulum-product/planar/v1/double', 'run']
    ]);
  });

  it('records wrong answers, retries, completion and reload without mutating the unit', () => {
    const before = JSON.stringify(unit);
    const { store, storage } = memoryStorage();
    const wrong = success(store.submit(unit, 'coordinates', 'one')).progress;
    expect(wrong).toMatchObject({ status: 'in-progress', completedChecks: 0 });
    expect(wrong.checks[0]).toMatchObject({ attempts: 1, selectedOptionId: 'one', correct: false });
    success(store.submit(unit, 'coordinates', 'two'));
    const completed = success(store.submit(unit, 'position', 'below'));
    expect(completed.progress).toMatchObject({ status: 'complete', completedChecks: 2 });
    expect(completed.progress.checks[0]?.attempts).toBe(2);
    expect(success(createLearnProgressStore(storage).load(unit))).toEqual(completed);
    expect(JSON.stringify(unit)).toBe(before);
    expect(JSON.parse(completed.original!)).toEqual(
      envelope([storedVersion(1, [storedCheck('coordinates', 'two', 2), storedCheck('position', 'below')])])
    );
  });

  it('recomputes completion from the latest answer when a completed check is answered incorrectly', () => {
    const { store } = memoryStorage();
    success(store.submit(unit, 'coordinates', 'two'));
    success(store.submit(unit, 'position', 'below'));
    expect(success(store.submit(unit, 'position', 'above')).progress).toMatchObject({
      status: 'in-progress',
      completedChecks: 1
    });
  });

  it('derives correctness from current content rather than trusting persisted booleans', () => {
    const original = JSON.stringify(
      envelope([
        storedVersion(1, [storedCheck('coordinates', 'one', 1, true), storedCheck('position', 'below', 1, false)])
      ])
    );
    const { store, values, storage } = memoryStorage({ [key]: original });
    const progress = success(store.load(unit)).progress;
    expect(progress.checks.map((check) => check.correct)).toEqual([false, true]);
    expect(progress.completedChecks).toBe(1);
    expect(values.get(key)).toBe(original);
    expect(storage.setItem).not.toHaveBeenCalled();
    const revisedAnswer = {
      ...unit,
      checks: unit.checks.map((check) => ({
        ...check,
        correctOptionId: check.id === 'coordinates' ? 'one' : check.correctOptionId
      }))
    };
    expect(success(store.load(revisedAnswer)).progress.status).toBe('complete');
  });

  it('retains older versions, marks revised content stale, and starts that version only on an answer', () => {
    const original = JSON.stringify(envelope());
    const revisedUnit = { ...unit, contentVersion: 2 };
    const { store, storage, values } = memoryStorage({ [key]: original });
    expect(success(store.load(revisedUnit)).progress).toMatchObject({
      status: 'stale',
      previousVersions: [1],
      completedChecks: 0
    });
    expect(values.get(key)).toBe(original);
    expect(storage.setItem).not.toHaveBeenCalled();
    const answered = success(store.submit(revisedUnit, 'position', 'below'));
    expect(answered.progress).toMatchObject({ status: 'in-progress', previousVersions: [1] });
    expect(JSON.parse(answered.original!).versions[0]).toEqual(storedVersion());
    expect(success(store.load(unit)).progress.checks[0]?.selectedOptionId).toBe('two');
    expect(success(store.load(unit)).progress.previousVersions).toEqual([2]);
  });

  it('preserves previous-version question IDs even when the current questions differ', () => {
    const original = JSON.stringify(envelope([storedVersion(1, [storedCheck('retired-check', 'retired-option')])]));
    const { store } = memoryStorage({ [key]: original });
    const result = success(store.submit({ ...unit, contentVersion: 2 }, 'coordinates', 'two'));
    expect(JSON.parse(result.original!).versions[0].checks[0]).toEqual(storedCheck('retired-check', 'retired-option'));
  });

  it('preserves a newer content version when an older page records an answer', () => {
    const future = storedVersion(2, [storedCheck('new-check', 'new-option', 7)]);
    const original = JSON.stringify(envelope([future]));
    const { store, values, storage } = memoryStorage({ [key]: original });
    expect(success(store.load(unit)).progress).toMatchObject({ status: 'stale', previousVersions: [2] });
    expect(values.get(key)).toBe(original);
    expect(storage.setItem).not.toHaveBeenCalled();
    const result = success(store.submit(unit, 'coordinates', 'two'));
    expect(JSON.parse(result.original!).versions).toEqual([
      storedVersion(1, [
        storedCheck(),
        { checkpointId: 'position', selectedOptionId: null, attempts: 0, correct: false }
      ]),
      future
    ]);
  });

  it('fresh-reads and merges sequential answers from two tabs', () => {
    const { store: first, storage } = memoryStorage();
    const second = createLearnProgressStore(storage);
    first.load(unit);
    second.load(unit);
    success(first.submit(unit, 'coordinates', 'one'));
    success(second.submit(unit, 'position', 'below'));
    const merged = success(first.submit(unit, 'coordinates', 'two')).progress;
    expect(merged).toMatchObject({ status: 'complete', completedChecks: 2 });
    expect(merged.checks.map((check) => check.attempts)).toEqual([2, 1]);
  });

  it('never changes legacy, lab, another unit, or another schema namespace', () => {
    const foreign = {
      legacy: '{raw}',
      'pendulum-product/planar/v1/double': 'saved-run',
      [`${LEARN_PROGRESS_KEY_PREFIX}1.2`]: 'other-unit',
      'pendulum-product/learn-progress/v2/1.1': 'future-version'
    };
    const { store, values } = memoryStorage(foreign);
    const result = success(store.submit(unit, 'coordinates', 'two'));
    success(store.reset(unit, result.original));
    expect(Object.fromEntries(values)).toEqual(foreign);
  });
});

describe('Learn progress preservation on malformed or unsupported storage', () => {
  const invalidCases: [string, string, string][] = [
    ['malformed JSON', '{broken', 'invalid-data'],
    ['null', 'null', 'invalid-data'],
    ['array root', '[]', 'invalid-data'],
    ['unknown schema', JSON.stringify({ ...envelope(), schema: 'pendulum-learn-progress/v2' }), 'unsupported-schema'],
    ['unknown root field', JSON.stringify({ ...envelope(), capability: 'unlocked' }), 'unknown-fields'],
    ['unknown version field', JSON.stringify(envelope([{ ...storedVersion(), complete: true }])), 'unknown-fields'],
    [
      'unknown check field',
      JSON.stringify(envelope([storedVersion(1, [{ ...storedCheck(), score: 1 }])])),
      'unknown-fields'
    ],
    ['wrong unit', JSON.stringify(envelope(undefined, '1.2')), 'invalid-data'],
    ['missing versions', JSON.stringify({ schema: LEARN_PROGRESS_SCHEMA, unitId: unit.id }), 'invalid-data'],
    ['null version', JSON.stringify({ ...envelope(), versions: [null] }), 'invalid-data'],
    ['zero version', JSON.stringify(envelope([storedVersion(0)])), 'invalid-data'],
    ['fractional version', JSON.stringify(envelope([storedVersion(1.5)])), 'invalid-data'],
    ['unsafe version integer', JSON.stringify(envelope([storedVersion(Number.MAX_SAFE_INTEGER + 1)])), 'invalid-data'],
    ['duplicate version', JSON.stringify(envelope([storedVersion(), storedVersion()])), 'invalid-data'],
    [
      'null check',
      JSON.stringify({ ...envelope(), versions: [{ contentVersion: 1, checks: [null] }] }),
      'invalid-data'
    ],
    ['duplicate check', JSON.stringify(envelope([storedVersion(1, [storedCheck(), storedCheck()])])), 'invalid-data'],
    [
      'negative attempts',
      JSON.stringify(envelope([storedVersion(1, [storedCheck('coordinates', 'two', -1)])])),
      'invalid-data'
    ],
    [
      'fractional attempts',
      JSON.stringify(envelope([storedVersion(1, [storedCheck('coordinates', 'two', 0.5)])])),
      'invalid-data'
    ],
    [
      'over-limit attempts',
      JSON.stringify(
        envelope([storedVersion(1, [storedCheck('coordinates', 'two', LEARN_PROGRESS_LIMITS.attempts + 1)])])
      ),
      'invalid-data'
    ],
    [
      'answer without attempts',
      JSON.stringify(envelope([storedVersion(1, [storedCheck('coordinates', 'two', 0)])])),
      'invalid-data'
    ],
    [
      'null answer with attempts',
      JSON.stringify({
        ...envelope(),
        versions: [{ contentVersion: 1, checks: [{ ...storedCheck(), selectedOptionId: null }] }]
      }),
      'invalid-data'
    ],
    [
      'unknown current check',
      JSON.stringify(envelope([storedVersion(1, [storedCheck('removed')])])),
      'content-mismatch'
    ],
    [
      'unknown current option',
      JSON.stringify(envelope([storedVersion(1, [storedCheck('coordinates', 'removed')])])),
      'content-mismatch'
    ],
    ['reserved identifier', JSON.stringify(envelope([storedVersion(1, [storedCheck('constructor')])])), 'invalid-data'],
    [
      'reserved old-version identifier',
      JSON.stringify(envelope([storedVersion(2, [storedCheck('prototype')])])),
      'invalid-data'
    ],
    [
      'reserved old-version option',
      JSON.stringify(envelope([storedVersion(2, [storedCheck('retired-check', 'constructor')])])),
      'invalid-data'
    ],
    [
      'unknown historical field',
      JSON.stringify(envelope([storedVersion(2, [{ ...storedCheck('retired-check'), note: 'preserve' }])])),
      'unknown-fields'
    ],
    [
      'duplicate JSON key',
      `{"schema":"${LEARN_PROGRESS_SCHEMA}","unitId":"1.1","unitId":"1.1","versions":[]}`,
      'invalid-data'
    ],
    [
      'prototype key',
      `{"schema":"${LEARN_PROGRESS_SCHEMA}","unitId":"1.1","versions":[],"__proto__":{"polluted":true}}`,
      'invalid-data'
    ],
    [
      'escaped prototype key',
      `{"schema":"${LEARN_PROGRESS_SCHEMA}","unitId":"1.1","versions":[],"\\u005f_proto__":{}}`,
      'invalid-data'
    ],
    [
      'too many versions',
      JSON.stringify(envelope(Array.from({ length: 33 }, (_, index) => storedVersion(index + 1, [])))),
      'invalid-data'
    ],
    [
      'too many checks',
      JSON.stringify(
        envelope([
          storedVersion(
            1,
            Array.from({ length: 65 }, (_, index) => storedCheck(`check-${index}`))
          )
        ])
      ),
      'invalid-data'
    ],
    ['over byte limit', ' '.repeat(LEARN_PROGRESS_LIMITS.bytes + 1), 'size-limit'],
    ['multibyte size limit', JSON.stringify({ note: '가'.repeat(22_000) }), 'size-limit']
  ];

  it.each(invalidCases)('keeps the original %s on load and answer', (_name, original, code) => {
    const { store, values, storage } = memoryStorage({ [key]: original });
    rejected(store.load(unit), code, original);
    rejected(store.submit(unit, 'coordinates', 'two'), code, original);
    expect(values.get(key)).toBe(original);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('allows explicit reset of preserved corrupt data with the exact observed original', () => {
    const original = '{corrupt';
    const { store, values } = memoryStorage({ [key]: original, legacy: 'preserve' });
    rejected(store.load(unit), 'invalid-data', original);
    expect(success(store.reset(unit, original)).progress.status).toBe('not-started');
    expect(values.has(key)).toBe(false);
    expect(values.get('legacy')).toBe('preserve');
    expect(success(store.submit(unit, 'coordinates', 'two')).progress.completedChecks).toBe(1);
  });

  it('rejects reset when another tab changes, creates or removes the observed record', () => {
    for (const [observed, actual] of [
      [null, 'new'],
      ['old', 'new'],
      ['old', null]
    ] as const) {
      const { store, storage, values } = memoryStorage(actual === null ? {} : { [key]: actual });
      rejected(store.reset(unit, observed), 'storage-changed', actual);
      expect(values.get(key) ?? null).toBe(actual);
      expect(storage.removeItem).not.toHaveBeenCalled();
    }
  });
});

describe('Learn progress storage and definition limits', () => {
  it('reports inaccessible or absent storage without effects', () => {
    const absent = createLearnProgressStore(undefined);
    rejected(absent.load(unit), 'storage-unavailable', null);
    rejected(absent.submit(unit, 'coordinates', 'two'), 'storage-unavailable', null);
    rejected(absent.reset(unit, null), 'storage-unavailable', null);
    const { store, storage } = memoryStorage();
    vi.mocked(storage.getItem).mockImplementation(() => {
      throw new Error('SecurityError');
    });
    rejected(store.load(unit), 'storage-unavailable', null);
    rejected(store.submit(unit, 'coordinates', 'two'), 'storage-unavailable', null);
    rejected(store.reset(unit, null), 'storage-unavailable', null);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it('reports quota or removal failures and retains the original record', () => {
    const original = JSON.stringify(envelope());
    const { store, storage, values } = memoryStorage({ [key]: original });
    vi.mocked(storage.setItem).mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    rejected(store.submit(unit, 'position', 'below'), 'write-failed', original);
    expect(values.get(key)).toBe(original);
    vi.mocked(storage.removeItem).mockImplementation(() => {
      throw new Error('SecurityError');
    });
    rejected(store.reset(unit, original), 'write-failed', original);
    expect(values.get(key)).toBe(original);
  });

  it('rejects nonexistent checkpoints and options without saving or creating a version', () => {
    const { store, storage, values } = memoryStorage();
    for (const [checkpoint, option] of [
      ['missing', 'two'],
      ['coordinates', 'missing'],
      ['constructor', 'two'],
      ['coordinates', '__proto__']
    ]) {
      rejected(store.submit(unit, checkpoint!, option!), 'invalid-answer', null);
    }
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(values.size).toBe(0);
  });

  const invalidUnits: unknown[] = [
    null,
    undefined,
    [],
    {},
    Object.create({ ...unit }),
    { ...unit, id: '../legacy' },
    { ...unit, id: 'constructor' },
    { ...unit, id: '__proto__' },
    { ...unit, id: 'a'.repeat(97) },
    { ...unit, contentVersion: 0 },
    { ...unit, contentVersion: Number.MAX_SAFE_INTEGER + 1 },
    { ...unit, checks: null },
    { ...unit, checks: {} },
    { ...unit, checks: [] },
    { ...unit, checks: [null] },
    { ...unit, checks: Array(1) },
    { ...unit, checks: [unit.checks[0], unit.checks[0]] },
    { ...unit, checks: [{ ...unit.checks[0], options: null }] },
    { ...unit, checks: [{ ...unit.checks[0], options: [null, { id: 'two' }] }] },
    { ...unit, checks: [{ ...unit.checks[0], options: [undefined, { id: 'two' }] }] },
    { ...unit, checks: [{ ...unit.checks[0], options: [{ id: 'two' }, { id: 'two' }] }] },
    { ...unit, checks: [{ ...unit.checks[0], correctOptionId: 'missing' }] },
    { ...unit, checks: [{ ...unit.checks[0], options: [{ id: 'constructor' }, { id: 'two' }] }] },
    { ...unit, checks: Array.from({ length: 65 }, (_, index) => ({ ...unit.checks[0], id: `check-${index}` })) }
  ];
  it.each(invalidUnits.map((value, index) => [index, value] as const))(
    'rejects malformed unit definition %s without reading storage',
    (_index, value) => {
      const { store, storage } = memoryStorage();
      const malformed = value as ProgressUnit;
      rejected(store.load(malformed), 'invalid-unit', null);
      rejected(store.submit(malformed, 'coordinates', 'two'), 'invalid-unit', null);
      rejected(store.reset(malformed, null), 'invalid-unit', null);
      expect(answerLearnCheckpoint(malformed, emptyLearnProgress(unit), 'coordinates', 'two')).toBeNull();
      expect(storage.getItem).not.toHaveBeenCalled();
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(storage.removeItem).not.toHaveBeenCalled();
    }
  );

  it('accepts null-prototype plain unit definitions and the exact check/option/id limits', () => {
    const edgeUnit = Object.assign(Object.create(null), {
      id: 'a'.repeat(96),
      contentVersion: Number.MAX_SAFE_INTEGER,
      checks: Array.from({ length: 64 }, (_, index) => ({
        id: `check-${index}`,
        options: Array.from({ length: 64 }, (_, option) => ({ id: `option-${option}` })),
        correctOptionId: 'option-63'
      }))
    }) as ProgressUnit;
    const { store } = memoryStorage();
    const result = success(store.submit(edgeUnit, 'check-63', 'option-63'));
    expect(result.progress).toMatchObject({ totalChecks: 64, completedChecks: 1 });
  });

  it('caps attempts at the supported limit without failing the answer', () => {
    const { store } = memoryStorage({
      [key]: JSON.stringify(
        envelope([storedVersion(1, [storedCheck('coordinates', 'one', LEARN_PROGRESS_LIMITS.attempts, false)])])
      )
    });
    const answered = success(store.submit(unit, 'coordinates', 'two')).progress;
    expect(answered.checks[0]).toMatchObject({ attempts: LEARN_PROGRESS_LIMITS.attempts, correct: true });
  });

  it('keeps 32 versions, permits updating a retained version and refuses a 33rd', () => {
    const original = JSON.stringify(envelope(Array.from({ length: 32 }, (_, index) => storedVersion(index + 1, []))));
    const { store, values, storage } = memoryStorage({ [key]: original });
    expect(success(store.load(unit)).progress.previousVersions).toHaveLength(31);
    rejected(store.submit({ ...unit, contentVersion: 33 }, 'coordinates', 'two'), 'version-limit', original);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(values.get(key)).toBe(original);
    expect(success(store.submit(unit, 'coordinates', 'two')).progress.completedChecks).toBe(1);
    expect(JSON.parse(values.get(key)!).versions).toHaveLength(32);
  });

  it('accepts the exact byte limit without writing during load', () => {
    const json = JSON.stringify(envelope());
    const original = json + ' '.repeat(LEARN_PROGRESS_LIMITS.bytes - json.length);
    const { store, storage } = memoryStorage({ [key]: original });
    expect(success(store.load(unit)).original).toBe(original);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('refuses a write that would grow past the byte limit without trimming retained versions', () => {
    const historicalChecks = Array.from({ length: 64 }, (_, index) =>
      storedCheck(`check-${index}-${'a'.repeat(70)}`, 'b'.repeat(90))
    );
    const versions = Array.from({ length: 3 }, (_, index) => storedVersion(index + 2, historicalChecks));
    versions.push(storedVersion(5, historicalChecks.slice(0, 48)));
    const hugeUnit: ProgressUnit = {
      ...unit,
      checks: Array.from({ length: 64 }, (_, index) => ({
        id: `check-${index}-${'a'.repeat(70)}`,
        options: [{ id: 'b'.repeat(90) }, { id: 'other' }],
        correctOptionId: 'b'.repeat(90)
      }))
    };
    const original = JSON.stringify(envelope(versions));
    expect(original.length).toBeLessThan(LEARN_PROGRESS_LIMITS.bytes);
    const { store, values, storage } = memoryStorage({ [key]: original });
    rejected(store.submit(hugeUnit, hugeUnit.checks[0]!.id, 'b'.repeat(90)), 'size-limit', original);
    expect(values.get(key)).toBe(original);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

describe('Learn progress pure fallback and capability separation', () => {
  it('keeps unsaved answers in a caller-owned snapshot after a failed write', () => {
    const { store, storage, values } = memoryStorage();
    vi.mocked(storage.setItem).mockImplementation(() => {
      throw new Error('quota');
    });
    let local = emptyLearnProgress(unit);
    const before = JSON.stringify(local);
    rejected(store.submit(unit, 'coordinates', 'two'), 'write-failed', null);
    const answered = answerLearnCheckpoint(unit, local, 'coordinates', 'two')!;
    expect(JSON.stringify(local)).toBe(before);
    local = answerLearnCheckpoint(unit, answered, 'position', 'below')!;
    expect(local.status).toBe('complete');
    expect(values.size).toBe(0);
    expect(success(store.load(unit)).progress.status).toBe('not-started');
  });

  it('discards another unit/version snapshot and ignores malformed saved answers', () => {
    const foreign = { ...emptyLearnProgress(unit), unitId: '1.2', checks: [storedCheck('position', 'below')] };
    expect(answerLearnCheckpoint(unit, foreign, 'coordinates', 'two')?.completedChecks).toBe(1);
    const stale = { ...foreign, unitId: unit.id, contentVersion: 0 };
    expect(answerLearnCheckpoint(unit, stale, 'coordinates', 'two')?.completedChecks).toBe(1);
    const malformed = {
      ...emptyLearnProgress(unit),
      checks: [null, { ...storedCheck('position', 'below'), attempts: -1 }],
      previousVersions: [1, 2, 2, -1, 'bad']
    } as unknown as LearnUnitProgress;
    const result = answerLearnCheckpoint(unit, malformed, 'coordinates', 'two')!;
    expect(result.completedChecks).toBe(1);
    expect(result.checks[1]).toMatchObject({ selectedOptionId: null, attempts: 0, correct: false });
    expect(result.previousVersions).toEqual([2]);
    expect(
      answerLearnCheckpoint(unit, null as unknown as LearnUnitProgress, 'coordinates', 'two')?.completedChecks
    ).toBe(1);
    expect(answerLearnCheckpoint(unit, result, 'unknown', 'two')).toBeNull();
  });

  it('derives fallback feedback from answers without trusting completion flags or corrupt attempt counts', () => {
    const fabricated = {
      ...emptyLearnProgress(unit),
      status: 'complete',
      completedChecks: 99,
      totalChecks: 99,
      checks: [storedCheck('coordinates', 'one', 1, true), storedCheck('position', 'below', Number.NaN)]
    } as LearnUnitProgress;
    const before = structuredClone(fabricated);
    const result = answerLearnCheckpoint(unit, fabricated, 'coordinates', 'one')!;
    expect(result).toMatchObject({ status: 'in-progress', completedChecks: 0, totalChecks: 2 });
    expect(result.checks).toEqual([
      storedCheck('coordinates', 'one', 2, false),
      { checkpointId: 'position', selectedOptionId: null, attempts: 0, correct: false }
    ]);
    expect(fabricated).toEqual(before);
  });

  it('does not alter system or analysis/integrator availability before, during, after or reset progress', () => {
    const capabilities = () => selectSystems().map((system) => ({ id: system.id, ...selectLabCapabilities(system) }));
    const before = capabilities();
    expect(getSystem('system:double')).toBeDefined();
    const { store } = memoryStorage();
    success(store.load(unit));
    expect(capabilities()).toEqual(before);
    success(store.submit(unit, 'coordinates', 'two'));
    expect(capabilities()).toEqual(before);
    const completed = success(store.submit(unit, 'position', 'below'));
    expect(completed.progress.status).toBe('complete');
    expect(capabilities()).toEqual(before);
    success(store.reset(unit, completed.original));
    expect(capabilities()).toEqual(before);
  });
});
