import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { PANEL_IDS, validateUiState } from '../../../src/product/contracts/ui-state';
import { validateExperimentState } from '../../../src/product/contracts/experiment-validation';
import { parseUiState, serializeUiState } from '../../../src/product/persistence/serialization';
import { experimentFixture, uiFixture } from './fixtures';

describe('S03 UI state is separate from scientific configuration', () => {
  it('persists locale, layout and display units with an independent schema', () => {
    const ui = uiFixture();
    expect(validateUiState(JSON.parse(JSON.stringify(ui)))).toEqual({ ok: true, value: ui });
    expect(validateExperimentState(experimentFixture()).ok).toBe(true);
    expect(validateExperimentState({ ...experimentFixture(), ui }).ok).toBe(false);
    expect(validateUiState({ ...ui, experiment: experimentFixture() }).ok).toBe(false);
  });

  it('round trips independently chosen panel layouts without changes to their order', () => {
    fc.assert(
      fc.property(fc.shuffledSubarray([...PANEL_IDS], { minLength: 1 }), (panels) => {
        const ui = { ...uiFixture(), layout: { panels, activePanel: panels[0] } };
        const serialized = serializeUiState(ui);
        expect(serialized.ok).toBe(true);
        if (serialized.ok) expect(parseUiState(serialized.value)).toEqual({ ok: true, value: ui });
      }),
      { numRuns: 60 }
    );
  });

  it('uses deterministic independent UI serialization and rejects corrupt UI files', () => {
    const ui = uiFixture();
    const reordered = Object.fromEntries(Object.entries(ui).reverse());
    expect(serializeUiState(reordered)).toEqual(serializeUiState(ui));
    expect(parseUiState('{"schema":"pendulum-ui/v1",').ok).toBe(false);
    expect(parseUiState(JSON.stringify({ ...ui, schema: 'pendulum-ui/v99' })).ok).toBe(false);
  });

  it.each([
    { schema: 'pendulum-ui/v2' },
    { locale: 'fr' },
    { theme: ['light'] },
    { theme: { toString: 1 } },
    { theme: null },
    { layout: { panels: ['plots', 'plots'], activePanel: 'plots' } },
    { layout: { panels: ['plots'], activePanel: 'simulation' } },
    { layout: { panels: [], activePanel: 'plots' } },
    { displayUnits: { theta: 'degrees' } },
    { layout: { panels: ['plots'], activePanel: 'plots', collapsed: true } }
  ])('rejects unsupported, coerced or inconsistent UI data (%j)', (fields) => {
    expect(validateUiState({ ...uiFixture(), ...fields }).ok).toBe(false);
  });
});
