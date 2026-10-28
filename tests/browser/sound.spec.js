import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-28T12:00:00Z') });
  await page.addInitScript(() => {
    window.audioEvents = [];
    const prototype = AudioContext.prototype;
    const createBufferSource = prototype.createBufferSource;
    const createOscillator = prototype.createOscillator;
    const decode = prototype.decodeAudioData;
    prototype.createBufferSource = function (...args) {
      const source = createBufferSource.apply(this, args);
      const start = source.start.bind(source);
      const stop = source.stop.bind(source);
      source.start = (...startArgs) => {
        window.audioEvents.push({ type: 'sample', duration: source.buffer.duration });
        start(...startArgs);
      };
      source.stop = (...stopArgs) => {
        window.audioEvents.push({ type: 'stop-sample' });
        stop(...stopArgs);
      };
      return source;
    };
    prototype.createOscillator = function (...args) {
      const source = createOscillator.apply(this, args);
      const start = source.start.bind(source);
      source.start = (...startArgs) => {
        window.audioEvents.push({ type: 'generated', frequency: source.frequency.value });
        start(...startArgs);
      };
      return source;
    };
    prototype.decodeAudioData = async function (...args) {
      const buffer = await decode.apply(this, args);
      window.decodedDuration = buffer.duration;
      return buffer;
    };
  });
  await page.goto('/');
});

test('round end plays the real item-received clip; overtime limit stays distinct', async ({ page }) => {
  await page.getByRole('button', { name: 'Start round' }).click();
  await expect.poll(() => page.evaluate(() => window.decodedDuration || 0)).toBeGreaterThan(2);
  expect(await page.evaluate(() => window.audioEvents)).toEqual([]);
  await page.clock.fastForward(30 * 60000);
  await expect.poll(() => page.evaluate(() => window.audioEvents.filter(event => event.type === 'sample').length)).toBe(1);
  const duration = await page.evaluate(() => window.audioEvents.find(event => event.type === 'sample').duration);
  expect(duration).toBeLessThan(2.5);
  await page.clock.fastForward(15 * 60000);
  await expect.poll(() => page.evaluate(() => window.audioEvents.filter(event => event.type === 'generated').map(event => event.frequency))).toEqual([660, 520, 440]);
  await expect(page.getByRole('timer')).toHaveText('00:00');
});

test('enabling sound previews the jingle and muting stops it immediately', async ({ page }) => {
  await page.getByRole('button', { name: 'Mute alerts' }).click();
  await page.getByRole('button', { name: 'Enable alerts' }).click();
  await expect.poll(() => page.evaluate(() => window.audioEvents.filter(event => event.type === 'sample').length)).toBe(1);
  await page.getByRole('button', { name: 'Mute alerts' }).click();
  expect(await page.evaluate(() => window.audioEvents.filter(event => event.type === 'stop-sample').length)).toBe(1);
});

test('muted timers never play either end-of-phase alert', async ({ page }) => {
  await page.getByRole('button', { name: 'Mute alerts' }).click();
  await page.getByRole('button', { name: 'Start round' }).click();
  await page.clock.fastForward(30 * 60000);
  await page.clock.fastForward(15 * 60000);
  await expect(page.getByRole('timer')).toHaveText('00:00');
  expect(await page.evaluate(() => window.audioEvents)).toEqual([]);
});

test('a missing clip falls back to the generated alert without affecting the timer', async ({ page }) => {
  await page.route('**/sounds/pokemon-item-received.mp3', route => route.fulfill({ status: 404, body: 'Not found' }));
  await page.reload();
  await page.getByRole('button', { name: 'Start round' }).click();
  await page.clock.fastForward(30 * 60000);
  await expect.poll(() => page.evaluate(() => window.audioEvents.filter(event => event.type === 'generated').map(event => event.frequency))).toEqual([660, 660, 880]);
  await expect(page.getByRole('timer')).toHaveText('15:00');
});

test('muting cancels a preview still waiting for audio decoding', async ({ page }) => {
  await page.evaluate(() => {
    const original = AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData = function (...args) {
      return new Promise(resolve => {
        window.releaseDecode = async () => resolve(await original.apply(this, args));
      });
    };
  });
  await page.getByRole('button', { name: 'Mute alerts' }).click();
  await page.getByRole('button', { name: 'Enable alerts' }).click();
  await page.getByRole('button', { name: 'Mute alerts' }).click();
  await page.evaluate(() => window.releaseDecode());
  await expect.poll(() => page.evaluate(() => window.decodedDuration || 0)).toBeGreaterThan(2);
  expect(await page.evaluate(() => window.audioEvents)).toEqual([]);
});
