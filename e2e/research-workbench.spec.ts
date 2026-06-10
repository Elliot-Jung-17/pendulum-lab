import { expect, test } from '@playwright/test';

test('research workbench saves experiments and prepares study exports', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('pendulum-lab/research-workbench/v1');
  });
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  await page.locator('.rail-menu-button[data-rail-section-button="govern"]').click();
  await page.locator('#rail-panel-govern .tab[data-tab="research"]').click();
  await expect(page.locator('#researchWorkbench')).toBeVisible();

  await page.locator('#rwExperimentName').fill('E2E research experiment');
  await page.locator('#rwExperimentNotes').fill('baseline reproducibility check');
  await page.locator('#rwSaveExperiment').click();
  await expect(page.locator('#rwExperimentSummary')).toContainText('1 experiment');

  await page.locator('#rwStudyVariable').selectOption('theta1');
  await page.locator('#rwStudyMin').fill('-0.5');
  await page.locator('#rwStudyMax').fill('0.5');
  await page.locator('#rwStudyCount').fill('4');
  await page.locator('#rwGenerateStudy').click();
  await expect(page.locator('#rwStudySummary')).toContainText('4 points');

  await page.locator('#rwRebuildComparison').click();
  await expect(page.locator('#rwComparisonMatrix')).toContainText('E2E research experiment');
  await expect(page.locator('#rwPaperSummary')).toContainText('ready');
});

test('study batch fills lambda/RQA/FTLE per point on the chaos worker', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('pendulum-lab/research-workbench/v1');
  });
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  await page.locator('.rail-menu-button[data-rail-section-button="govern"]').click();
  await page.locator('#rail-panel-govern .tab[data-tab="research"]').click();
  await expect(page.locator('#researchWorkbench')).toBeVisible();

  await page.locator('#rwStudyVariable').selectOption('theta1');
  await page.locator('#rwStudyMin').fill('1.5');
  await page.locator('#rwStudyMax').fill('2.5');
  await page.locator('#rwStudyCount').fill('3');
  await page.locator('#rwGenerateStudy').click();
  await expect(page.locator('#rwStudySummary')).toContainText('3 points');

  await page.locator('#rwRunStudyBatch').click();
  await expect(page.locator('#rwStudySummary')).toContainText('3/3 points have batch results', { timeout: 60_000 });
  // The results table shows all three diagnostics for the first point.
  await expect(page.locator('#rwStudyResults table')).toBeVisible();
  await expect(page.locator('#rwStudyResults')).toContainText('theta1=1.5');
  await expect(page.locator('#rwStudyResults th').nth(1)).toContainText('lambda max');
  await expect(page.locator('#rwStudyResults th').nth(4)).toContainText('FTLE');
});

test('periodic-orbit finder converges and the branch trace reports stability', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  await page.locator('.rail-menu-button[data-rail-section-button="govern"]').click();
  await page.locator('#rail-panel-govern .tab[data-tab="research"]').click();
  await expect(page.locator('#researchOrbitCard')).toBeVisible();

  await page.locator('#rwFindOrbit').click();
  await expect(page.locator('#rwOrbitSummary')).toContainText('period-1 orbit');
  await expect(page.locator('#rwOrbitSummary')).toContainText('STABLE');

  await page.locator('#rwOrbitSweepTo').fill('0.6');
  await page.locator('#rwTraceBranch').click();
  await expect(page.locator('#rwOrbitSummary')).toContainText('Branch traced', { timeout: 30_000 });
  await expect(page.locator('#rwOrbitBranch table')).toBeVisible();
  await expect(page.locator('#rwOrbitBranch')).toContainText('stable');
});

test('figure pack export downloads a captioned HTML gallery', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  // Let the lab draw a few frames so the main canvas has content to capture.
  await page.waitForTimeout(600);

  await page.locator('.rail-menu-button[data-rail-section-button="govern"]').click();
  await page.locator('#rail-panel-govern .tab[data-tab="research"]').click();
  await expect(page.locator('#researchWorkbench')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#rwExportFigures').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('pendulum_paper_figures.html');
});
