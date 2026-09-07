import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { buildInventory, serializeInventory } from '../../../scripts/redesign/inventory';

const temporaryRoots: string[] = [];
const legacyInputs = [
  '      input: {',
  "        app: 'app.html',",
  "        reviewer: 'reviewer.html'",
  '      },'
].join('\n');
const productInputs = [
  '      input: {',
  "        app: 'app.html',",
  "        next: 'next.html',",
  "        reviewer: 'reviewer.html'",
  '      },'
].join('\n');
const helperRule = "          if (id === '\\0vite/preload-helper.js') return 'preload-helper';";
const manualChunksStart = '        manualChunks(id: string) {\n';

function configuration(inputs: string, chunkAddition = ''): string {
  return [
    'export default {',
    '  build: {',
    "    target: 'es2022',",
    '    rollupOptions: {',
    inputs,
    '      output: {',
    "        entryFileNames: 'assets/[name]-[hash].js',",
    '        manualChunks(id: string) {',
    ...(chunkAddition ? [chunkAddition] : []),
    '          const path = id;',
    "          if (path.includes('/src/physics/')) return 'physics';",
    '          return undefined;',
    '        }',
    '      }',
    '    }',
    '  }',
    '};',
    // This import after the input block certifies that AST locations are projected too.
    "export const loadHelper = () => import('./src/physics/helper');",
    ''
  ].join('\n');
}

function inventory(text: string, file = 'vite.config.ts') {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pendulum-s04-build-scope-'));
  temporaryRoots.push(root);
  mkdirSync(path.join(root, 'src/physics'), { recursive: true });
  writeFileSync(path.join(root, 'src/physics/helper.ts'), 'export const helper = 1;\n');
  writeFileSync(path.join(root, file), text);
  const result = buildInventory(root, []);
  expect(result.errors).toEqual([]);
  return result;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    const absolute = path.resolve(root);
    expect(path.dirname(absolute)).toBe(path.resolve(os.tmpdir()));
    expect(path.basename(absolute).startsWith('pendulum-s04-build-scope-')).toBe(true);
    rmSync(absolute, { recursive: true });
  }
});

function objectProperty(object: ts.ObjectLiteralExpression, name: string): ts.Expression {
  const property = object.properties.find((entry) => ts.isPropertyAssignment(entry) && entry.name.getText() === name);
  if (!property || !ts.isPropertyAssignment(property)) throw new Error(`Missing config property: ${name}`);
  return property.initializer;
}

function nestedObject(object: ts.ObjectLiteralExpression, name: string): ts.ObjectLiteralExpression {
  const expression = objectProperty(object, name);
  if (!ts.isObjectLiteralExpression(expression)) throw new Error(`Expected config object: ${name}`);
  return expression;
}

describe('S04 additive build entry and legacy inventory scope', () => {
  it.each(['LF', 'CRLF'])('preserves the entire legacy inventory for only the next input addition (%s)', (ending) => {
    const legacy = inventory(configuration(legacyInputs));
    const text = configuration(productInputs);
    const product = inventory(ending === 'CRLF' ? text.replaceAll('\n', '\r\n') : text);

    expect(product.sourceDigest).toBe(legacy.sourceDigest);
    expect(product.files).toEqual(legacy.files);
    expect(product.imports).toEqual(legacy.imports);
    expect(product.imports).toHaveLength(1);
    expect(serializeInventory(product)).toBe(serializeInventory(legacy));
  });

  it.each([
    ['preload helper only', 'LF', legacyInputs],
    ['preload helper only', 'CRLF', legacyInputs],
    ['both exact additions', 'LF', productInputs],
    ['both exact additions', 'CRLF', productInputs]
  ])('preserves hashes and AST locations for %s (%s)', (_name, ending, inputs) => {
    const legacy = inventory(configuration(legacyInputs));
    const text = configuration(inputs, helperRule);
    const product = inventory(ending === 'CRLF' ? text.replaceAll('\n', '\r\n') : text);

    expect(product.sourceDigest).toBe(legacy.sourceDigest);
    expect(product.files).toEqual(legacy.files);
    expect(product.imports).toEqual(legacy.imports);
    expect(serializeInventory(product)).toBe(serializeInventory(legacy));
  });

  it.each([
    ['app target', configuration(productInputs.replace("app: 'app.html'", "app: 'replacement.html'"))],
    [
      'reviewer target',
      configuration(productInputs.replace("reviewer: 'reviewer.html'", "reviewer: 'replacement.html'"))
    ],
    ['next target', configuration(productInputs.replace("next: 'next.html'", "next: 'replacement.html'"))],
    ['build target', configuration(productInputs).replace("target: 'es2022'", "target: 'esnext'")],
    ['extra code', `${configuration(productInputs)}export const changedBuildBehavior = true;\n`]
  ])('still detects a changed %s alongside the allowed addition', (_name, text) => {
    const legacy = inventory(configuration(legacyInputs));
    const changed = inventory(text);

    expect(changed.sourceDigest).not.toBe(legacy.sourceDigest);
    expect(changed.files.find((file) => file.ownerFile === 'vite.config.ts')?.sha256).not.toBe(
      legacy.files.find((file) => file.ownerFile === 'vite.config.ts')?.sha256
    );
    expect(serializeInventory(changed)).not.toBe(serializeInventory(legacy));
  });

  it.each([
    ['helper module ID', helperRule.replace('\\0vite/preload-helper.js', '\\0vite/different-helper.js')],
    ['helper chunk name', helperRule.replace("return 'preload-helper'", "return 'physics'")],
    ['extra engine rule', `${helperRule}\n          if (id.includes('/src/chaos/')) return 'preload-helper';`],
    ['helper outside the precise insertion point', `          const unrelated = true;\n${helperRule}`]
  ])('detects a changed %s when projecting the helper isolation', (_name, rule) => {
    const legacy = inventory(configuration(legacyInputs));
    const changed = inventory(configuration(productInputs, rule));

    expect(changed.sourceDigest).not.toBe(legacy.sourceDigest);
    expect(serializeInventory(changed)).not.toBe(serializeInventory(legacy));
  });

  it.each(['vite.config.lib.ts', 'vite.config.standalone.ts'])(
    'does not apply the parallel app allowance to %s',
    (file) => {
      const legacy = inventory(configuration(legacyInputs), file);
      const changed = inventory(configuration(productInputs), file);

      expect(changed.sourceDigest).not.toBe(legacy.sourceDigest);
      expect(changed.imports[0]?.line).toBe(legacy.imports[0]!.line + 1);
      expect(serializeInventory(changed)).not.toBe(serializeInventory(legacy));
    }
  );

  it.each(['vite.config.lib.ts', 'vite.config.standalone.ts'])(
    'retains an identical helper isolation rule in %s',
    (file) => {
      const legacy = inventory(configuration(legacyInputs), file);
      const changed = inventory(configuration(legacyInputs, helperRule), file);

      expect(changed.sourceDigest).not.toBe(legacy.sourceDigest);
      expect(changed.imports[0]?.line).toBe(legacy.imports[0]!.line + 1);
      expect(serializeInventory(changed)).not.toBe(serializeInventory(legacy));
    }
  );

  it('retains extra imports and their AST evidence while excluding only the input addition', () => {
    const legacy = inventory(configuration(legacyInputs));
    const changed = inventory(`${configuration(productInputs)}export * from './src/physics/helper';\n`);

    expect(changed.sourceDigest).not.toBe(legacy.sourceDigest);
    expect(changed.imports).toEqual([
      legacy.imports[0],
      expect.objectContaining({ kind: 'export', specifier: './src/physics/helper', ownerFile: 'vite.config.ts' })
    ]);
  });

  it('preserves the complete actual config inventory when projecting both exact additions', () => {
    const actual = readFileSync(path.resolve('vite.config.ts'), 'utf8').replaceAll('\r\n', '\n');
    expect(actual.split(productInputs)).toHaveLength(2);
    expect(actual.split(`${manualChunksStart}${helperRule}\n`)).toHaveLength(2);
    const legacyText = actual
      .replace(productInputs, legacyInputs)
      .replace(`${manualChunksStart}${helperRule}\n`, manualChunksStart);

    expect(serializeInventory(inventory(actual))).toBe(serializeInventory(inventory(legacyText)));
  });

  it('configures all three HTML entries and the exact helper rule in the active Vite build object', () => {
    const source = ts.createSourceFile(
      'vite.config.ts',
      readFileSync(path.resolve('vite.config.ts'), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    const assignment = source.statements.find(ts.isExportAssignment);
    if (!assignment || !ts.isCallExpression(assignment.expression)) throw new Error('Missing defineConfig export');
    expect(assignment.expression.expression.getText(source)).toBe('defineConfig');
    const config = assignment.expression.arguments[0];
    if (!config || !ts.isObjectLiteralExpression(config)) throw new Error('Missing literal Vite configuration');
    const rollupOptions = nestedObject(nestedObject(config, 'build'), 'rollupOptions');
    const input = nestedObject(rollupOptions, 'input');
    const entries = input.properties.map((entry) => {
      if (!ts.isPropertyAssignment(entry) || !ts.isStringLiteral(entry.initializer))
        throw new Error('HTML build entries must have literal targets');
      return [entry.name.getText(source), entry.initializer.text];
    });

    expect(entries).toEqual([
      ['app', 'app.html'],
      ['next', 'next.html'],
      ['reviewer', 'reviewer.html']
    ]);

    const output = nestedObject(rollupOptions, 'output');
    const manualChunks = output.properties.find(
      (entry) => ts.isMethodDeclaration(entry) && entry.name.getText(source) === 'manualChunks'
    );
    if (!manualChunks || !ts.isMethodDeclaration(manualChunks) || !manualChunks.body)
      throw new Error('Missing manualChunks method');
    expect(manualChunks.body.statements[0]?.getText(source)).toBe(helperRule.trim());
  });
});
