import { expect, test, type Page } from '@playwright/test';
import type { Dialog } from '../../src/product/design-system/dialog';
import type { Tabs } from '../../src/product/design-system/tabs';
import type { SplitPanel } from '../../src/product/design-system/split-panel';

interface DialogFixture {
  parent: Dialog;
  child: Dialog;
  trigger: HTMLButtonElement;
  events: string[];
}

type FixtureWindow = Window & {
  s05Dialogs: DialogFixture;
  s05Tabs: { tabs: Tabs; retained: HTMLButtonElement; events: string[] };
  s05Split: { split: SplitPanel; events: number[] };
};

async function gallery(page: Page): Promise<void> {
  await page.goto('/next.html?gallery=components');
  await expect(page.locator('#product-root')).toHaveAttribute('data-bootstrap-state', 'ready');
}

async function mountDialogs(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const path = '/src/product/design-system/dialog.ts';
    const { createDialog } = (await import(path)) as typeof import('../../src/product/design-system/dialog');
    const events: string[] = [];
    const trigger = document.createElement('button');
    trigger.id = 'fixture-open-parent';
    trigger.textContent = '첫 대화상자 열기';
    const openChild = document.createElement('button');
    openChild.id = 'fixture-open-child';
    openChild.textContent = '둘째 대화상자 열기';
    const parent = createDialog(document, {
      id: 'fixture-parent',
      title: '첫 대화상자',
      content: openChild,
      onClose: (value) => events.push(`parent:${value}`)
    });
    const childInput = document.createElement('input');
    childInput.setAttribute('aria-label', '둘째 입력');
    const child = createDialog(document, {
      id: 'fixture-child',
      title: '둘째 대화상자',
      content: childInput,
      onClose: (value) => events.push(`child:${value}`)
    });
    trigger.addEventListener('click', () => parent.open(trigger));
    openChild.addEventListener('click', () => child.open(openChild));
    document.querySelector('#gallery-main')!.append(trigger, parent.element, child.element);
    (window as unknown as FixtureWindow).s05Dialogs = { parent, child, trigger, events };
  });
}

// These integration fixtures import source modules through Vite. The production
// gallery journey separately covers shipped behavior without source/test exports.
test.describe('S05 development component lifecycle', () => {
  test.skip(process.env.PLAYWRIGHT_USE_PREVIEW === '1', 'Source-module fixtures run against the development server.');

  test('nested modal Escape restores each trigger and parent disposal safely closes children', async ({ page }) => {
    await gallery(page);
    await mountDialogs(page);
    const parent = page.locator('#fixture-parent');
    const child = page.locator('#fixture-child');
    await page.locator('#fixture-open-parent').click();
    await expect(parent.getByRole('button', { name: '닫기', exact: true })).toBeFocused();
    await page.locator('#fixture-open-child').click();
    await expect(child.getByRole('button', { name: '닫기', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(child.getByRole('textbox')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(child.getByRole('button', { name: '닫기', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(child).not.toBeVisible();
    await expect(page.locator('#fixture-open-child')).toBeFocused();
    await expect(parent).toBeVisible();
    await page.locator('#fixture-open-child').click();
    await page.evaluate(() => (window as unknown as FixtureWindow).s05Dialogs.parent.dispose());
    await expect(parent).toHaveCount(0);
    await expect(child).not.toBeVisible();
    await expect(page.locator('#fixture-open-parent')).toBeFocused();
    expect(await page.evaluate(() => (window as unknown as FixtureWindow).s05Dialogs.events)).toEqual([
      'child:cancel',
      'child:parent-closed'
    ]);
    const disposedError = await page.evaluate(() => {
      try {
        (window as unknown as FixtureWindow).s05Dialogs.parent.open();
        return null;
      } catch (error) {
        return (error as Error).message;
      }
    });
    expect(disposedError).toContain('disposed');
    await page.evaluate(() => (window as unknown as FixtureWindow).s05Dialogs.child.dispose());
  });

  test('synchronous modal focus handlers can open nested dialogs without reversing the modal stack', async ({
    page
  }) => {
    await gallery(page);
    await mountDialogs(page);
    await page.evaluate(() => {
      const { parent, child } = (window as unknown as FixtureWindow).s05Dialogs;
      const close = parent.element.querySelector('button')!;
      close.addEventListener('focus', () => child.open(close), { once: true });
    });
    await page.locator('#fixture-open-parent').click();
    await expect(page.locator('#fixture-child')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#fixture-child')).not.toBeVisible();
    await expect(page.locator('#fixture-parent')).toBeVisible();
    await expect(page.locator('#fixture-parent').getByRole('button', { name: '닫기', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#fixture-parent')).not.toBeVisible();
    await expect(page.locator('#fixture-open-parent')).toBeFocused();
    expect(await page.evaluate(() => (window as unknown as FixtureWindow).s05Dialogs.events)).toEqual([
      'child:cancel',
      'parent:cancel'
    ]);
  });

  test('rapid reopening ignores stale close events and native close restores focus exactly once', async ({ page }) => {
    await gallery(page);
    await mountDialogs(page);
    await page.locator('#fixture-open-parent').click();
    await page.evaluate(() => {
      const { parent, trigger } = (window as unknown as FixtureWindow).s05Dialogs;
      parent.close('first');
      parent.open(trigger);
    });
    // Advance across native close-event delivery before checking the new opening.
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    );
    await expect(page.locator('#fixture-parent')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as FixtureWindow).s05Dialogs.events)).toEqual(['parent:first']);
    await page.evaluate(() => (window as unknown as FixtureWindow).s05Dialogs.parent.element.close('native'));
    await expect
      .poll(() => page.evaluate(() => (window as unknown as FixtureWindow).s05Dialogs.events))
      .toEqual(['parent:first', 'parent:native']);
    await expect(page.locator('#fixture-open-parent')).toBeFocused();
    await page.locator('#fixture-open-parent').click();
    await page.locator('#fixture-parent').getByRole('button', { name: '닫기', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as FixtureWindow).s05Dialogs.events))
      .toEqual(['parent:first', 'parent:native', 'parent:close']);
    await page.evaluate(() => {
      const { parent, child } = (window as unknown as FixtureWindow).s05Dialogs;
      const retained = parent.element.querySelector('button')!;
      parent.dispose();
      retained.click();
      parent.close('late');
      child.dispose();
    });
    expect(await page.evaluate(() => (window as unknown as FixtureWindow).s05Dialogs.events)).toHaveLength(3);
  });

  test('dialog traps actual radio-group tab stops and handles focus outside the tab order', async ({ page }) => {
    await gallery(page);
    await mountDialogs(page);
    await page.evaluate(() => {
      const body = (window as unknown as FixtureWindow).s05Dialogs.parent.element.querySelector('.ds-dialog__body')!;
      const selected = document.createElement('input');
      selected.type = 'radio';
      selected.name = 'fixture-choice';
      selected.checked = true;
      selected.setAttribute('aria-label', '첫 선택');
      const unchecked = document.createElement('input');
      unchecked.type = 'radio';
      unchecked.name = 'fixture-choice';
      unchecked.setAttribute('aria-label', '둘째 선택');
      const note = document.createElement('p');
      note.id = 'fixture-focus-note';
      note.tabIndex = -1;
      note.textContent = '프로그램으로 초점을 받는 설명';
      body.replaceChildren(note, selected, unchecked);
    });
    await page.locator('#fixture-open-parent').click();
    const close = page.locator('#fixture-parent').getByRole('button', { name: '닫기', exact: true });
    await page.getByRole('radio', { name: '첫 선택' }).focus();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('radio', { name: '첫 선택' })).toBeFocused();
    await page.getByRole('radio', { name: '둘째 선택' }).check();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('radio', { name: '둘째 선택' })).toBeFocused();
    await page.locator('#fixture-focus-note').focus();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.locator('#fixture-focus-note').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('radio', { name: '둘째 선택' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#fixture-open-parent')).toBeFocused();
  });

  test('tabs skip disabled items, preserve links, reject unavailable selection and remove listeners', async ({
    page
  }) => {
    await gallery(page);
    await page.evaluate(async () => {
      const path = '/src/product/design-system/tabs.ts';
      const { createTabs } = (await import(path)) as typeof import('../../src/product/design-system/tabs');
      const events: string[] = [];
      const tabs = createTabs(document, {
        id: 'fixture-tabs',
        label: '시험 탭',
        items: [
          { id: 'first', label: '첫 탭', content: document.createTextNode('첫 패널') },
          { id: 'disabled', label: '사용 불가 탭', content: document.createTextNode('숨긴 패널'), disabled: true },
          { id: 'last', label: '끝 탭', content: document.createTextNode('끝 패널') }
        ],
        onChange: (id) => events.push(id)
      });
      document.querySelector('#gallery-main')!.append(tabs.element);
      const retained = tabs.element.querySelector<HTMLButtonElement>('#fixture-tabs-tab-first')!;
      (window as unknown as FixtureWindow).s05Tabs = { tabs, retained, events };
    });
    const tabs = page.locator('#fixture-tabs');
    const first = tabs.getByRole('tab', { name: '첫 탭', exact: true });
    const last = tabs.getByRole('tab', { name: '끝 탭', exact: true });
    await expect(tabs.getByRole('tab', { name: '사용 불가 탭' })).toBeDisabled();
    await first.focus();
    await page.keyboard.press('ArrowRight');
    await expect(last).toBeFocused();
    await expect(tabs.getByRole('tabpanel')).toHaveText('끝 패널');
    await expect(last).toHaveAttribute('aria-controls', 'fixture-tabs-panel-last');
    await expect(tabs.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'fixture-tabs-tab-last');
    await page.keyboard.press('ArrowRight');
    await expect(first).toBeFocused();
    await page.keyboard.press('End');
    await expect(last).toBeFocused();
    const rejected = await page.evaluate(() => {
      const { tabs } = (window as unknown as FixtureWindow).s05Tabs;
      return ['disabled', 'missing'].map((id) => {
        try {
          tabs.select(id);
          return false;
        } catch {
          return tabs.selectedId === 'last';
        }
      });
    });
    expect(rejected).toEqual([true, true]);
    await page.keyboard.press('Home');
    await expect(first).toBeFocused();
    const events = await page.evaluate(() => {
      const fixture = (window as unknown as FixtureWindow).s05Tabs;
      fixture.tabs.select('last');
      fixture.tabs.dispose();
      fixture.retained.click();
      fixture.retained.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      fixture.tabs.select('first');
      return { events: fixture.events, selected: fixture.tabs.selectedId };
    });
    await expect(tabs).toHaveCount(0);
    expect(events).toEqual({ events: ['last', 'first', 'last', 'first', 'last'], selected: 'last' });
  });

  test('split custom bounds clamp values and disposal stops retained keyboard updates', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 900 });
    await gallery(page);
    await page.evaluate(async () => {
      const path = '/src/product/design-system/split-panel.ts';
      const { createSplitPanel } = (await import(path)) as typeof import('../../src/product/design-system/split-panel');
      const events: number[] = [];
      const split = createSplitPanel(document, {
        id: 'fixture-split',
        label: '시험 너비',
        primaryLabel: '첫 영역',
        secondaryLabel: '둘째 영역',
        primary: document.createTextNode('첫 영역 내용'),
        secondary: document.createTextNode('둘째 영역 내용'),
        min: 10,
        max: 90,
        value: 49,
        onChange: (value) => events.push(value)
      });
      document.querySelector('#gallery-main')!.append(split.element);
      (window as unknown as FixtureWindow).s05Split = { split, events };
    });
    const separator = page.getByRole('separator', { name: '시험 너비' });
    await expect(separator).toHaveAttribute('aria-valuenow', '50');
    await separator.focus();
    await page.keyboard.press('Home');
    await expect(separator).toHaveAttribute('aria-valuenow', '10');
    await page.keyboard.press('ArrowLeft');
    await expect(separator).toHaveAttribute('aria-valuenow', '10');
    await page.keyboard.press('End');
    await expect(separator).toHaveAttribute('aria-valuenow', '90');
    await page.setViewportSize({ width: 320, height: 900 });
    await expect(separator).not.toBeVisible();
    await expect(page.locator('#fixture-split-primary')).toBeFocused();
    const state = await page.evaluate(() => {
      const { split, events } = (window as unknown as FixtureWindow).s05Split;
      let rejected = false;
      try {
        split.setValue(Number.NaN);
      } catch {
        rejected = true;
      }
      split.dispose();
      split.separator.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      split.setValue(50);
      return { rejected, value: split.value, events };
    });
    await expect(separator).toHaveCount(0);
    expect(state).toEqual({ rejected: true, value: 90, events: [10, 90] });
  });
});
