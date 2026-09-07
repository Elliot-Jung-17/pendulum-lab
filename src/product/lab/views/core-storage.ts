import {
  fromCanonicalPlanar,
  toCanonicalPlanar,
  type PlanarConfig,
  type PlanarSample,
  type PlanarSystemId
} from '../../adapters/physics/planar';
import { parseExperiment, serializeExperiment } from '../../persistence';

export const PLANAR_STORAGE_PREFIX = 'pendulum-product/planar/v1/';
export const PLANAR_IMPORT_MAX_BYTES = 200_000;

export function serializeCoreConfig(config: PlanarConfig): string {
  const state = toCanonicalPlanar(config);
  if (!state.ok) throw new Error(state.issues.map((item) => item.message).join(' '));
  const serialized = serializeExperiment(state.value);
  if (!serialized.ok) throw new Error(serialized.issues.map((item) => item.message).join(' '));
  return serialized.value;
}

export function parseCoreConfig(text: string, systemId: PlanarSystemId): PlanarConfig {
  if (new TextEncoder().encode(text).length > PLANAR_IMPORT_MAX_BYTES)
    throw new Error('상태 파일은 200 KB 이하여야 합니다.');
  const state = parseExperiment(text);
  if (!state.ok) throw new Error(state.issues.map((item) => item.message).join(' '));
  if (state.value.systemId !== systemId)
    throw new Error('다른 시스템의 설정입니다. 해당 시스템 화면에서 파일을 열어 주세요.');
  const config = fromCanonicalPlanar(state.value);
  if (!config.ok) throw new Error(config.issues.map((item) => item.message).join(' '));
  return config.value;
}

export function saveCoreConfig(storage: Pick<Storage, 'setItem'>, config: PlanarConfig): void {
  storage.setItem(`${PLANAR_STORAGE_PREFIX}${config.systemId}`, serializeCoreConfig(config));
}
export function loadCoreConfig(storage: Pick<Storage, 'getItem'>, systemId: PlanarSystemId): PlanarConfig | null {
  const text = storage.getItem(`${PLANAR_STORAGE_PREFIX}${systemId}`);
  return text === null ? null : parseCoreConfig(text, systemId);
}

/** Numeric-only cells and a fixed header cannot carry spreadsheet formula payloads. */
export function trajectoryCsv(samples: readonly PlanarSample[]): string {
  const rows = ['time_s,theta1_rad,theta2_rad,omega1_rad_s,omega2_rad_s,kinetic_J,potential_J,total_J'];
  for (const sample of samples) {
    const values = [sample.time, ...sample.state, sample.energy.KE, sample.energy.PE, sample.energy.total];
    if (values.length !== 8 || !values.every(Number.isFinite))
      throw new Error('유한한 상태 데이터만 CSV로 내보낼 수 있습니다.');
    rows.push(values.join(','));
  }
  return `${rows.join('\r\n')}\r\n`;
}
