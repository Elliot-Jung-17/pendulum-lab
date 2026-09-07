import { element } from '../app/dom';
import { createButton, createSection } from '../design-system/primitives';
import { selectLabCapabilities } from '../catalog/selectors';
import type { SystemDefinition } from '../contracts/catalog';
import type { LabModel } from './model';

export function createTrayExport(document: Document, system: SystemDefinition, model: LabModel) {
  const tray = createSection(document, {
    id: 'lab-tray',
    title: '실험 보관함',
    description: '현재 시스템의 시험 설정을 보관하고 다시 비교하세요. 최대 12개이며 페이지 새로고침 전까지 유지됩니다.'
  });
  const notice = element(document, 'p', 'lab-muted');
  notice.setAttribute('role', 'status');
  const save = createButton(document, {
    label: '현재 설정 보관',
    onClick() {
      const id = model.saveToTray();
      notice.textContent = id
        ? '시험 설정을 보관했습니다.'
        : '보관할 수 없습니다. 입력 또는 보관함의 남은 공간을 확인하세요.';
    }
  });
  const list = element(document, 'div', 'lab-tray-list');
  tray.body.append(save, notice, list);
  const exports = createSection(document, {
    id: 'lab-export',
    title: '내보내기',
    description: '현재 설정과 시험 실행 기록을 파일로 내려받습니다. 실제 궤적·분석·그림은 포함되지 않습니다.'
  });
  const exportNotice = element(document, 'p', 'lab-muted');
  exportNotice.setAttribute('role', 'status');
  const urls = new Set<string>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const downloadButtons = selectLabCapabilities(system).exports.map((format) => {
    const button = createButton(document, {
      label: `${format.name} 다운로드`,
      onClick() {
        const text = model.exportSettings();
        if (!text) {
          exportNotice.textContent = '입력을 수정하거나 실행을 멈춘 뒤 다시 시도하세요.';
          return;
        }
        try {
          const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
          urls.add(url);
          const anchor = element(document, 'a', '');
          anchor.href = url;
          anchor.download = `pendulum-mock-${system.id.slice(7)}.json`;
          document.body.append(anchor);
          anchor.click();
          anchor.remove();
          const timer = setTimeout(() => {
            URL.revokeObjectURL(url);
            urls.delete(url);
            timers.delete(timer);
          }, 1000);
          timers.add(timer);
          exportNotice.textContent = '시험 설정 파일을 만들었습니다. 다운로드 목록에서 확인하세요.';
        } catch {
          exportNotice.textContent = '파일을 만들지 못했습니다. 브라우저 다운로드 설정을 확인하고 다시 시도하세요.';
        }
      }
    });
    exports.body.append(element(document, 'p', 'lab-muted', format.description), button);
    return button;
  });
  exports.body.append(exportNotice);
  let signature = '';
  function update(): void {
    const state = model.state;
    const busy = ['preparing', 'running'].includes(state.status);
    const invalid = Object.keys(state.fieldErrors).length > 0;
    save.disabled = busy || invalid || state.tray.length >= 12;
    for (const button of downloadButtons) button.disabled = busy || invalid;
    const next = JSON.stringify([state.tray, busy]);
    if (signature === next) return;
    signature = next;
    list.replaceChildren();
    if (!state.tray.length)
      list.append(
        element(document, 'p', 'lab-empty', '보관된 시험 설정이 없습니다. 조건을 편집한 뒤 현재 설정을 보관하세요.')
      );
    for (const entry of state.tray) {
      const item = element(document, 'article', 'lab-tray-entry');
      item.append(
        element(document, 'h3', '', entry.label),
        element(
          document,
          'p',
          'lab-muted',
          `시험 진행 ${entry.tick}/12 · 분석 ${entry.settings.analysisIds.length}개 · 물리 결과 없음`
        )
      );
      const summary = element(document, 'details', 'lab-details');
      summary.append(element(document, 'summary', '', '보관된 값 보기'));
      const values = element(document, 'dl', 'product-detail-list');
      for (const [key, value] of Object.entries(entry.settings.fields))
        values.append(element(document, 'dt', '', key), element(document, 'dd', '', value));
      summary.append(values);
      item.append(summary);
      const restore = createButton(document, {
        label: '설정 복원',
        variant: 'secondary',
        disabled: busy,
        onClick() {
          model.restoreTray(entry.id);
          notice.textContent = '설정을 복원했습니다. 시험 실행은 처음부터 시작합니다.';
        }
      });
      restore.setAttribute('aria-label', `${entry.label} 설정 복원`);
      const remove = createButton(document, {
        label: '보관 해제',
        variant: 'secondary',
        disabled: busy,
        onClick() {
          model.removeTray(entry.id);
          notice.textContent = '보관한 시험 설정을 제거했습니다.';
          save.focus();
        }
      });
      remove.setAttribute('aria-label', `${entry.label} 보관 해제`);
      const actions = element(document, 'div', 'lab-inline-actions');
      actions.append(restore, remove);
      item.append(actions);
      list.append(item);
    }
  }
  update();
  return {
    tray: tray.element,
    exports: exports.element,
    update,
    dispose() {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    }
  };
}
