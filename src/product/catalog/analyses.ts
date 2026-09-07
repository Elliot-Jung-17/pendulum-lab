import type { AnalysisDefinition } from '../contracts/catalog';
import { coreAnalyses } from './analyses-core';
import { geometryAnalyses } from './analyses-geometry';
import { stabilityAnalyses } from './analyses-stability';
import { physicalAnalyses } from './analyses-physical';
import { researchAnalyses } from './analyses-research';

/** Explicit semantic groups; importing this catalog does not load legacy engines. */
export const analyses: readonly AnalysisDefinition[] = [
  ...coreAnalyses,
  ...geometryAnalyses,
  ...stabilityAnalyses,
  ...physicalAnalyses,
  ...researchAnalyses
];
