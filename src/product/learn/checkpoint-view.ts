import { element } from '../app/dom';
import { createButton } from '../design-system/primitives';
import { textNode } from './blocks';
import {
  answerLearnCheckpoint,
  createLearnProgressStore,
  emptyLearnProgress,
  LEARN_PROGRESS_KEY_PREFIX
} from './progress';
import type { LearnProgressStorage } from './progress';
import type { LearnUnit } from './schema';

export function createCheckpoints(document: Document, unit: LearnUnit) {
  const window = document.defaultView;
  let storage: LearnProgressStorage | undefined;
  try {
    storage = window?.localStorage;
  } catch {
    /* Restricted storage still allows practice. */
  }
  const store = createLearnProgressStore(storage);
  const initial = store.load(unit);
  let progress = initial.ok ? initial.progress : emptyLearnProgress(unit);
  let original = initial.original;
  let memoryOnly = !initial.ok;
  const pendingChoices = new Set<string>();
  const root = element(document, 'section', 'learn-checks learn-section');
  root.append(element(document, 'h2', '', '이해 확인'));
  root.append(
    element(
      document,
      'p',
      '',
      '답을 확인하면 이 브라우저에 진도가 저장됩니다. 정답 여부와 관계없이 모든 과정과 실험실에 접근할 수 있습니다.'
    )
  );
  const progressLabel = element(document, 'label', '', '단원 확인 진도');
  progressLabel.htmlFor = 'learn-check-progress';
  const progressBar = element(document, 'progress', '');
  progressBar.id = 'learn-check-progress';
  progressBar.max = unit.checks.length;
  const progressText = element(document, 'p', 'learn-progress-text');
  const storageStatus = element(document, 'p', 'learn-storage-status');
  storageStatus.setAttribute('role', 'status');
  storageStatus.setAttribute('aria-atomic', 'true');
  storageStatus.textContent = initial.ok ? '진도는 이 브라우저에만 저장됩니다.' : initial.message;
  root.append(progressLabel, progressBar, progressText, storageStatus);

  const controls = unit.checks.map((check, index) => {
    const fieldset = element(document, 'fieldset', 'learn-check');
    fieldset.dataset.learnCheck = check.id;
    fieldset.append(textNode(document, 'legend', '', check.prompt));
    const feedback = element(document, 'p', 'learn-feedback');
    feedback.id = `learn-feedback-${index}`;
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-atomic', 'true');
    const inputs = check.options.map((option) => {
      const label = element(document, 'label', 'learn-option');
      const input = element(document, 'input', '');
      input.type = 'radio';
      input.name = `learn-check-${index}`;
      input.value = option.id;
      input.setAttribute('aria-describedby', feedback.id);
      input.addEventListener('change', () => pendingChoices.add(check.id));
      label.append(input, textNode(document, 'span', '', option.label));
      fieldset.append(label);
      return input;
    });
    const submit = createButton(document, {
      label: '답 확인',
      onClick: () => {
        const optionId = inputs.find((input) => input.checked)?.value;
        if (!optionId) {
          feedback.textContent = '답을 하나 선택한 뒤 확인해 주세요.';
          inputs[0]?.focus();
          return;
        }
        if (!memoryOnly) {
          const result = store.submit(unit, check.id, optionId);
          original = result.original;
          if (result.ok) {
            progress = result.progress;
            storageStatus.textContent = '이 브라우저에 진도를 저장했습니다.';
          } else {
            memoryOnly = true;
            storageStatus.textContent = `${result.message} 이번 화면에서 계속 풀 수 있지만 답은 저장되지 않습니다.`;
          }
        }
        if (memoryOnly) progress = answerLearnCheckpoint(unit, progress, check.id, optionId) ?? progress;
        pendingChoices.delete(check.id);
        refresh();
      }
    });
    fieldset.append(submit, feedback);
    root.append(fieldset);
    return { check, inputs, feedback };
  });

  const resetArea = element(document, 'div', 'learn-reset');
  const confirmation = element(document, 'div', 'learn-reset-confirm');
  confirmation.hidden = true;
  confirmation.append(
    element(document, 'p', '', '이 단원의 모든 버전에 저장된 답과 진도를 지웁니다. 다른 단원 기록은 유지됩니다.')
  );
  let confirmedOriginal: string | null = null;
  const reset = createButton(document, {
    label: '이 단원 진도 초기화',
    variant: 'secondary',
    onClick: () => {
      confirmedOriginal = original;
      confirmation.hidden = false;
      confirm.focus();
    }
  });
  const confirm = createButton(document, {
    label: '초기화',
    variant: 'danger',
    onClick: () => {
      const result = store.reset(unit, confirmedOriginal);
      original = result.original;
      if (result.ok) {
        progress = result.progress;
        memoryOnly = false;
        pendingChoices.clear();
        storageStatus.textContent = '이 단원의 진도를 초기화했습니다.';
        refresh();
      } else storageStatus.textContent = result.message;
      confirmation.hidden = true;
      reset.focus();
    }
  });
  const cancel = createButton(document, {
    label: '초기화 취소',
    variant: 'secondary',
    onClick: () => {
      confirmation.hidden = true;
      reset.focus();
    }
  });
  const actions = element(document, 'div', 'learn-reset-actions');
  actions.append(confirm, cancel);
  confirmation.append(actions);
  resetArea.append(reset, confirmation);
  root.append(resetArea);

  function refresh(): void {
    progressBar.value = progress.completedChecks;
    progressText.textContent = `${progress.completedChecks} / ${progress.totalChecks}개 확인${progress.status === 'complete' ? ' · 샘플 확인 완료' : ''}${memoryOnly ? ' · 저장되지 않은 진도' : ''}`;
    for (const { check, inputs, feedback } of controls) {
      const saved = progress.checks.find((entry) => entry.checkpointId === check.id);
      if (!pendingChoices.has(check.id)) {
        for (const input of inputs) input.checked = input.value === saved?.selectedOptionId;
      }
      const option = check.options.find((entry) => entry.id === saved?.selectedOptionId);
      feedback.textContent = option ? `${option.feedback.ko} ${check.explanation.ko} (${saved!.attempts}회 확인)` : '';
    }
  }
  const onStorage = (event: StorageEvent) => {
    if (event.storageArea !== null && event.storageArea !== storage) return;
    if (event.key !== null && event.key !== `${LEARN_PROGRESS_KEY_PREFIX}${unit.id}`) return;
    const result = store.load(unit);
    original = result.original;
    if (result.ok && !memoryOnly) {
      progress = result.progress;
      refresh();
      storageStatus.textContent = '다른 화면에서 변경한 진도를 불러왔습니다.';
    } else if (!result.ok) {
      memoryOnly = true;
      refresh();
      storageStatus.textContent = result.message;
    } else
      storageStatus.textContent =
        '다른 화면에서 진도가 변경되었습니다. 현재 답은 저장되지 않았습니다. 새로고침하면 저장된 기록을 불러옵니다.';
  };
  window?.addEventListener('storage', onStorage);
  refresh();
  if (initial.ok && initial.progress.status === 'stale')
    storageStatus.textContent = '이전 콘텐츠 버전의 진도를 보존했습니다. 새 버전의 확인 질문을 다시 풀 수 있습니다.';
  return { element: root, dispose: () => window?.removeEventListener('storage', onStorage) };
}
