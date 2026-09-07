import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, test } from 'vitest';

const tokens = postcss.parse(readFileSync(resolve('css/product/tokens.css'), 'utf8'));

function palette(selector: string): Record<string, string> {
  const colors: Record<string, string> = {};
  tokens.walkRules(selector, (rule) => {
    rule.walkDecls(/^--ds-color-/, ({ prop, value }) => {
      colors[prop.replace('--ds-color-', '')] = value;
    });
  });
  return colors;
}

const light = palette(':root');
const dark = palette(":root[data-theme='dark']");
const systemDark = palette(":root[data-theme='system']");

function color(colors: Record<string, string>, name: string): string {
  const value = colors[name];
  if (value === undefined) throw new Error(`Missing semantic color: ${name}`);
  return value;
}

/** WCAG sRGB relative luminance; only opaque color pairs are compared here. */
function luminance(hex: string): number {
  if (!/^#[\da-f]{6}$/i.test(hex)) throw new Error(`Expected opaque sRGB color, received ${hex}`);
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe('product design tokens', () => {
  test('provides every semantic color in light, dark and system-dark palettes', () => {
    expect(Object.keys(light).length).toBeGreaterThan(25);
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
    expect(systemDark).toEqual(dark);
    expect(light.page).toBe('#f6f7f2');
  });

  describe.each([
    ['light', light],
    ['dark', dark]
  ] as const)('%s contrast', (_name, colors) => {
    test.each(['text', 'text-secondary', 'text-muted', 'text-accent'])(
      '%s meets normal-text contrast on page and card surfaces',
      (foreground) => {
        for (const background of ['page', 'surface', 'surface-subtle', 'surface-selected']) {
          expect(
            contrast(color(colors, foreground), color(colors, background)),
            `${foreground} on ${background}`
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    );

    test.each([
      ['on-accent', 'accent'],
      ['on-accent', 'accent-hover'],
      ['on-danger', 'danger'],
      ['on-danger', 'danger-hover'],
      ['danger', 'danger-surface'],
      ['danger', 'surface'],
      ['warning', 'warning-surface'],
      ['success', 'success-surface']
    ])('%s is readable on %s', (foreground, background) => {
      expect(contrast(color(colors, foreground), color(colors, background))).toBeGreaterThanOrEqual(4.5);
    });

    test.each(['focus', 'border-control', 'selection-indicator'])(
      '%s stays perceptible against interactive surfaces',
      (foreground) => {
        for (const background of ['page', 'surface', 'surface-subtle', 'surface-selected']) {
          expect(
            contrast(color(colors, foreground), color(colors, background)),
            `${foreground} on ${background}`
          ).toBeGreaterThanOrEqual(3);
        }
      }
    );
  });

  test('has no missing token references across component and shell styles', () => {
    const styles = postcss.parse(
      [
        tokens.toString(),
        readFileSync(resolve('css/product/components.css'), 'utf8'),
        readFileSync(resolve('src/product/app/shell.css'), 'utf8')
      ].join('\n')
    );
    const declared = new Set<string>();
    const references = new Set<string>();
    styles.walkDecls((declaration) => {
      if (declaration.prop.startsWith('--ds-')) declared.add(declaration.prop);
      for (const reference of declaration.value.matchAll(/var\((--ds-[\w-]+)/g)) {
        const name = reference[1];
        if (!name) throw new Error(`Missing token reference capture: ${reference[0]}`);
        references.add(name);
      }
    });
    expect([...references].filter((name) => !declared.has(name))).toEqual([]);
  });
});
