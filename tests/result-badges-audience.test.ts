import { describe, expect, it } from 'vitest';
import { RESULT_BADGES, classifyEstimate, classifyExport, classifyValidation } from '../src/app/resultBadges';
import { AUDIENCE_MODES, normalizeAudienceMode, visibleRailSections } from '../src/app/audienceMode';

describe('result badge classification', () => {
  it('defines all five levels with labels and descriptions', () => {
    const levels = ['visual-only', 'finite-time-estimate', 'validated', 'publication-ready', 'caveat'] as const;
    for (const level of levels) {
      expect(RESULT_BADGES[level].label.length).toBeGreaterThan(3);
      expect(RESULT_BADGES[level].description.length).toBeGreaterThan(10);
      expect(RESULT_BADGES[level].level).toBe(level);
    }
  });

  it('finite-time estimates stay estimates unless a validity problem demotes them', () => {
    expect(classifyEstimate({ uncertainty: 0.01 })).toBe('finite-time-estimate');
    expect(classifyEstimate({ validityProblem: 'slack phases dominate' })).toBe('caveat');
  });

  it('validation outcomes map pass→validated, fail→caveat, empty→visual-only', () => {
    expect(classifyValidation(20, 0)).toBe('validated');
    expect(classifyValidation(19, 1)).toBe('caveat');
    expect(classifyValidation(0, 0)).toBe('visual-only');
  });

  it('exports are publication-ready only with hash AND validation', () => {
    expect(classifyExport({ hash: 'abc123', validated: true })).toBe('publication-ready');
    expect(classifyExport({ hash: 'abc123', validated: false })).toBe('finite-time-estimate');
    expect(classifyExport({})).toBe('visual-only');
  });
});

describe('audience modes', () => {
  it('beginner sees only the simulator section', () => {
    expect(visibleRailSections('beginner')).toEqual(['sim']);
  });

  it('student adds analysis and validation but not chaos/governance', () => {
    const sections = visibleRailSections('student');
    expect(sections).toContain('analysis');
    expect(sections).toContain('check');
    expect(sections).not.toContain('chaos');
    expect(sections).not.toContain('govern');
  });

  it('research sees everything', () => {
    expect(visibleRailSections('research')).toEqual(['sim', 'analysis', 'chaos', 'check', 'govern']);
  });

  it('normalizes unknown values to research (no accidental lockout)', () => {
    expect(normalizeAudienceMode('beginner')).toBe('beginner');
    expect(normalizeAudienceMode('bogus')).toBe('research');
    expect(normalizeAudienceMode(null)).toBe('research');
  });

  it('every mode has a label and description', () => {
    for (const meta of Object.values(AUDIENCE_MODES)) {
      expect(meta.label.length).toBeGreaterThan(2);
      expect(meta.description.length).toBeGreaterThan(10);
    }
  });
});
