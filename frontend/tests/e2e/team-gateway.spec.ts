import { test, expect } from '@playwright/test';
const team = 'http://127.0.0.1:3211';
test('existing team frontend → Node API → FastAPI: evaluate, evidence, review, and version', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const imported = await page.request.post(team + '/api/datasets/demo', { data: {} });
  expect(imported.ok()).toBe(true);
  await page.goto(team);
  await page.locator('#lang-switch [data-lang="en"]').click();
  await expect(page.locator('#integration-test-banner')).toContainText('TEST MODE');
  await page.locator('#nav a[href="#/dialogs"]').click();
  await page.locator('#rows tr').filter({ hasText: 'demo-ru-001' }).click();
  await expect(page.locator('.dlg-head h2')).toHaveText('demo-ru-001');
  await page.locator('#run').click();
  await expect(page.locator('.crit')).toHaveCount(8);
  await expect(page.locator('#result')).toContainText('TEST MODE');
  await page.locator('.ev-chip[data-goto]').first().click();
  await expect(page.locator('.msg.flash')).toHaveCount(1);
  await page.locator('[data-dispute="C01"]').click();
  await page.locator('#ap-comment').fill('Inspect the opening in this integration fixture.');
  await page.locator('#ap-send').click();
  await expect(page.locator('#modal-root')).toBeEmpty();
  await page.locator('#nav a[href="#/appeals"]').click();
  await page.locator('[data-review]').click();
  await page.locator('input[name="d"][value="changed"]').check();
  await page.locator('#nv').selectOption('no');
  await page.locator('#reason').fill('Changed after inspecting the initial operator reply.');
  await page.locator('#decide').click();
  await expect(page.locator('#modal-root')).toBeEmpty();
  await expect(page.locator('.ap-card .delta')).toContainText('90');
  const appeals = await (await page.request.get(team + '/api/appeals')).json();
  const appeal = appeals.appeals[0];
  expect(appeal.total_before).toBe(100);
  expect(appeal.total_after).toBe(90);
  const original = await (
    await page.request.get('http://127.0.0.1:8012/api/evaluations/' + appeal.evaluation_id)
  ).json();
  expect(original.original.score).toBe('100.00');
  expect(original.final.score).toBe('90.00');
  await page.locator('#nav a[href="#/checklists"]').click();
  await page.locator('[data-ci="0"] .c-row').click();
  await page
    .locator('[data-ci="0"] [data-f="title"]')
    .fill('Replacement criterion through team UI');
  await page
    .locator('[data-ci="0"] [data-f="description"]')
    .fill('Assess the newly configured behavior; no source change is needed.');
  await page.locator('#save').click();
  await expect(page.locator('#active-checklist')).toContainText('v2');
  await page.goto(team + '/#/dialog/' + appeal.conversation_id);
  await page.locator('#run').click();
  await expect(page.locator('.crit h4').first()).toHaveText(
    'Replacement criterion through team UI',
  );
  const runs = await (
    await page.request.get(
      'http://127.0.0.1:8012/api/conversations/' + appeal.conversation_id + '/evaluations',
    )
  ).json();
  expect(runs).toHaveLength(2);
  expect(
    new Set(runs.map((r: { checklist_version_id: string }) => r.checklist_version_id)).size,
  ).toBe(2);
  await page.screenshot({ path: 'test-results/team-ui-report.png', fullPage: true });
  const library = await (await page.request.get(team + '/api/conversations')).json();
  const call = library.conversations.find((c: { channel: string }) => c.channel === 'voice call');
  await page.goto(team + '/#/dialog/' + call.conversation_id);
  await expect(page.locator('#audio')).toBeVisible();
  await expect(page.locator('#tbody')).toContainText('2026-11-01T10:00:00+05:00');
  await expect(page.locator('[data-play]')).toHaveCount(0);
  for (const route of ['#/', '#/dialogs', '#/checklists', '#/appeals', '#/import']) {
    await page.goto(team + '/' + route);
    await expect(page.locator('#view')).not.toContainText('API недоступен');
    await expect(page.locator('#view .skeleton')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
