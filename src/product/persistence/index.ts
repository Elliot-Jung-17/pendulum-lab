/** Pure codecs: no localStorage, browser navigation, engine invocation or migration side effects. */
export { parseExperiment, serializeExperiment, parseUiState, serializeUiState } from './serialization';
export { encodeShareToken, decodeShareToken } from './share';
export type { ShareEnvelopeV1 } from './share';
export { createExperimentRoute, resolveProductRoute } from './share-route';
