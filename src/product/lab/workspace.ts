import { element, link, pageHeading } from '../app/dom';
import { createButton, createProgress, createSection } from '../design-system/primitives';
import { createTabs } from '../design-system/tabs';
import type { SystemDefinition } from '../contracts/catalog';
import type { ExperimentStateV1 } from '../contracts/experiment';
import { createLabModel, type LabModel, type LabStatus } from './model';
import { MOCK_TOTAL_TICKS } from './mock-adapter';
import { createInspector } from './inspector';
import { createAnalysisDock } from './analysis-dock';
import { createTrayExport } from './tray-export';
import { familyNames } from './library';

const sessions = new WeakMap<Document, Map<string, LabModel>>();
const labels: Record<LabStatus, string> = {
  empty: '시스템 선택 대기',
  ready: '시험 실행 준비 완료',
  preparing: '시험 실행 준비 중',
  running: '시험 실행 중',
  paused: '일시정지',
  completed: '시험 실행 완료',
  cancelled: '시험 실행 취소됨',
  error: '시험 실행 오류'
};

export function createWorkspace(document: Document, system: SystemDefinition, experiment?: ExperimentStateV1) {
  let session = sessions.get(document);
  if (!session) {
    session = new Map();
    sessions.set(document, session);
  }
  const key = experiment ? `${system.id}:${JSON.stringify(experiment)}` : system.id;
  let cached = session.get(key);
  if (!cached) {
    cached = createLabModel({ systemId: system.id, ...(experiment ? { experiment } : {}) });
    session.set(key, cached);
  }
  const model = cached;
  const view = element(document, 'div', 'product-page product-lab-page lab-workspace');
  const back = link(document, '시스템 라이브러리', '#/lab');
  view.append(
    back,
    element(document, 'p', 'product-eyebrow', `LAB · ${familyNames[system.family]}`),
    pageHeading(document, system.name.ko),
    element(document, 'p', 'product-lead', system.description.ko),
    element(
      document,
      'p',
      'lab-preview-note',
      '시험 실행 미리보기 · 조립과 실행 흐름을 확인하는 화면입니다. 움직임이나 분석 수치를 계산하지 않습니다.'
    )
  );
  const help = element(
    document,
    'p',
    'lab-muted',
    '시스템별 설정은 현재 페이지에서 유지됩니다. 다른 화면으로 이동하면 실행을 취소합니다. 새로고침하면 설정과 보관함이 초기화됩니다.'
  );
  view.append(help, link(document, '기존 앱에서 실험하기', './app.html'));
  if (experiment) {
    const shared = createSection(document, { id: 'lab-shared', title: '공유된 실험 설정을 확인했습니다' });
    shared.body.append(
      element(document, 'p', '', `모델 버전 ${experiment.modelVersion} · 분석 설정 ${experiment.analyses.length}개`),
      element(
        document,
        'p',
        '',
        '공유 설정은 원본 형태로 별도 보존합니다. 아래 시험 설정에 적용하거나 물리 계산을 실행하지 않았습니다.'
      )
    );
    view.append(shared.element);
  }
  const run = createSection(document, { id: 'lab-run-bar', title: '실행 제어' });
  const status = element(document, 'p', 'lab-run-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-atomic', 'true');
  const error = element(document, 'p', 'ds-field__error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const actions = element(document, 'div', 'lab-run-actions');
  const start = createButton(document, {
    label: '시험 실행',
    onClick: () => {
      model.run();
    }
  });
  const pause = createButton(document, {
    label: '일시정지',
    variant: 'secondary',
    onClick: () => {
      model.pause();
    }
  });
  const step = createButton(document, {
    label: '한 단계',
    variant: 'secondary',
    onClick: () => {
      model.step();
    }
  });
  const reset = createButton(document, {
    label: '처음으로',
    variant: 'secondary',
    onClick: () => {
      model.reset();
    }
  });
  const cancel = createButton(document, {
    label: '실행 취소',
    variant: 'secondary',
    onClick: () => {
      model.cancel();
    }
  });
  actions.append(start, pause, step, reset, cancel);
  run.body.append(status, error, actions);
  view.append(run.element);
  const preview = createSection(document, {
    id: 'lab-preview',
    title: '작업 공간',
    description: '설정 → 실행 → 분석 구성 → 보관·내보내기'
  });
  const progress = createProgress(document, {
    id: 'lab-run-progress',
    label: '시험 실행 진행',
    max: MOCK_TOTAL_TICKS,
    value: 0
  });
  // The run status announces lifecycle changes; ticking counters remain visual.
  progress.element.querySelector('[role="status"]')?.removeAttribute('role');
  const summary = element(document, 'dl', 'product-detail-list');
  const values = element(document, 'dd', '');
  const analyses = element(document, 'dd', '');
  summary.append(
    element(document, 'dt', '', '편집 가능한 설정'),
    values,
    element(document, 'dt', '', '선택한 분석'),
    analyses
  );
  const scene = element(document, 'div', 'lab-flow-preview');
  scene.setAttribute('aria-label', '실험 조립 순서');
  for (const label of ['01 시스템', '02 조건', '03 시험 실행', '04 기록'])
    scene.append(element(document, 'span', '', label));
  preview.body.append(
    scene,
    progress.element,
    summary,
    element(
      document,
      'p',
      'lab-muted',
      '진행 횟수는 화면 동작을 확인하기 위한 값입니다. 물리 시간·궤적·에너지로 해석할 수 없습니다.'
    )
  );
  const diagnostics = element(document, 'details', 'lab-details');
  diagnostics.append(element(document, 'summary', '', '오류 복구 체험'));
  const fail = createButton(document, {
    label: '시험 오류 재현',
    variant: 'secondary',
    onClick: () => {
      model.simulateError();
    }
  });
  diagnostics.append(
    element(document, 'p', '', '시험 실행 오류를 표시한 뒤 같은 설정으로 다시 실행할 수 있습니다.'),
    fail
  );
  preview.body.append(diagnostics);
  const inspector = createInspector(document, system, model);
  const dock = createAnalysisDock(document, system, model);
  const trayExport = createTrayExport(document, system, model);
  const tabs = createTabs(document, {
    id: 'lab-panels',
    label: '실험실 패널',
    items: [
      { id: 'workspace', label: '작업 공간', content: preview.element },
      { id: 'inspector', label: '조건', content: inspector.element },
      { id: 'analysis', label: '분석', content: dock.element },
      { id: 'tray', label: '보관함', content: trayExport.tray },
      { id: 'export', label: '내보내기', content: trayExport.exports }
    ]
  });
  view.append(tabs.element);
  function update(): void {
    const state = model.state;
    const busy = state.status === 'running' || state.status === 'preparing';
    const invalid = Object.keys(state.fieldErrors).length > 0;
    view.dataset.labStatus = state.status;
    const message = invalid ? '입력한 조건을 수정하세요.' : labels[state.status];
    if (status.textContent !== message) status.textContent = message;
    error.hidden = !state.error;
    error.textContent = state.error;
    start.textContent = state.status === 'paused' ? '시험 실행 계속' : '시험 실행';
    start.disabled = busy || invalid;
    pause.disabled = state.status !== 'running';
    step.disabled = busy || invalid;
    cancel.disabled = !['preparing', 'running', 'paused'].includes(state.status);
    fail.disabled = busy || invalid;
    progress.setValue(state.status === 'preparing' ? null : state.tick, `${state.tick}/${MOCK_TOTAL_TICKS} 시험 단계`);
    values.textContent = `${Object.keys(state.fields).length}개`;
    analyses.textContent = `${state.analysisIds.length}개`;
    inspector.update();
    dock.update();
    trayExport.update();
  }
  const unsubscribe = model.subscribe(update);
  update();
  return {
    element: view,
    dispose() {
      unsubscribe();
      model.cancel();
      tabs.dispose();
      trayExport.dispose();
    }
  };
}
