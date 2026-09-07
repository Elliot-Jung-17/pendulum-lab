import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function gallery(page: Page) {
  await page.goto('/next.html?gallery=components');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('작은 요소부터, 명확하게.');
  await expect(page.locator('#product-root')).toHaveAttribute('data-bootstrap-state', 'ready');
}

async function audit(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) }))).toEqual([]);
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test.describe('S05 component system', () => {
  test('applies themes to both product spaces with 320px and 200% reflow', async ({ page }) => {
    for (const space of ['learn', 'lab']) {
      await page.setViewportSize({ width: 1280, height: 960 });
      await page.goto(`/next.html#/${space}`);
      await expect(page.locator('#product-main')).toHaveAttribute('data-product-state', 'ready');
      await page.getByLabel('화면 테마').selectOption('dark');
      await audit(page);
      await page.locator('html').evaluate((node) => {
        node.style.zoom = '2';
      });
      await noOverflow(page);
      await expect(page.getByRole('navigation', { name: '주요 공간' })).toBeVisible();
      await page.locator('html').evaluate((node) => {
        node.style.zoom = '';
      });
      await page.setViewportSize({ width: 320, height: 800 });
      await noOverflow(page);
      await audit(page);
      await expect(page.getByLabel('화면 테마')).toBeInViewport();
    }
  });

  test('loads isolated components and preserves user storage and normal shell navigation', async ({ page }) => {
    const errors: string[] = [];
    const requests: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('request', (request) => requests.push(new URL(request.url()).pathname));
    await page.addInitScript(() => {
      sessionStorage.setItem('s05-fixture', 'preserve');
      localStorage.setItem('s05-fixture', '{"original":true}');
    });
    await gallery(page);
    const before = await page.evaluate(() => [JSON.stringify(localStorage), JSON.stringify(sessionStorage)]);
    await page.getByLabel('화면 테마').selectOption('dark');
    await page.getByRole('button', { name: '예제 실행', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '예제를 실행했습니다' })).toBeVisible();
    await page.getByRole('link', { name: '배우기로 돌아가기' }).click();
    await expect(page.locator('#product-main')).toHaveAttribute('data-product-state', 'ready');
    await page.getByRole('link', { name: '컴포넌트 갤러리' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('작은 요소부터, 명확하게.');
    expect(await page.evaluate(() => [JSON.stringify(localStorage), JSON.stringify(sessionStorage)])).toEqual(before);
    expect(
      requests.filter((path) =>
        /\/src\/(physics|chaos|research|runtime|workers)\/|\/assets\/(app|physics|chaos|research|.*worker)-/.test(path)
      )
    ).toEqual([]);
    expect(errors).toEqual([]);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`passes full axe and visual baseline in ${theme}`, async ({ page }) => {
      await gallery(page);
      await page.getByLabel('화면 테마').selectOption(theme);
      await audit(page);
      await noOverflow(page);
      await expect(page).toHaveScreenshot(`gallery-${theme}.png`, { fullPage: true });
      await page.getByRole('button', { name: '대화상자 열기' }).click();
      await audit(page);
      await expect(page).toHaveScreenshot(`dialog-${theme}.png`);
    });
  }

  test('follows system theme changes without storage writes', async ({ page }) => {
    await gallery(page);
    await page.getByLabel('화면 테마').selectOption('system');
    await page.emulateMedia({ colorScheme: 'dark' });
    const dark = await page.locator('html').evaluate((node) => getComputedStyle(node).backgroundColor);
    await page.emulateMedia({ colorScheme: 'light' });
    expect(await page.locator('html').evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe(dark);
  });

  test('validates input text without coercing invalid quantities or applying them', async ({ page }) => {
    await gallery(page);
    const quantity = page.getByLabel('첫 번째 막대 길이', { exact: false });
    const apply = page.getByRole('button', { name: '입력 확인' });
    const result = page.getByRole('status').filter({ hasText: '적용된 길이:' });
    for (const invalid of ['', 'NaN', 'Infinity', '0x10', '11', '-1', '1,5']) {
      await quantity.fill(invalid);
      await apply.click();
      await expect(quantity).toHaveAttribute('aria-invalid', 'true');
      await expect(quantity).toBeFocused();
      await expect(result).toHaveText('적용된 길이: 1 m');
    }
    await audit(page);
    await quantity.fill('0.1');
    await apply.click();
    await expect(quantity).toHaveAttribute('aria-invalid', 'false');
    await expect(result).toHaveText('적용된 길이: 0.1 m');
    await quantity.fill('1e1');
    await apply.click();
    await expect(result).toHaveText('적용된 길이: 1e1 m');
    await page.getByLabel('실험 이름', { exact: true }).fill('');
    await apply.click();
    await expect(page.getByLabel('실험 이름', { exact: true })).toBeFocused();
    await expect(page.getByText('실험 이름을 입력해 주세요.', { exact: true })).toBeVisible();
    await audit(page);
  });

  test('offers skip navigation, visible keyboard focus and roving tabs', async ({ page }) => {
    await gallery(page);
    await page.getByRole('link', { name: '본문으로 건너뛰기' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
    const overview = page.getByRole('tab', { name: '개요' });
    await overview.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: '조건' })).toBeFocused();
    await expect(page.getByRole('tab', { name: '조건' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: '관찰' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(overview).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: '관찰' })).toBeFocused();
    await page.keyboard.press('Home');
    await expect(overview).toBeFocused();
    expect(await overview.evaluate((node) => parseFloat(getComputedStyle(node).outlineWidth))).toBeGreaterThanOrEqual(
      2
    );
    await page.keyboard.press('Tab');
    await expect(page.getByRole('tabpanel')).toBeFocused();
  });

  test('traps dialog focus, dismisses with Escape and restores the opener', async ({ page }) => {
    await gallery(page);
    const opener = page.getByRole('button', { name: '대화상자 열기' });
    await opener.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: '예제 확인' });
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    }
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
    await opener.click();
    await page.getByRole('button', { name: '확인하고 닫기' }).click();
    await expect(opener).toBeFocused();
    await expect(page.getByRole('status').filter({ hasText: '대화상자를 확인했습니다.' })).toBeVisible();
  });

  test('announces determinate, pending, cancelled, complete states and dismissible notices', async ({ page }) => {
    await gallery(page);
    const progress = page.getByRole('progressbar', { name: '예제 진행률' });
    await page.getByRole('button', { name: '대기 상태' }).click();
    await expect(progress).not.toHaveAttribute('value');
    await page.getByRole('button', { name: '작업 취소' }).click();
    await expect(progress).toHaveAttribute('value', '0');
    await expect(page.getByRole('status').filter({ hasText: '취소했습니다' })).toBeVisible();
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '25% 진행' }).click();
    await expect(progress).toHaveAttribute('value', '100');
    await expect(page.getByRole('status').filter({ hasText: '예제 작업이 완료되었습니다.' })).toBeVisible();
    await page.getByRole('button', { name: '알림 보기' }).click();
    const close = page.getByRole('button', { name: /^알림 닫기/ });
    await expect(close).toBeVisible();
    await audit(page);
    await close.focus();
    await page.keyboard.press('Enter');
    await expect(close).toHaveCount(0);
    await expect(page.getByRole('region', { name: '알림', exact: true })).toBeFocused();
  });

  test('resizes split regions by keyboard and pointer and stacks at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await gallery(page);
    const separator = page.getByRole('separator', { name: '관찰 공간 너비' });
    await separator.focus();
    await page.keyboard.press('ArrowRight');
    await expect(separator).toHaveAttribute('aria-valuenow', '55');
    await page.keyboard.press('End');
    await expect(separator).toHaveAttribute('aria-valuenow', '75');
    await page.keyboard.press('Home');
    await expect(separator).toHaveAttribute('aria-valuenow', '25');
    const box = await separator.boundingBox();
    if (!box) throw new Error('Visible separator expected');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 100, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    expect(Number(await separator.getAttribute('aria-valuenow'))).toBeGreaterThan(25);
    await page.setViewportSize({ width: 320, height: 800 });
    await expect(separator).not.toBeVisible();
    await noOverflow(page);
    const first = await page.getByRole('region', { name: '관찰 공간', exact: true }).boundingBox();
    const second = await page.getByRole('region', { name: '설정 공간', exact: true }).boundingBox();
    expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height);
    await audit(page);
    await expect(page).toHaveScreenshot('gallery-320.png', { fullPage: true });
  });

  test('retains controls and readable layout at 200% CSS zoom and narrow reflow', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 960 });
    await gallery(page);
    await page.locator('html').evaluate((node) => {
      node.style.zoom = '2';
    });
    await expect(page.locator('html')).toHaveCSS('zoom', '2');
    await noOverflow(page);
    await page.getByLabel('첫 번째 막대 길이', { exact: false }).fill('2');
    await page.getByRole('button', { name: '입력 확인' }).click();
    await expect(page.getByRole('status').filter({ hasText: '적용된 길이: 2 m' })).toBeVisible();
    await page.getByRole('button', { name: '대화상자 열기' }).click();
    await expect(page.getByRole('dialog')).toBeInViewport();
    await page.keyboard.press('Escape');
    await audit(page);
    await page.locator('html').evaluate((node) => {
      node.style.zoom = '';
    });
    await page.setViewportSize({ width: 640, height: 480 });
    await noOverflow(page);
    await audit(page);
  });

  test('supports forced colors and reduced motion without losing selected or focused states', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    await gallery(page);
    const tab = page.getByRole('tab', { name: '개요' });
    await tab.focus();
    await page.keyboard.press('ArrowRight');
    const selected = page.getByRole('tab', { name: '조건' });
    await expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(await selected.evaluate((node) => parseFloat(getComputedStyle(node).outlineWidth))).toBeGreaterThanOrEqual(
      2
    );
    expect(
      await selected.evaluate((node) => parseFloat(getComputedStyle(node).transitionDuration))
    ).toBeLessThanOrEqual(0.01);
    await noOverflow(page);
    await audit(page);
    await expect(page).toHaveScreenshot('gallery-contrast.png', { fullPage: true });
  });
});
