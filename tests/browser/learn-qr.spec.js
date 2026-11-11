import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const learningUrl = 'https://huckoder.github.io/pokemon-tcg-timer/#learn';

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-11T12:00:00Z') });
  await page.goto('/');
});

test('learning QR dialog shares a direct link and leaves a running round unchanged', async ({ page }, testInfo) => {
  await page.clock.pauseAt(new Date('2026-11-11T12:01:00Z'));
  await page.getByRole('button', { name: 'Start round' }).click();
  const deadline = await page.evaluate(() => JSON.parse(localStorage.getItem('locals-tcg-timer-v1')).deadline);
  await page.getByRole('button', { name: 'Learning QR code', exact: true }).click();
  const dialog = page.locator('#learn-share-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Open learning guide', exact: true })).toHaveAttribute('href', learningUrl);
  await expect(dialog.getByRole('link', { name: 'Download QR code', exact: true })).toHaveAttribute('download', 'pokemon-learn-qr.svg');
  await expect(page.locator('#learn-share-code')).toHaveJSProperty('complete', true);
  expect(await page.locator('#learn-share-code').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  await page.locator('#learn-share-code').screenshot({ path: testInfo.outputPath('learning-qr.png') });
  await page.clock.fastForward(60000);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('locals-tcg-timer-v1')).deadline)).toBe(deadline);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('#learn-share-open')).toBeFocused();
  await expect(page.getByRole('timer')).toHaveText('29:00');
  await page.locator('#learn-share-open').click();
  await page.clock.resume();
  expect((await new AxeBuilder({ page }).include('#learn-share-dialog').analyze()).violations).toEqual([]);
});

test('scanned learning link opens the guide directly, keeps language and timer, and closes cleanly', async ({ page }) => {
  await page.getByRole('button', { name: 'Judge controls', exact: true }).click();
  await page.locator('#language').selectOption('sk');
  await page.locator('#settings-close').click();
  await page.getByRole('button', { name: 'Spustiť kolo' }).click();
  const deadline = await page.evaluate(() => JSON.parse(localStorage.getItem('locals-tcg-timer-v1')).deadline);
  await page.goto('/?from=qr#learn');
  await expect(page.locator('#learn-dialog')).toBeVisible();
  await expect(page.locator('#learn-dialog')).toHaveAttribute('lang', 'sk');
  await expect(page.locator('#learn-title')).toHaveText('Spoznaj hernú plochu');
  await expect(page.locator('.learn-slide')).toHaveAttribute('data-slide', '0');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('locals-tcg-timer-v1')).deadline)).toBe(deadline);
  await page.getByRole('button', { name: 'Späť na časomieru', exact: true }).click();
  await expect(page).toHaveURL(/\/\?from=qr$/);
  await page.reload();
  await expect(page.locator('#learn-dialog')).not.toBeVisible();
  await page.evaluate(() => { location.hash = 'learn'; });
  await expect(page.locator('#learn-dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Späť na časomieru', exact: true }).click();
  await page.getByRole('button', { name: 'QR kód na návod', exact: true }).click();
  await expect(page.locator('#learn-share-title')).toHaveText('Nauč sa hrať na svojom mobile');
  await expect(page.locator('#learn-share-code')).toHaveAttribute('alt', 'QR kód na návod na hru');
  await expect(page.getByRole('link', { name: 'Otvoriť návod na hru', exact: true })).toHaveAttribute('href', learningUrl);
});

for (const [width, height] of [[1366, 768], [1920, 1080]]) {
  test(`TV QR is visible and clear of the timer at ${width} × ${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    const checkLayout = async () => {
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('#learn-qr-open')).toBeInViewport({ ratio: 1 });
      const code = await page.locator('#learn-qr-open').boundingBox();
      const digits = await page.locator('#time-display').evaluate(element => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const bounds = range.getBoundingClientRect();
        const style = getComputedStyle(element);
        const context = document.createElement('canvas').getContext('2d');
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const ink = context.measureText(element.textContent);
        return {
          x: bounds.x - ink.actualBoundingBoxLeft,
          y: bounds.y + ink.fontBoundingBoxAscent - ink.actualBoundingBoxAscent,
          width: ink.actualBoundingBoxLeft + ink.actualBoundingBoxRight,
          height: ink.actualBoundingBoxAscent + ink.actualBoundingBoxDescent,
        };
      });
      const overlaps = code.x < digits.x + digits.width && code.x + code.width > digits.x && code.y < digits.y + digits.height && code.y + code.height > digits.y;
      await page.screenshot({ path: testInfo.outputPath(`timer-qr-${await page.locator('#time-display').textContent()}.png`) });
      expect(overlaps, `QR code does not cover the timer digits: ${JSON.stringify({ code, digits })}`).toBe(false);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    };
    await page.getByRole('button', { name: 'TV mode', exact: true }).click();
    await checkLayout();
    await page.locator('#learn-qr-open img').screenshot({ path: testInfo.outputPath('tv-learning-qr.png') });
    await page.screenshot({ path: testInfo.outputPath('tv-timer-qr.png') });
    await page.locator('#tv-exit').click();
    await page.getByRole('button', { name: 'Judge controls', exact: true }).click();
    await page.locator('#round-minutes').fill('180');
    await page.getByRole('button', { name: 'Save round settings', exact: true }).click();
    await page.locator('#settings-close').click();
    await page.getByRole('button', { name: 'TV mode', exact: true }).click();
    await expect(page.getByRole('timer')).toHaveText('180:00');
    await checkLayout();
    await page.locator('#learn-qr-open').click();
    await expect(page.locator('#learn-share-dialog')).toBeVisible();
    expect((await new AxeBuilder({ page }).include('#learn-share-dialog').analyze()).violations).toEqual([]);
    await page.locator('#learn-share-close').click();
    await expect(page.locator('#learn-qr-open')).toBeFocused();
  });
}

test('QR dialog fits a small phone and opens the guide with one tap', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole('button', { name: 'Learning QR code', exact: true }).click();
  const dialog = page.locator('#learn-share-dialog');
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(dialog.getByRole('link', { name: 'Open learning guide', exact: true })).toBeInViewport({ ratio: 1 });
  expect((await new AxeBuilder({ page }).include('#learn-share-dialog').analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('mobile-learning-qr.png') });
});

for (const [width, height] of [[320, 740], [1366, 768], [1920, 1080]]) {
  test(`guide QR stays visible across all sections at ${width} × ${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    if (width > 900) await page.getByRole('button', { name: 'TV mode', exact: true }).click();
    await page.locator(width > 900 ? '#tv-learn' : '#learn-open').click();
    const qr = page.locator('.learn-guide-qr');
    const slide = page.locator('.learn-slide');
    for (const language of ['en', 'sk']) {
      if (language === 'sk') await page.locator('[data-language]').click();
      await expect(qr).toHaveAccessibleName(language === 'en' ? 'Scan to learn: show QR code' : 'Naskenuj návod: zobraziť QR kód');
      for (let index = 0; index < 8; index++) {
        await page.locator(`[data-slide-to="${index}"]`).click();
        await expect(slide).toHaveAttribute('data-slide', String(index));
        await expect(qr).toBeInViewport({ ratio: 1 });
        await slide.evaluate(element => { element.scrollTop = element.scrollHeight; });
        await expect(qr).toBeInViewport({ ratio: 1 });
        const codeBounds = await qr.boundingBox();
        const contentBounds = await slide.boundingBox();
        expect(codeBounds.y + codeBounds.height).toBeLessThanOrEqual(contentBounds.y);
        expect(await page.locator('.learn-header').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      }
    }
    await page.clock.fastForward(15000);
    await expect(qr).toBeInViewport({ ratio: 1 });
    await qr.locator('img').screenshot({ path: testInfo.outputPath('guide-learning-qr.png') });
    await page.screenshot({ path: testInfo.outputPath('guide-with-qr.png') });
    await qr.click();
    await expect(page.locator('#learn-share-dialog')).toBeVisible();
    await page.locator('#learn-share-close').click();
    await expect(qr).toBeFocused();
    await expect(slide).toHaveAttribute('data-slide', '7');
    await expect(page.locator('#learn-dialog')).toBeVisible();
  });
}
