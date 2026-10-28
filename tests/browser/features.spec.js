import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-28T12:00:00Z') });
  await page.goto('/');
});

const openSettings = (page) => page.getByRole('button', { name: 'Judge controls', exact: true }).click();
const closeSettings = (page) => page.getByRole('button', { name: 'Close judge controls', exact: true }).click();

test('custom duration survives refresh and still enters exactly 15 minutes of overtime', async ({ page }) => {
  await page.getByRole('button', { name: 'BO3 50 min' }).click();
  await openSettings(page);
  await page.getByLabel('Round length (minutes)', { exact: true }).fill('75');
  await page.getByRole('button', { name: 'Save round settings' }).click();
  await closeSettings(page);
  await expect(page.getByRole('timer')).toHaveText('75:00');
  await expect(page.locator('#duration-label')).toHaveText('75 MINUTES · CUSTOM');
  await page.reload();
  await expect(page.getByRole('timer')).toHaveText('75:00');
  await page.getByRole('button', { name: 'Start round' }).click();
  await page.clock.fastForward(75 * 60000);
  await expect(page.getByRole('timer')).toHaveText('15:00');
  await expect(page.locator('#status-label')).toHaveText('TIME CALLED · OVERTIME');
});

test('duration validation enforces minimums and active round numbers can be corrected safely', async ({ page }) => {
  await openSettings(page);
  await page.getByLabel('Round length (minutes)', { exact: true }).fill('29');
  await page.getByRole('button', { name: 'Save round settings' }).click();
  expect(await page.getByLabel('Round length (minutes)', { exact: true }).evaluate(input => input.validity.rangeUnderflow)).toBe(true);
  await closeSettings(page);
  await expect(page.getByRole('timer')).toHaveText('30:00');
  await page.getByRole('button', { name: 'Start round' }).click();
  await page.clock.fastForward(2 * 60000);
  await openSettings(page);
  await expect(page.getByLabel('Round length (minutes)', { exact: true })).toBeDisabled();
  await page.getByLabel('Round number', { exact: true }).fill('4');
  await page.getByRole('button', { name: 'Save round settings' }).click();
  await closeSettings(page);
  await expect(page.locator('#round-label')).toHaveText('ROUND 04');
  await expect(page.getByRole('timer')).toHaveText('28:00');
  await expect(page.getByRole('button', { name: 'Pause timer' })).toBeVisible();
});

test('break countdown supports pause, reload and completion without starting a round', async ({ page }) => {
  await page.getByRole('button', { name: 'Break mode', exact: true }).click();
  await page.getByLabel('Break length (minutes)', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Start break', exact: true }).click();
  await expect(page.getByRole('timer')).toHaveText('05:00');
  await expect(page.getByRole('heading', { name: 'Next round starts in…' })).toBeVisible();
  await page.clock.fastForward(60000);
  await page.getByRole('button', { name: 'Pause timer' }).click();
  await page.reload();
  await page.clock.fastForward(60000);
  await expect(page.getByRole('timer')).toHaveText('04:00');
  await page.getByRole('button', { name: 'Resume timer' }).click();
  await page.clock.fastForward(10 * 60000);
  await expect(page.locator('#status-label')).toHaveText('BREAK COMPLETE');
  await expect(page.getByRole('timer')).toHaveText('00:00');
  await page.getByRole('button', { name: 'Back to round' }).click();
  await expect(page.locator('#round-label')).toHaveText('ROUND 01');
  await expect(page.getByRole('timer')).toHaveText('30:00');
  await expect(page.getByRole('button', { name: 'Start round' })).toBeVisible();
});

test('starting a break during a round requires confirmation and prepares the next round', async ({ page }) => {
  await page.getByRole('button', { name: 'Start round' }).click();
  await page.getByRole('button', { name: 'Break mode', exact: true }).click();
  await page.getByRole('button', { name: 'Start break', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'End this round and start a break?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep playing' }).click();
  await expect(page.locator('#settings-dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Start break', exact: true }).click();
  await page.locator('#confirm-dialog').getByRole('button', { name: 'Start break', exact: true }).click();
  await expect(page.locator('#settings-dialog')).not.toBeVisible();
  await expect(page.getByRole('timer')).toHaveText('10:00');
  await page.clock.fastForward(10 * 60000);
  await page.getByRole('button', { name: 'Back to round' }).click();
  await expect(page.locator('#round-label')).toHaveText('ROUND 02');
  await expect(page.getByRole('button', { name: 'Start round' })).toBeVisible();
});

test('table extension notes update, persist, and never change the main deadline', async ({ page }) => {
  await page.getByRole('button', { name: 'Start round' }).click();
  await openSettings(page);
  const deadline = await page.evaluate(() => JSON.parse(localStorage.getItem('locals-tcg-timer-v1')).deadline);
  await page.getByLabel('Table', { exact: true }).fill('4');
  await page.getByLabel('Total extension (minutes)', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Add / update' }).click();
  await page.getByLabel('Table', { exact: true }).fill('4');
  await page.getByLabel('Total extension (minutes)', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Add / update' }).click();
  await expect(page.locator('#extension-list li')).toHaveCount(1);
  await expect(page.locator('#extension-list')).toContainText('Table 4: +5 min');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('locals-tcg-timer-v1')).deadline)).toBe(deadline);
  await closeSettings(page);
  await expect(page.locator('#extensions-summary')).toContainText('Table 4: +5 min');
  await page.reload();
  await expect(page.locator('#extensions-summary')).toContainText('Table 4: +5 min');
  await openSettings(page);
  await page.getByLabel('Show extension notes on the display').uncheck();
  await closeSettings(page);
  await expect(page.locator('#extensions-summary')).not.toBeVisible();
  await openSettings(page);
  await page.getByRole('button', { name: 'Remove extension for table 4', exact: true }).click();
  await expect(page.locator('#extensions-empty')).toBeVisible();
});

test('new tournament confirms, clears clocks and notes, and keeps format, duration and preferences', async ({ page }) => {
  await page.getByRole('button', { name: 'BO3 50 min' }).click();
  await openSettings(page);
  await page.getByLabel('Round number', { exact: true }).fill('7');
  await page.getByLabel('Round length (minutes)', { exact: true }).fill('75');
  await page.getByRole('button', { name: 'Save round settings' }).click();
  await page.getByLabel('Volume', { exact: true }).evaluate(input => { input.value = '40'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.getByLabel('Table', { exact: true }).fill('4');
  await page.getByRole('button', { name: 'Add / update' }).click();
  await page.getByRole('button', { name: 'New tournament', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Start a new tournament?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep playing' }).click();
  await expect(page.locator('#extension-list li')).toHaveCount(1);
  await page.getByRole('button', { name: 'New tournament', exact: true }).click();
  await page.locator('#confirm-dialog').getByRole('button', { name: 'New tournament', exact: true }).click();
  await expect(page.locator('#round-label')).toHaveText('ROUND 01');
  await expect(page.getByRole('timer')).toHaveText('75:00');
  await expect(page.locator('#extensions-summary')).not.toBeVisible();
  await openSettings(page);
  await expect(page.locator('#volume-value')).toHaveText('40%');
  await expect(page.locator('#extension-list li')).toHaveCount(0);
});

test('Slovak translates controls, break instructions and rules, and survives reload', async ({ page }) => {
  await openSettings(page);
  await page.getByLabel('Language', { exact: true }).selectOption('sk');
  await expect(page.locator('html')).toHaveAttribute('lang', 'sk');
  await expect(page.getByRole('heading', { name: 'Panel rozhodcu', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Zavrieť panel rozhodcu', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Spustiť kolo' })).toBeVisible();
  await expect(page.locator('#round-label')).toHaveText('KOLO 01');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Spustiť kolo' })).toBeVisible();
  await page.getByRole('button', { name: 'Časové pravidlá', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pravidlá času.' })).toBeVisible();
  await expect(page.locator('#rules-dialog')).toContainText('3 ďalšie ťahy');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Prestávka', exact: true }).click();
  await page.getByRole('button', { name: 'Spustiť prestávku', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ďalšie kolo sa začína o…' })).toBeVisible();
  await page.clock.fastForward(10 * 60000);
  await expect(page.locator('#status-label')).toHaveText('PRESTÁVKA SKONČILA');
});

test('judge controls pass accessibility checks in both languages', async ({ page }) => {
  await openSettings(page);
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
  await page.getByLabel('Language', { exact: true }).selectOption('sk');
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
  await page.screenshot({ path: '/tmp/opencode/kraken-judge-controls-sk.png' });
});

test('long custom timers and extension notes fit the TV without scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openSettings(page);
  await page.getByLabel('Round length (minutes)', { exact: true }).fill('180');
  await page.getByRole('button', { name: 'Save round settings' }).click();
  await page.getByLabel('Table', { exact: true }).fill('4');
  await page.getByRole('button', { name: 'Add / update' }).click();
  await page.getByLabel('Language', { exact: true }).selectOption('sk');
  await page.getByRole('button', { name: 'Zavrieť panel rozhodcu', exact: true }).click();
  await page.keyboard.press('f');
  await expect(page.getByRole('timer')).toHaveText('180:00');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await expect(page.locator('#extensions-summary')).toContainText('Stôl 4: +3 min');
  await page.screenshot({ path: '/tmp/opencode/kraken-tv-custom-sk.png' });
});

test('new state and preferences synchronize to a separate display tab', async ({ page, context }) => {
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 1000));
  const display = await context.newPage();
  await display.goto('/');
  await openSettings(page);
  await page.getByLabel('Round length (minutes)', { exact: true }).fill('60');
  await page.getByRole('button', { name: 'Save round settings' }).click();
  await expect(display.getByRole('timer')).toHaveText('60:00');
  await page.getByLabel('Language', { exact: true }).selectOption('sk');
  await expect(display.locator('#round-label')).toHaveText('KOLO 01');
  await page.getByRole('button', { name: 'Spustiť prestávku', exact: true }).click();
  await expect(display.getByRole('timer')).toHaveText('10:00');
  await expect(display.locator('#status-label')).toHaveText('PREBIEHA PRESTÁVKA');
});

test('many long table notes stay compact and table names are rendered as text', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openSettings(page);
  for (const table of ['<img src=x>', 'Long table number 2', 'Long table number 3', 'Long table number 4', 'Long table number 5']) {
    await page.getByLabel('Table', { exact: true }).fill(table);
    await page.getByRole('button', { name: 'Add / update' }).click();
  }
  await expect(page.locator('#extension-list img')).toHaveCount(0);
  await closeSettings(page);
  await expect(page.locator('#extensions-summary')).toContainText('+1 more · ask a judge');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await page.keyboard.press('f');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
});

test('small-screen Slovak controls and settings fit horizontally', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await openSettings(page);
  await page.getByLabel('Language', { exact: true }).selectOption('sk');
  expect(await page.locator('#settings-dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'Zavrieť panel rozhodcu', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
