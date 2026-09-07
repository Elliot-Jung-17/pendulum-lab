import { catalog } from '../../catalog';
import { createLibrary, rememberSystem } from '../../lab/library';
import { createWorkspace } from '../../lab/workspace';
import { createCoreWorkspace } from '../../lab/views/core-workspace';
import type { ResolvedRoute, RouteView } from '../types';

export function createView(context: ResolvedRoute, document: Document): RouteView {
  const { route, experiment } = context;
  if (route.kind === 'lab') return { element: createLibrary(document), title: '실험실' };
  if (route.kind !== 'lab-system') throw new Error('The laboratory view requires a Lab route.');
  const system = catalog.systems.find((definition) => definition.id === route.systemId);
  if (!system) throw new Error('The laboratory route requires a registered system.');
  rememberSystem(document, system.id);
  const create =
    system.id === 'system:double' || system.id === 'system:compound-double' ? createCoreWorkspace : createWorkspace;
  return { ...create(document, system, experiment), title: `${system.name.ko} · 실험실` };
}
