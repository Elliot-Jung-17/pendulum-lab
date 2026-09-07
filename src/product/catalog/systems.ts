import type { SystemDefinition } from '../contracts/catalog';
import { define } from './systems-helpers';
import { classicalRows } from './systems-classical';
import { drivenRows } from './systems-driven';
import { networkRows } from './systems-network';
import { extendedRows } from './systems-extended';

export const systems: readonly SystemDefinition[] = [
  ...classicalRows,
  ...drivenRows,
  ...networkRows,
  ...extendedRows
].map(define);
