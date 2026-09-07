import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildInventory, inventoryFiles, serializeInventory } from '../../../scripts/redesign/inventory';

const roots: string[] = [];
function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'pendulum-s02-scope-'));
  roots.push(root);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), content);
  }
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    const target = path.resolve(root);
    expect(path.dirname(target)).toBe(path.resolve(tmpdir()));
    expect(path.basename(target).startsWith('pendulum-s02-scope-')).toBe(true);
    rmSync(target, { recursive: true });
  }
});

describe('frozen legacy scope and additive catalog build guards', () => {
  it('keeps all existing files and only excludes the new product layer and its tests', () => {
    const root = fixture({
      'src/product/catalog/index.ts': 'export const catalog = {};',
      'tests/product/catalog/catalog.test.ts': 'export {};',
      'src/physics/model.ts': 'export const legacy = 1;',
      'src/new-engine/model.ts': 'export const unknown = 1;',
      'tests/legacy.test.ts': 'export {};'
    });
    expect(inventoryFiles(root)).toEqual(['src/new-engine/model.ts', 'src/physics/model.ts', 'tests/legacy.test.ts']);
    expect(buildInventory(root, []).errors.join('\n')).toMatch(/Unassigned source\/asset family/);
  });

  it('only normalizes the exact new lifecycle check and continues detecting modified build commands', () => {
    const manifest = { version: '1', scripts: { build: 'vite build' }, exports: {} };
    const root = fixture({ 'package.json': JSON.stringify(manifest) });
    const before = buildInventory(root, []);
    const scripts = { ...manifest.scripts, prebuild: 'npm run redesign:catalog:check' };
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ ...manifest, scripts }));
    expect(serializeInventory(buildInventory(root, []))).toBe(serializeInventory(before));
    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ ...manifest, scripts: { ...scripts, prebuild: 'unexpected-command' } })
    );
    expect(buildInventory(root, []).sourceDigest).not.toBe(before.sourceDigest);
    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ ...manifest, scripts: { ...scripts, build: 'changed-build' } })
    );
    expect(buildInventory(root, []).sourceDigest).not.toBe(before.sourceDigest);
  });

  it('runs catalog validation before each supported npm production build without changing legacy build bodies', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
    for (const name of ['prebuild', 'prebuild:standalone', 'prebuild:lib']) {
      expect(manifest.scripts[name]).toBe('npm run redesign:catalog:check');
    }
    expect(manifest.scripts['redesign:catalog:check']).toBe('tsx scripts/redesign/validate-catalog.ts');
  });
});
