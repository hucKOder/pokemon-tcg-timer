import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-28T12:00:00Z') });
  await page.goto('/');
});

test('BO1 / BO3 presets, start, pause and resume', async ({ page }) => {
  await expect(page.getByRole('timer')).toHaveText('30:00');
  await page.getByRole('button', { name: 'BO3 50 min' }).click();
  await expect(page.getByRole('timer')).toHaveText('50:00');
  await page.getByRole('button', { name: 'Start round' }).click();
  await page.clock.fastForward(61000);
  await expect(page.getByRole('timer')).toHaveText('48:59');
  await page.getByRole('button', { name: 'Pause timer' }).click();
  await page.clock.fastForward(600000);
  await expect(page.getByRole('timer')).toHaveText('48:59');
  await expect(page.locator('#status-label')).toHaveText('TIMER PAUSED');
  await page.getByRole('button', { name: 'Resume timer' }).click();
  await page.clock.fastForward(1000);
  await expect(page.getByRole('timer')).toHaveText('48:58');
});

test('automatically enters overtime and finishes at the 15-minute limit', async ({ page }) => {
  await page.getByRole('button', { name: 'Start round' }).click();
  await page.clock.fastForward(30 * 60000);
  await expect(page.getByRole('timer')).toHaveText('15:00');
  await expect(page.locator('#status-label')).toHaveText('TIME CALLED · OVERTIME');
  await expect(page.getByRole('heading', { name: 'Finish the current turn, then 3 additional turns.' })).toBeVisible();
  await page.clock.fastForward(15 * 60000);
  await expect(page.getByRole('timer')).toHaveText('00:00');
  await expect(page.getByRole('button', { name: 'Round complete' })).toBeDisabled();
  await page.getByRole('button', { name: 'Next round' }).click();
  await expect(page.locator('#round-label')).toHaveText('ROUND 02');
  await expect(page.getByRole('timer')).toHaveText('30:00');
  await expect(page.getByRole('button', { name: 'Start round' })).toBeVisible();
});

test('late tick gets only the overtime remaining, not a new 15 minutes', async ({ page }) => {
  await page.getByRole('button', { name: 'Start round' }).click();
  await page.clock.fastForward(40 * 60000);
  await expect(page.getByRole('timer')).toHaveText('05:00');
  await expect(page.locator('#status-label')).toHaveText('TIME CALLED · OVERTIME');
});

test('refresh recovers a running timer', async ({ page }) => {
  await page.getByRole('button', { name: 'Start round' }).click();
  await page.clock.fastForward(10 * 60000);
  await page.reload();
  await expect(page.getByRole('timer')).toHaveText('20:00');
  await expect(page.getByRole('button', { name: 'Pause timer' })).toBeVisible();
});

test('reset confirmation is safe and the clock continues behind it', async ({ page }) => {
  await page.getByRole('button', { name: 'Start round' }).click();
  await page.getByRole('button', { name: 'Reset round', exact: true }).click();
  await page.clock.fastForward(60000);
  await expect(page.getByRole('timer')).toHaveText('29:00');
  await page.getByRole('button', { name: 'Keep playing' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('timer')).toHaveText('29:00');
  await page.getByRole('button', { name: 'Reset round', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset round' }).click();
  await expect(page.getByRole('timer')).toHaveText('30:00');
  await expect(page.getByRole('button', { name: 'Start round' })).toBeVisible();
});

test('format change during an active round requires confirmation', async ({ page }) => {
  await page.getByRole('button', { name: 'Start round' }).click();
  await page.getByRole('button', { name: 'BO3 50 min' }).click();
  await page.getByRole('button', { name: 'Keep playing' }).click();
  await expect(page.getByRole('button', { name: 'BO1 30 min' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'BO3 50 min' }).click();
  await page.getByRole('button', { name: 'Use BO3' }).click();
  await expect(page.getByRole('timer')).toHaveText('50:00');
  await expect(page.getByRole('button', { name: 'Start round' })).toBeVisible();
});

test('TV mode hides controls and Space operates the timer rather than exiting TV mode', async ({ page }) => {
  await page.keyboard.press('f');
  await expect(page.locator('body')).toHaveClass('tv-mode');
  await expect(page.locator('.control-panel')).not.toBeVisible();
  await page.keyboard.press('Space');
  await page.clock.fastForward(1000);
  await expect(page.getByRole('timer')).toHaveText('29:59');
  await expect(page.locator('body')).toHaveClass('tv-mode');
  await page.keyboard.press('Space');
  await expect(page.locator('#status-label')).toHaveText('TIMER PAUSED');
  await page.keyboard.press('f');
  await expect(page.locator('body')).not.toHaveClass('tv-mode');
  await expect(page.locator('.control-panel')).toBeVisible();
});

test('rules are accessible and explain table-specific turns and extensions', async ({ page }) => {
  await page.getByRole('button', { name: 'Timing rules' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'On the clock.' })).toBeVisible();
  await expect(dialog).toContainText('Individual judge-granted time extensions');
  await expect(dialog.getByRole('link')).toHaveAttribute('href', /pokemon-tcg-tournament-handbook-en.pdf$/);
  await page.keyboard.press('Space');
  await expect(page.getByRole('timer')).toHaveText('30:00');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});

test('mute preference persists across refresh', async ({ page }) => {
  await page.getByRole('button', { name: 'Mute alerts' }).click();
  await expect(page.getByRole('button', { name: 'Enable alerts' })).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Enable alerts' })).toBeVisible();
});

test('works with local storage disabled', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('Storage blocked'); };
    Storage.prototype.setItem = () => { throw new Error('Storage blocked'); };
  });
  await page.reload();
  await page.getByRole('button', { name: 'Start round' }).click();
  await page.clock.fastForward(30000);
  await expect(page.getByRole('timer')).toHaveText('29:30');
});

test('no external requests or JavaScript errors', async ({ page }) => {
  const errors = [];
  const external = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => { if (!request.url().startsWith('http://127.0.0.1:4173/')) external.push(request.url()); });
  await page.reload();
  await page.getByRole('button', { name: 'Start round' }).click();
  await page.clock.fastForward(45 * 60000);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

for (const [name, width, height] of [['laptop', 1366, 768], ['desktop', 1440, 900], ['TV', 1920, 1080], ['mobile', 390, 844]]) {
  test(`${name} layout fits horizontally and controls remain usable`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width >= 800) expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    await expect(page.getByRole('button', { name: 'Start round' })).toBeVisible();
    await page.screenshot({ path: `/tmp/opencode/timer-${name.toLowerCase()}.png`, fullPage: true });
  });
}

test('TV overtime fits a 1366 × 768 display', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole('button', { name: 'Start round' }).click();
  // Avoid fullscreen resizing the test viewport; exercise the identical TV layout directly.
  await page.evaluate(() => { document.body.classList.add('tv-mode'); });
  await page.clock.fastForward(30 * 60000);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await page.screenshot({ path: '/tmp/opencode/timer-overtime.png', fullPage: true });
});

test('multiple tabs synchronize start, pause and round changes', async ({ page, context }) => {
  const second = await context.newPage();
  await second.goto('/');
  await page.getByRole('button', { name: 'Start round' }).click();
  await expect(second.getByRole('button', { name: 'Pause timer' })).toBeVisible();
  await second.getByRole('button', { name: 'Pause timer' }).click();
  await expect(page.getByRole('button', { name: 'Resume timer' })).toBeVisible();
  await page.getByRole('button', { name: 'Next round' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Next round' }).click();
  await expect(second.locator('#round-label')).toHaveText('ROUND 02');
  await expect(second.getByRole('button', { name: 'Start round' })).toBeVisible();
});

test('main screen and timing rules pass automated accessibility checks', async ({ page }) => {
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
  await page.getByRole('button', { name: 'Timing rules' }).click();
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('overtime and TV mode pass automated accessibility checks', async ({ page }) => {
  await page.getByRole('button', { name: 'Start round' }).click();
  await page.clock.fastForward(30 * 60000);
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
  await page.keyboard.press('f');
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
});
