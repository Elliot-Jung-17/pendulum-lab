import { describe, expect, it } from 'vitest';
import {
  CERTIFIED_WORKBENCH_FLAGSHIP,
  GPU_SCALE_VALIDATION_CONTRACTS,
  REVIEWER_KIT_ARTIFACTS,
  evaluateReviewerKit,
  flagshipMarkdown,
  reviewerKitCommands
} from '../src/research/certifiedWorkbench';

describe('Certified Chaotic Dynamics Workbench contract', () => {
  it('names one flagship result with reproducible commands and caveats', () => {
    expect(CERTIFIED_WORKBENCH_FLAGSHIP.id).toBe('melnikov-gap-map');
    expect(CERTIFIED_WORKBENCH_FLAGSHIP.thesis).toContain('Melnikov');
    expect(CERTIFIED_WORKBENCH_FLAGSHIP.flagshipCommand).toBe('npm run paper:study');
    expect(CERTIFIED_WORKBENCH_FLAGSHIP.evidenceArtifacts).toContain('reports/paper-study.json');
    expect(CERTIFIED_WORKBENCH_FLAGSHIP.caveats.length).toBeGreaterThanOrEqual(2);
    expect(flagshipMarkdown()).toContain('Trust Contract');
  });

  it('evaluates reviewer-kit readiness without hiding missing required artifacts', () => {
    const required = REVIEWER_KIT_ARTIFACTS.filter((artifact) => artifact.priority === 'required');
    expect(required.length).toBeGreaterThan(0);
    const evaluation = evaluateReviewerKit((path) => path === required[0]!.path);
    expect(evaluation.status).toBe('missing-required');
    expect(evaluation.ready.map((artifact) => artifact.path)).toEqual([required[0]!.path]);
    expect(reviewerKitCommands(evaluation)).toContain('npm run paper:build');
  });

  it('records that GPU acceleration is accepted only against CPU references', () => {
    expect(GPU_SCALE_VALIDATION_CONTRACTS.length).toBeGreaterThanOrEqual(2);
    for (const contract of GPU_SCALE_VALIDATION_CONTRACTS) {
      expect(contract.cpuReference.length).toBeGreaterThan(10);
      expect(contract.acceptanceRule.toLowerCase()).toContain('cpu');
      expect(contract.ciEvidence.length).toBeGreaterThan(0);
    }
  });
});
