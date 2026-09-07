import { executePlanarAnalysisJob, type PlanarAnalysisRequest } from './planar';

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (event: MessageEvent<PlanarAnalysisRequest>) => {
  executePlanarAnalysisJob(event.data, (result) => scope.postMessage(result));
};
