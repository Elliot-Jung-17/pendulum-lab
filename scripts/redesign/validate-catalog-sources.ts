import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, win32 } from 'node:path';
import ts from 'typescript';
import type { CapabilityCatalog, LegacyBinding } from '../../src/product/contracts/catalog';

interface BindingCheck {
  readonly binding: LegacyBinding;
  readonly label: string;
  readonly callable: boolean;
}

function bindingChecks(catalog: CapabilityCatalog): BindingCheck[] {
  const checks: BindingCheck[] = [];
  const add = (bindings: readonly LegacyBinding[], label: string, callable: boolean | 'first' = false): void => {
    bindings.forEach((binding, index) =>
      checks.push({
        binding,
        label: `${label}[${index}]`,
        callable: callable === true || (callable === 'first' && index === 0)
      })
    );
  };
  for (const definition of [...catalog.systems, ...catalog.analyses, ...catalog.integrators, ...catalog.auxiliary]) {
    add(
      definition.legacyBindings,
      `${definition.id}.legacyBindings`,
      definition.category === 'analysis' || definition.category === 'integrator' ? 'first' : false
    );
  }
  for (const system of catalog.systems) {
    add(system.engineAdapters, `${system.id}.engineAdapters`, true);
    add(system.state.bindings, `${system.id}.state.bindings`);
    add(system.parameters.bindings, `${system.id}.parameters.bindings`);
    if (system.stepping.kind === 'internal') {
      checks.push({ binding: system.stepping.binding, label: `${system.id}.stepping.binding`, callable: true });
    }
  }
  for (const analysis of catalog.analyses) add(analysis.parameters.bindings, `${analysis.id}.parameters.bindings`);
  return checks;
}

function outside(root: string, path: string): boolean {
  const pathFromRoot = relative(root, path);
  return (
    pathFromRoot === '..' ||
    pathFromRoot.startsWith('../') ||
    pathFromRoot.startsWith('..\\') ||
    isAbsolute(pathFromRoot)
  );
}

function sourcePath(root: string, module: string): string {
  if (
    !module ||
    module.includes('\0') ||
    isAbsolute(module) ||
    win32.isAbsolute(module) ||
    module.split(/[\\/]/).includes('..')
  ) {
    throw new Error('module must be a repository-relative path without traversal');
  }
  const path = resolve(root, module);
  if (outside(root, path)) throw new Error('module escapes repository root');
  if (!/\.(?:[cm]?[jt]s|[jt]sx)$/.test(path))
    throw new Error('module must name a TypeScript or JavaScript source file');
  let actualPath: string;
  try {
    actualPath = realpathSync(path);
    if (!statSync(actualPath).isFile()) throw new Error('not a file');
  } catch {
    throw new Error('source module does not exist or is not a file');
  }
  if (outside(root, actualPath)) throw new Error('source module resolves outside repository root');
  return actualPath;
}

function resolvedSymbol(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

function exportedSymbol(checker: ts.TypeChecker, source: ts.SourceFile, name: string): ts.Symbol | undefined {
  const module = checker.getSymbolAtLocation(source);
  return module ? checker.getExportsOfModule(module).find((entry) => entry.name === name) : undefined;
}

function isTypeOnlyAlias(symbol: ts.Symbol, checker: ts.TypeChecker, seen = new Set<ts.Symbol>()): boolean {
  if (seen.has(symbol)) return false;
  seen.add(symbol);
  for (const declaration of symbol.declarations ?? []) {
    if (ts.isExportSpecifier(declaration) && (declaration.isTypeOnly || declaration.parent.parent.isTypeOnly))
      return true;
    if (ts.isImportSpecifier(declaration) && (declaration.isTypeOnly || declaration.parent.parent.isTypeOnly))
      return true;
    if (ts.isImportClause(declaration) && declaration.isTypeOnly) return true;
    if (ts.isNamespaceImport(declaration) && declaration.parent.isTypeOnly) return true;
  }
  const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getImmediateAliasedSymbol(symbol) : undefined;
  return target ? isTypeOnlyAlias(target, checker, seen) : false;
}

function hasRuntimeDeclaration(symbol: ts.Symbol): boolean {
  return (
    Boolean(symbol.flags & ts.SymbolFlags.Value) &&
    (symbol.declarations ?? []).some((declaration) => {
      if (declaration.getSourceFile().isDeclarationFile) return false;
      for (let node: ts.Node | undefined = declaration; node; node = node.parent) {
        if (
          ts.canHaveModifiers(node) &&
          ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword)
        )
          return false;
      }
      if (ts.isFunctionDeclaration(declaration)) return declaration.body !== undefined;
      if (ts.isVariableDeclaration(declaration)) return declaration.initializer !== undefined;
      return true;
    })
  );
}

/** Inspect export syntax as well as symbols: `export type *` retains value symbols in the checker. */
function hasRuntimeExport(
  checker: ts.TypeChecker,
  source: ts.SourceFile,
  name: string,
  seen = new Set<string>()
): boolean {
  const key = `${source.fileName}:${name}`;
  if (seen.has(key) || source.isDeclarationFile) return false;
  seen.add(key);
  const symbol = exportedSymbol(checker, source, name);
  if (!symbol || isTypeOnlyAlias(symbol, checker)) return false;
  const target = resolvedSymbol(checker, symbol);
  if (!hasRuntimeDeclaration(target)) return false;
  if (target.declarations?.some((declaration) => declaration.getSourceFile() === source)) return true;
  for (const statement of source.statements) {
    if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) continue;
    const clause = statement.exportClause;
    if (clause && ts.isNamedExports(clause)) {
      const entry = clause.elements.find((element) => element.name.text === name);
      if (!entry || entry.isTypeOnly) continue;
      if (!statement.moduleSpecifier) return true;
      const module = checker.getSymbolAtLocation(statement.moduleSpecifier);
      const imported = module?.declarations?.find(ts.isSourceFile);
      if (imported && hasRuntimeExport(checker, imported, (entry.propertyName ?? entry.name).text, seen)) return true;
    } else if (statement.moduleSpecifier) {
      const module = checker.getSymbolAtLocation(statement.moduleSpecifier);
      const imported = module?.declarations?.find(ts.isSourceFile);
      if (clause && ts.isNamespaceExport(clause)) {
        if (clause.name.text === name && imported && !imported.isDeclarationFile) return true;
      } else if (name !== 'default' && imported && hasRuntimeExport(checker, imported, name, seen)) return true;
    }
  }
  return false;
}

/** Validate source links without importing or evaluating any legacy module. */
export function validateCatalogSources(root: string, catalog: CapabilityCatalog): string[] {
  const errors: string[] = [];
  const repository = realpathSync(root);
  const checks = bindingChecks(catalog);
  const paths = new Map<string, string>();
  const invalidPaths = new Map<string, string>();
  for (const { binding } of checks) {
    if (paths.has(binding.module) || invalidPaths.has(binding.module)) continue;
    try {
      paths.set(binding.module, sourcePath(repository, binding.module));
    } catch (error) {
      invalidPaths.set(binding.module, error instanceof Error ? error.message : String(error));
    }
  }
  const program = ts.createProgram([...new Set(paths.values())], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowJs: true,
    noEmit: true,
    skipLibCheck: true,
    types: []
  });
  const checker = program.getTypeChecker();
  for (const { binding, label, callable } of checks) {
    const pathError = invalidPaths.get(binding.module);
    const path = paths.get(binding.module);
    if (pathError || !path) {
      errors.push(`${label}: ${binding.module}: ${pathError ?? 'source path unavailable'}`);
      continue;
    }
    const source = program.getSourceFile(path);
    if (!source || program.getSyntacticDiagnostics(source).length > 0) {
      errors.push(`${label}: ${binding.module}: source module cannot be parsed`);
      continue;
    }
    const exported = exportedSymbol(checker, source, binding.exportName);
    const symbol = exported ? resolvedSymbol(checker, exported) : undefined;
    if (!symbol?.declarations?.length) {
      errors.push(`${label}: ${binding.module} does not export ${binding.exportName}`);
      continue;
    }
    const location = symbol.valueDeclaration ?? symbol.declarations[0]!;
    let type =
      symbol.flags & ts.SymbolFlags.Value
        ? checker.getTypeOfSymbolAtLocation(symbol, location)
        : checker.getDeclaredTypeOfSymbol(symbol);
    if (binding.member !== undefined) {
      const member = checker.getPropertyOfType(type, binding.member);
      if (!member) {
        errors.push(`${label}: ${binding.module} export ${binding.exportName} has no member ${binding.member}`);
        continue;
      }
      type = checker.getTypeOfSymbolAtLocation(member, member.valueDeclaration ?? location);
    }
    if (
      callable &&
      (!hasRuntimeExport(checker, source, binding.exportName) ||
        (type.getCallSignatures().length === 0 && type.getConstructSignatures().length === 0))
    ) {
      errors.push(
        `${label}: ${binding.module} export ${binding.exportName}${binding.member === undefined ? '' : `.${binding.member}`} must be a runtime callable function or class`
      );
    }
  }
  return errors;
}
