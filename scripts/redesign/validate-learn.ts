/** Build-time content checks. Imports authored data modules, never the simulation engine. */
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { validateLearnCourses, validateLearnUnit } from '../../src/product/learn/validation';
import type { LearnCourse } from '../../src/product/learn/schema';

export function validateCurriculumMap(markdown: string, curriculum: readonly LearnCourse[]): string[] {
  const errors: string[] = [];
  const headings = [...markdown.matchAll(/^### 과정 (\d+) — (.+) \((\d+)단원\)\r?$/gm)];
  const units = [...markdown.matchAll(/^\| (\d+\.\d+) \| ([^|]+) \| ([^|]+) \|\r?$/gm)];
  if (headings.length !== 8 || units.length !== 86)
    errors.push('curriculum map must contain 8 course headings and 86 unit rows.');
  if (curriculum.length !== headings.length) errors.push('curriculum course count differs from the authoritative map.');
  const summaries = curriculum.flatMap((course) => course.units);
  if (summaries.length !== units.length) errors.push('curriculum unit count differs from the authoritative map.');
  for (const [index, heading] of headings.entries()) {
    const course = curriculum[index];
    if (
      !course ||
      course.id !== `course-${heading[1]}` ||
      course.title.ko !== heading[2] ||
      course.units.length !== Number(heading[3])
    )
      errors.push(`course ${heading[1]} metadata differs from the authoritative map.`);
  }
  for (const [index, row] of units.entries()) {
    const summary = summaries[index];
    if (!summary || summary.id !== row[1] || summary.title.ko !== row[2]?.trim())
      errors.push(`unit ${row[1]} metadata differs from the authoritative map.`);
  }
  return errors;
}

function moduleEntries(source: string, errors: string[]): Map<string, string> {
  const file = ts.createSourceFile('modules.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const entries = new Map<string, string>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'learnModules') {
      if (!node.initializer || !ts.isObjectLiteralExpression(node.initializer)) {
        errors.push('learnModules must be an explicit object literal.');
        return;
      }
      for (const property of node.initializer.properties) {
        if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.name)) {
          errors.push('learnModules requires explicit string keys.');
          continue;
        }
        const key = property.name.text;
        const initializer = property.initializer;
        if (
          !ts.isArrowFunction(initializer) ||
          initializer.parameters.length ||
          !ts.isCallExpression(initializer.body) ||
          initializer.body.expression.kind !== ts.SyntaxKind.ImportKeyword ||
          initializer.body.arguments.length !== 1 ||
          !ts.isStringLiteral(initializer.body.arguments[0]!)
        ) {
          errors.push(`${key}: use a zero-argument arrow with one literal dynamic import.`);
          continue;
        }
        if (entries.has(key)) errors.push(`${key}: duplicate module registration.`);
        entries.set(key, (initializer.body.arguments[0] as ts.StringLiteral).text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (!entries.size) errors.push('learnModules has no content modules.');
  return entries;
}

function contentFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? contentFiles(target) : [target];
  });
}

export async function validateLearnContent(root: string): Promise<string[]> {
  const errors: string[] = [];
  const directory = path.resolve(root, 'content/learn');
  try {
    const curriculum = (await import(pathToFileURL(path.join(directory, 'curriculum.ts')).href)) as {
      courses: unknown;
    };
    const checkedCourses = validateLearnCourses(curriculum.courses);
    if (!checkedCourses.ok) return [...checkedCourses.errors];
    errors.push(
      ...validateCurriculumMap(
        readFileSync(path.join(root, 'documents/redesign/curriculum-map-ko.md'), 'utf8'),
        checkedCourses.value
      )
    );
    const entries = moduleEntries(readFileSync(path.join(directory, 'modules.ts'), 'utf8'), errors);
    const available = checkedCourses.value.flatMap((course) =>
      course.units.filter((unit) => unit.availability !== 'planned').map((unit) => `${course.id}/${unit.id}`)
    );
    const expected = new Set<string>();
    for (const key of available)
      if (!entries.has(key)) errors.push(`${key}: available unit has no loader registration.`);
    for (const [key, specifier] of entries) {
      if (!available.includes(key)) errors.push(`${key}: module is not an available curriculum unit.`);
      if (!/^course-[1-8]\/[1-8]\.[1-9][0-9]?$/.test(key) || specifier !== `./${key}`) {
        errors.push(`${key}: module path must match its declared course/unit ID.`);
        continue;
      }
      const target = path.join(directory, `${key}.ts`);
      expected.add(target);
      if (!existsSync(target)) {
        errors.push(`${key}: content file is missing.`);
        continue;
      }
      const resolved = path.relative(realpathSync(directory), realpathSync(target));
      if (path.isAbsolute(resolved) || resolved === '..' || resolved.startsWith(`..${path.sep}`)) {
        errors.push(`${key}: content file resolves outside the content directory.`);
        continue;
      }
      try {
        const module = (await import(pathToFileURL(target).href)) as { default: unknown };
        const checked = validateLearnUnit(module.default, checkedCourses.value);
        if (!checked.ok) errors.push(...checked.errors.map((error) => `${key}: ${error}`));
        else if (`${checked.value.courseId}/${checked.value.id}` !== key)
          errors.push(`${key}: module exports the wrong unit.`);
      } catch {
        errors.push(`${key}: content import failed.`);
      }
    }
    for (const file of contentFiles(directory)) {
      if (['curriculum.ts', 'modules.ts'].some((name) => file === path.join(directory, name))) continue;
      if (!expected.has(file))
        errors.push(`${path.relative(root, file).replaceAll('\\', '/')}: orphan or unsupported content module.`);
    }
  } catch {
    errors.push('Learn content discovery failed; check the curriculum map and content directory.');
  }
  return errors;
}

// Imports from tests and the catalog gate must remain side-effect free.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const errors = await validateLearnContent(process.cwd());
  if (errors.length) {
    console.error(`Learn content check FAILED:\n${errors.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(
      'Learn content check ok: 8 courses / 86 unit reservations; available modules, symbols and references verified.'
    );
  }
}
