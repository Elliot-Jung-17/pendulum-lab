import type { ExperimentStateV1 } from '../contracts/experiment';
import { parseProductRoute, serializeProductRoute, type ProductRoute } from '../contracts/routes';
import { failure, success, type ContractResult } from '../contracts/validation';
import { decodeShareToken, encodeShareToken } from './share';

/** Route syntax alone cannot certify that its token belongs to the selected system. */
export function resolveProductRoute(
  input: string
): ContractResult<{ route: ProductRoute; experiment?: ExperimentStateV1 }> {
  const parsed = parseProductRoute(input);
  if (!parsed.ok) return parsed;
  const route = parsed.value;
  if (route.kind !== 'lab-system' || route.stateToken === undefined) return success({ route });
  const state = decodeShareToken(route.stateToken);
  if (!state.ok) return state;
  if (state.value.systemId !== route.systemId)
    return failure(
      'route-state-mismatch',
      '$.systemId',
      'Route and shared experiment select different systems.',
      'keep-original'
    );
  return success({ route, experiment: state.value });
}

export function createExperimentRoute(input: unknown): ContractResult<string> {
  const encoded = encodeShareToken(input);
  if (!encoded.ok) return encoded;
  const state = decodeShareToken(encoded.value);
  if (!state.ok) return state;
  return serializeProductRoute({ kind: 'lab-system', systemId: state.value.systemId, stateToken: encoded.value });
}
