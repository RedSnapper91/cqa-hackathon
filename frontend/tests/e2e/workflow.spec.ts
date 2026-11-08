import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('close', () => expect(errors).toEqual([]));
});
test('import → evaluate → evidence → appeal → review → v2 → compare', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('TEST MODE · Deterministic test output')).toBeVisible();
  await page.getByRole('button', { name: 'Import dataset' }).click();
  await page.getByRole('button', { name: 'Load synthetic demo' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('link', { name: 'Conversations', exact: true }).click();
  await page.getByLabel('Filter language').selectOption('RU');
  await page.getByRole('link', { name: 'Open demo-ru-001', exact: true }).click();
  await page.getByRole('button', { name: 'Run evaluation', exact: true }).first().click();
  await expect(page.getByText('FINAL WEIGHTED SCORE · V1')).toBeVisible();
  await expect(page.getByText('100.00', { exact: true }).first()).toBeVisible();
  await page
    .getByRole('button', { name: /#\d+ · operator/ })
    .first()
    .click();
  await expect(page.locator('.message.highlighted')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/report-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Appeal criterion', exact: true }).first().click();
  await page.getByLabel('Appeal comment').fill('Please reconsider the opening requirement.');
  await page.getByRole('button', { name: 'Submit appeal' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('link', { name: 'Appeals & review', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Supervisor mode' }).check();
  await page.getByRole('button', { name: 'Review evidence & decide' }).click();
  await page.getByLabel('Review decision').selectOption('change');
  await page.getByLabel('Revised score').selectOption('0');
  await page
    .getByLabel('Reviewer reason')
    .fill('Reviewed the initial response; criterion needs a changed test judgment.');
  await page.getByRole('button', { name: 'Save review decision' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button', { name: 'Changed', exact: true }).click();
  await expect(page.getByText('90.00', { exact: true })).toBeVisible();
  await expect(page.getByText('100.00', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Checklists', exact: true }).click();
  await page.getByRole('button', { name: /Установление контакта/ }).click();
  await page.getByLabel('Title C01').fill('Новый критерий через интерфейс');
  await page
    .getByLabel('Description C01')
    .fill('Проверьте новое условие работы оператора. Это тест настройки без изменения кода.');
  await page.screenshot({ path: 'test-results/checklist-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Save as new version' }).click();
  await expect(page.getByText('v2 saved and available for evaluation')).toBeVisible();
  await page.getByRole('link', { name: 'Conversations', exact: true }).click();
  await page.getByLabel('Filter language').selectOption('RU');
  await page.getByRole('link', { name: 'Open demo-ru-001', exact: true }).click();
  await page.getByLabel('Evaluation checklist version').selectOption({ index: 0 });
  await expect(page.getByText('Not evaluated under this version')).toBeVisible();
  await page.getByRole('button', { name: 'Run evaluation', exact: true }).first().click();
  await expect(page.getByText('FINAL WEIGHTED SCORE · V2')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Новый критерий через интерфейс' })).toBeVisible();
  await page.getByRole('link', { name: 'Compare versions' }).click();
  await expect(page.getByText('CHECKLIST V1', { exact: true })).toBeVisible();
  await expect(page.getByText('CHECKLIST V2', { exact: true })).toBeVisible();
  await expect(page.locator('.comparison-column')).toHaveCount(2);
  await expect(
    page.locator('.comparison-column').first().locator('.comparison-header .score'),
  ).toContainText('90.00');
  await expect(
    page.locator('.comparison-column').last().locator('.comparison-header .score'),
  ).toContainText('100.00');
  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    view: innerWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.view);
});
test('normal navigation, batch processing, and responsive dashboard', async ({ page }) => {
  await page.request.post('/api/datasets/demo');
  await page.goto('/conversations');
  await page.getByLabel('Filter channel').selectOption('agent chat');
  await page.getByRole('button', { name: 'Evaluate all matching' }).click();
  await expect(page.getByText('9 completed', { exact: true })).toBeVisible({ timeout: 20000 });
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Your quality overview/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true });
  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    view: innerWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.view);
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await page.getByRole('link', { name: 'Checklists', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Checklist studio/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
