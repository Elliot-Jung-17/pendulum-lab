import { findUnitSummary } from '../../../content/learn/curriculum';
import { learnModules } from '../../../content/learn/modules';
import type { LearnUnit, UnitSummary } from './schema';
import { validateLearnUnit } from './validation';

export type LearnLoadResult =
  | { readonly status: 'ready'; readonly unit: LearnUnit }
  | { readonly status: 'planned'; readonly summary: UnitSummary }
  | { readonly status: 'missing' }
  | { readonly status: 'cancelled' }
  | { readonly status: 'error'; readonly message: string };
export interface LearnLoadOptions {
  readonly signal?: AbortSignal;
  readonly importUnit?: () => Promise<{ default: unknown }>;
}

/** Only declared IDs can load chunks. Aborting detaches the caller even if the network never settles. */
export async function loadLearnUnit(
  courseId: string,
  unitId: string,
  options: LearnLoadOptions = {}
): Promise<LearnLoadResult> {
  if (options.signal?.aborted) return { status: 'cancelled' };
  const summary = findUnitSummary(courseId, unitId);
  if (!summary) return { status: 'missing' };
  if (summary.availability === 'planned') return { status: 'planned', summary };
  const importUnit = options.importUnit ?? learnModules[`${courseId}/${unitId}`];
  if (!importUnit)
    return { status: 'error', message: '단원 파일이 등록되지 않았습니다. 과정 목록으로 돌아가거나 다시 시도하세요.' };
  return new Promise<LearnLoadResult>((resolve) => {
    let settled = false;
    const finish = (result: LearnLoadResult): void => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener('abort', cancel);
      resolve(result);
    };
    const cancel = () => finish({ status: 'cancelled' });
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) {
      cancel();
      return;
    }
    Promise.resolve()
      .then(importUnit)
      .then((module) => {
        if (settled) return;
        // Bundlers may expose trusted module live bindings as accessors. The exported
        // content itself is still copied and checked as inert data by the validator.
        if (!module || typeof module !== 'object') throw new Error('Invalid module export');
        const checked = validateLearnUnit(module.default);
        if (!checked.ok || checked.value.courseId !== courseId || checked.value.id !== unitId) {
          finish({
            status: 'error',
            message: '단원 콘텐츠 검증에 실패했습니다. 저장된 진도를 유지하고 과정 목록으로 돌아가세요.'
          });
        } else finish({ status: 'ready', unit: checked.value });
      })
      .catch(() =>
        finish({ status: 'error', message: '단원을 불러오지 못했습니다. 연결을 확인하고 다시 시도하세요.' })
      );
  });
}
