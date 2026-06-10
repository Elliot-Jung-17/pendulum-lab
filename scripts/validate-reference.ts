/**
 * Reference-validation report generator. Runs the cross-validation suite over
 * every integrator and writes Markdown + JSON to reports/. Pure Node — run with
 * `npm run validate:reference`.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { runReferenceValidation, type ReferenceReport } from '../src/validation/referenceSuite';

function fmt(x: number): string {
  if (!Number.isFinite(x)) return 'diverged';
  return x.toExponential(3);
}

function markdown(report: ReferenceReport): string {
  const lines = [
    '# Integrator Reference Validation',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Numerical reference method: \`${report.referenceMethod}\`. ` +
      `Order is measured on the harmonic oscillator (closed form); energy drift on the ` +
      `conservative double pendulum; agreement as max state divergence from the reference.`,
    '',
    `**${report.summary.passed} / ${report.summary.integrators} integrators within their expected envelopes.**`,
    '',
    '| Integrator | Measured order | Expected | Order | Energy drift | Energy | Agreement | Agree |',
    '|---|---|---:|:--:|---:|:--:|---:|:--:|'
  ];
  for (const c of report.checks) {
    const measured = c.order.roundOffLimited ? 'round-off' : (c.order.measured?.toFixed(2) ?? 'n/a');
    lines.push(
      `| ${c.name} (\`${c.id}\`) | ${measured} | ${c.order.expected} | ${c.order.pass ? '✓' : '✗'} | ` +
        `${fmt(c.energy.value)} | ${c.energy.pass ? '✓' : '✗'} | ${fmt(c.agreement.value)} | ${c.agreement.pass ? '✓' : '✗'} |`
    );
  }
  return `${lines.join('\n')}\n`;
}

const report = runReferenceValidation();
await mkdir('reports', { recursive: true });
await writeFile('reports/validation-reference.json', JSON.stringify(report, null, 2));
await writeFile('reports/validation-reference.md', markdown(report));
console.log(markdown(report));
if (report.summary.passed !== report.summary.integrators) {
  console.error(`WARNING: ${report.summary.integrators - report.summary.passed} integrator(s) outside their envelope.`);
  process.exitCode = 1;
}
