import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { buildInventory, serializeInventory } from '../../../scripts/redesign/inventory';

it('keeps additive product styles outside the frozen legacy inventory while detecting changes to legacy CSS', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pendulum-s05-inventory-'));
  try {
    mkdirSync(path.join(root, 'css/product'), { recursive: true });
    writeFileSync(path.join(root, 'css/legacy.css'), 'body { color: black; }\n');
    const baseline = serializeInventory(buildInventory(root, []));
    writeFileSync(path.join(root, 'css/product/tokens.css'), readFileSync('css/product/tokens.css', 'utf8'));
    writeFileSync(path.join(root, 'css/product/components.css'), readFileSync('css/product/components.css', 'utf8'));
    expect(serializeInventory(buildInventory(root, []))).toBe(baseline);
    writeFileSync(path.join(root, 'css/legacy.css'), 'body { color: red; }\n');
    expect(serializeInventory(buildInventory(root, []))).not.toBe(baseline);
  } finally {
    const absolute = path.resolve(root);
    expect(path.dirname(absolute)).toBe(path.resolve(os.tmpdir()));
    expect(path.basename(absolute).startsWith('pendulum-s05-inventory-')).toBe(true);
    rmSync(absolute, { recursive: true });
  }
});
