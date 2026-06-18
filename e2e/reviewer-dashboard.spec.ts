import { expect, test } from '@playwright/test';

test('reviewer console loads report JSON and exposes rich evidence', async ({ page }) => {
  await page.goto('/reviewer.html');
  await expect(page.getByRole('heading', { name: 'Evidence overview' })).toBeVisible();
  await expect(page.locator('[data-evidence-id="flagship"]')).toContainText('gamma =');
  await expect(page.locator('[data-evidence-id="matrix"]')).toContainText('/3 vendors');

  const inspect = page.locator('[data-evidence-id="flagship"]').getByRole('button', { name: 'Inspect evidence' });
  await inspect.click();
  const dialog = page.getByTestId('evidence-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Source');
  await expect(dialog).toContainText('Parameters');
  await expect(dialog).toContainText('Validation / Error');
  await expect(dialog).toContainText('Reproduce');
  await expect(dialog).toContainText('Caveat');
  await dialog.getByRole('button', { name: 'Close evidence' }).click();
  await expect(dialog).not.toBeVisible();
});

test('reviewer console tabs expose vendor matrix and artifact ledger', async ({ page }) => {
  await page.goto('/reviewer.html');
  await page.getByRole('tab', { name: 'GPU Matrix' }).click();
  await expect(page.getByRole('heading', { name: 'WebGPU adapter matrix' })).toBeVisible();
  const matrix = page.locator('#panel-gpu .data-table');
  await expect(matrix.getByRole('row').filter({ hasText: 'intel' })).toBeVisible();
  await expect(matrix.getByRole('row').filter({ hasText: 'nvidia' })).toBeVisible();
  await expect(matrix.getByRole('row').filter({ hasText: 'amd' })).toBeVisible();

  await page.getByRole('tab', { name: 'Artifacts' }).click();
  await expect(page.getByRole('heading', { name: 'Artifact ledger' })).toBeVisible();
  await expect(page.getByText('flagship-study-json')).toBeVisible();
});
