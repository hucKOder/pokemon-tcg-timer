import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { SIMULATION_STEPS, SIMULATION_STEP_MS } from '../../site/learn-simulation.js';

const LAST_BATTLE_STEP = SIMULATION_STEPS.length - 1;

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-04T12:00:00Z') });
  await page.goto('/');
});

const openGuide = (page) => page.locator('#learn-open').click();
const slide = (page) => page.locator('.learn-slide');
const settleSlide = (page) => slide(page).evaluate((element) => {
  for (const animation of element.getAnimations({ subtree: true })) animation.finish();
});

test('guide explores the board and slides while a running timer keeps its deadline', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'Start round' }).click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('locals-tcg-timer-v1')));
  await openGuide(page);
  await expect(page.getByRole('dialog')).toHaveAttribute('id', 'learn-dialog');
  await expect(page.getByRole('button', { name: 'Previous slide', exact: true })).toBeDisabled();
  await page.locator('button[data-zone="bench"]').click();
  await expect(page.locator('.learn-board-caption')).toContainText('Room for up to 5 Pokémon');
  await page.screenshot({ path: testInfo.outputPath('board-desktop.png') });
  await page.keyboard.press('r');
  await page.keyboard.press('Space');
  await page.clock.fastForward(60000);
  const current = await page.evaluate(() => JSON.parse(localStorage.getItem('locals-tcg-timer-v1')));
  expect(current.deadline).toBe(stored.deadline);
  expect(current.running).toBe(true);
  await page.keyboard.press('ArrowRight');
  await expect(slide(page)).toHaveAttribute('data-slide', '1');
  await page.keyboard.press('End');
  await expect(slide(page)).toHaveAttribute('data-slide', '7');
  await page.getByRole('button', { name: 'Start again' }).click();
  await expect(slide(page)).toHaveAttribute('data-slide', '0');
  await page.getByRole('button', { name: 'Back to timer', exact: true }).click();
  await expect(page.getByRole('timer')).toHaveText('29:00');
  await expect(page.locator('#learn-open')).toBeFocused();
});

test('card annotations, card types and Energy attachment explain the selected example', async ({ page }, testInfo) => {
  await openGuide(page);
  await page.keyboard.press('ArrowRight');
  await page.locator('.learn-hotspot[data-part="1"]').click();
  await expect(page.locator('.learn-part-detail')).toContainText('70 HP');
  await page.locator('.learn-hotspot[data-part="3"]').click();
  await expect(page.locator('.learn-part-detail')).toContainText('Thunder Shock does 20 damage');
  await expect(page.locator('.learn-part-detail')).toContainText('Paralyzes');
  await page.locator('.learn-hotspot[data-part="2"]').click();
  await expect(page.locator('.learn-part-detail')).toContainText('1 Lightning Energy and 1 Energy of any type');
  await expect(page.locator('.learn-card-edition')).toHaveText('Pikachu · 30th Celebration · 2026');
  await expect(page.locator('.learn-hotspot[data-part="2"]')).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('card-desktop.png') });
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: '02 Basic Energy', exact: true }).click();
  await expect(page.locator('.learn-type-detail')).toContainText('attach just 1 Energy');
  await page.locator('[data-slide-to="5"]').click();
  await page.locator('[data-turn="1"]').click();
  await page.getByRole('button', { name: '+ Try attaching an Energy', exact: true }).click();
  await expect(page.locator('.is-you .learn-attached-energy')).toBeVisible();
  await expect(page.locator('[data-attach]')).toBeDisabled();
  await expect(page.locator('[data-attach]')).toContainText('once this turn');
  await page.keyboard.press('Escape');
  await expect(page.locator('#learn-dialog')).not.toBeVisible();
  await expect(page.getByRole('timer')).toHaveText('30:00');
  await expect(page.getByRole('button', { name: 'Start round' })).toBeVisible();
});

test('six card examples explain Energy and Trainer subtypes in both languages', async ({ page }) => {
  await openGuide(page);
  await page.locator('[data-slide-to="2"]').click();
  await settleSlide(page);
  const examples = [
    ['en', ['Pokémon', 'Basic Energy', 'Special Energy', 'Item', 'Supporter', 'Stadium'], ['Basic Pokémon', 'Basic or Special', 'Voltaic Lightning Energy', 'Switch swaps', 'Boss’s Orders brings', 'Prism Tower']],
    ['sk', ['Pokémon', 'Základná Energia', 'Špeciálna Energia', 'Predmet', 'Podporovateľ', 'Štadión'], ['základných Pokémonov', 'základnú alebo špeciálnu', 'Voltaic Lightning Energy', 'Switch vymení', 'Boss’s Orders presunie', 'Prism Tower']],
  ];
  for (const [language, names, descriptions] of examples) {
    if (language === 'sk') await page.locator('[data-language]').click();
    await expect(page.locator('.learn-type-card')).toHaveCount(6);
    const basic = await page.getByRole('button', { name: `02 ${names[1]}`, exact: true }).boundingBox();
    const special = await page.getByRole('button', { name: `03 ${names[2]}`, exact: true }).boundingBox();
    expect(Math.abs(basic.y - special.y)).toBeLessThan(1);
    expect(Math.abs(basic.width - special.width)).toBeLessThan(1);
    for (const [index, name] of names.entries()) {
      const card = page.getByRole('button', { name: `0${index + 1} ${name}`, exact: true });
      await card.click();
      await expect(card).toHaveAttribute('aria-pressed', 'true');
      await expect(card).toBeFocused();
      await expect(page.locator('.learn-type-card[aria-pressed="true"]')).toHaveCount(1);
      await expect(page.locator('.learn-type-detail')).toContainText(descriptions[index]);
    }
  }
});

test('middle slide animates a matching evolution stack while keeping Energy, damage and the timer', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'Start round' }).click();
  const deadline = await page.evaluate(() => JSON.parse(localStorage.getItem('locals-tcg-timer-v1')).deadline);
  await openGuide(page);
  await expect(page.locator('[data-slide-to]')).toHaveCount(8);
  await page.getByRole('button', { name: '4. Evolution', exact: true }).click();
  await settleSlide(page);
  await expect(page.locator('.learn-progress-copy strong')).toHaveText('04 / 08');
  await expect(page.locator('.learn-evolution-scene')).toHaveAttribute('data-evolution-step', '0');
  await expect(page.locator('.learn-evolution-stats')).toContainText('80 HP');
  const attachedEnergy = await page.locator('.learn-evolution-energy img').getAttribute('src');
  await page.getByRole('button', { name: 'Evolve into Dartrix', exact: true }).click();
  await expect(page.locator('.learn-evolution-scene')).toHaveAttribute('data-evolution-step', '1');
  expect(await page.locator('[data-evolution-card="1"]').evaluate(element => element.getAnimations().length)).toBeGreaterThan(0);
  await settleSlide(page);
  await expect(page.locator('.learn-evolution-card')).toHaveCount(2);
  await expect(page.locator('.learn-evolution-stats')).toContainText('100 HP');
  await expect(page.locator('.learn-evolution-stats')).toContainText('80 HP left');
  await expect(page.getByRole('button', { name: 'Next turn: Decidueye ex', exact: true })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('evolution-stage-1-desktop.png') });
  await page.getByRole('button', { name: 'Next turn: Decidueye ex', exact: true }).click();
  await settleSlide(page);
  await expect(page.locator('.learn-evolution-card')).toHaveCount(3);
  await expect(page.locator('.learn-evolution-stats')).toContainText('320 HP');
  await expect(page.locator('.learn-evolution-stats')).toContainText('300 HP left');
  await expect(page.locator('.learn-evolution-copy')).toContainText('2 Prizes');
  await expect(page.locator('.learn-evolution-energy img')).toHaveAttribute('src', attachedEnergy);
  await expect(page.locator('.learn-evolution-damage b')).toHaveText('20');
  const results = await new AxeBuilder({ page }).include('#learn-dialog').analyze();
  expect(results.violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('evolution-stage-2-desktop.png') });
  await page.getByRole('button', { name: 'Replay evolution', exact: true }).click();
  await expect(page.locator('.learn-evolution-scene')).toHaveAttribute('data-evolution-step', '0');
  await expect(page.locator('.learn-evolution-card')).toHaveCount(1);
  await page.clock.fastForward(60000);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('locals-tcg-timer-v1')).deadline)).toBe(deadline);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#learn-title')).toHaveText('Before you start');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.learn-evolution-scene')).toHaveAttribute('data-evolution-step', '0');
});

test('evolution works in Slovak on mobile with reduced motion', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await openGuide(page);
  await page.locator('[data-slide-to="3"]').click();
  await page.locator('[data-language]').click();
  await expect(page.locator('#learn-title')).toHaveText('Ako funguje vývoj');
  await page.getByRole('button', { name: 'Vyvinúť na Dartrixa', exact: true }).click();
  expect(await slide(page).evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
  await expect(page.locator('.learn-evolution-copy')).toContainText('20 poškodenia');
  await page.getByRole('button', { name: 'Ďalší ťah: Decidueye ex', exact: true }).click();
  await expect(page.locator('.learn-evolution-scene')).toHaveAttribute('data-evolution-step', '2');
  await expect(page.locator('.learn-evolution-copy')).toContainText('2 odmeny');
  expect(await slide(page).evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(page.locator('.learn-navigation')).toBeInViewport();
  await page.locator('.learn-evolution-scene').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('evolution-mobile-slovak.png') });
});

test('practice battle animates visible hands, Items, a Supporter, Energy and seven turns', async ({ page }, testInfo) => {
  await page.clock.pauseAt(new Date('2026-11-04T12:01:00Z'));
  await page.getByRole('button', { name: 'Start round' }).click();
  const stored = await page.evaluate(() => localStorage.getItem('locals-tcg-timer-v1'));
  await openGuide(page);
  await page.keyboard.press('End');
  const simulation = page.locator('.learn-simulation');
  const you = page.locator('[data-sim-player="you"]');
  const opponent = page.locator('[data-sim-player="opponent"]');
  const yourHand = page.locator('[data-hand-player="you"]');
  const opposingHand = page.locator('[data-hand-player="opponent"]');
  const active = (player) => player.locator('[data-sim-zone="active"]');
  let itemId;
  let supporterId;
  await expect(simulation.locator('.learn-board')).toBeVisible();
  await expect(simulation.locator('.learn-zone')).toHaveCount(10);
  await expect(page.getByRole('button', { name: 'Pause animation', exact: true })).toBeVisible();
  await expect(simulation.locator('.learn-sim-pokemon-info, .learn-sim-hp')).toHaveCount(0);
  for (let step = 1; step <= LAST_BATTLE_STEP; step++) {
    const event = SIMULATION_STEPS[step].id;
    await page.clock.runFor(SIMULATION_STEP_MS);
    await expect(simulation).toHaveAttribute('data-simulation-event', event);
    if (event === 'opening') {
      await expect(yourHand.locator('img')).toHaveCount(7);
      await expect(opposingHand.locator('img')).toHaveCount(7);
      await expect(page.locator('.learn-sim-hands .learn-card-back')).toHaveCount(0);
      await expect(yourHand.getByRole('img', { name: 'Dartrix', exact: true })).toBeVisible();
      itemId = await yourHand.locator('.learn-sim-hand-card').filter({ has: page.getByRole('img', { name: 'Switch', exact: true }) }).getAttribute('data-motion-key');
    }
    if (event === 'basics') await expect(active(you).getByRole('img')).toHaveAttribute('aria-label', 'Face-down Pokémon');
    if (event === 'prizes') {
      await expect(you.locator('[data-sim-zone="prizes"] .learn-card-back')).toHaveCount(6);
      await expect(active(you).locator('[data-pokemon]')).toHaveAttribute('data-pokemon', 'pikachu');
    }
    if (event === 'you-draw-1') supporterId = await yourHand.locator('.learn-sim-hand-card').filter({ has: page.getByRole('img', { name: 'Boss’s Orders', exact: true }) }).getAttribute('data-motion-key');
    if (event === 'you-item') {
      await expect(page.locator('.learn-sim-trainer')).toHaveAttribute('data-trainer', 'switch');
      await expect(page.locator('.learn-sim-played-card')).toHaveAttribute('data-motion-key', itemId);
      await expect(yourHand.getByRole('img', { name: 'Switch', exact: true })).toHaveCount(0);
      expect(await page.locator('.learn-sim-played-card').evaluate(element => element.getAnimations().length)).toBeGreaterThan(0);
      await expect(page.locator('.learn-sim-copy')).toContainText('more than one Item');
    }
    if (event === 'you-item-effect') {
      await expect(active(you).locator('[data-pokemon]')).toHaveAttribute('data-pokemon', 'rowlet');
      await expect(you.locator('[data-sim-zone="bench"] [data-pokemon]')).toHaveAttribute('data-pokemon', 'pikachu');
      await expect(you.locator('[data-sim-zone="discard"] [data-motion-key]')).toHaveAttribute('data-motion-key', itemId);
    }
    if (event === 'you-energy-1') {
      await expect(active(you).locator('.learn-sim-energy-card img')).toHaveAttribute('src', /evolution-energy\.png/);
      expect(await active(you).locator('.learn-sim-energy-card').evaluate(element => element.getAnimations().length)).toBeGreaterThan(0);
    }
    if (event === 'opponent-energy-1') await expect(active(opponent).locator('.learn-sim-energy-card img')).toHaveAttribute('src', /water-energy\.png/);
    if (event === 'opponent-attack-1') await expect(active(you).locator('.learn-sim-damage')).toHaveText('20');
    if (event === 'you-supporter') {
      await expect(page.locator('.learn-sim-trainer')).toHaveAttribute('data-trainer', 'boss');
      await expect(page.locator('.learn-sim-played-card')).toHaveAttribute('data-motion-key', supporterId);
      await expect(yourHand.getByRole('img', { name: 'Boss’s Orders', exact: true })).toHaveCount(0);
      await expect(page.locator('.learn-sim-copy')).toContainText('One Supporter per turn');
      await settleSlide(page);
      await page.screenshot({ path: testInfo.outputPath('animated-battle-supporter.png') });
    }
    if (event === 'you-supporter-effect') {
      await expect(active(opponent).locator('[data-pokemon]')).toHaveAttribute('data-pokemon', 'rowlet');
      await expect(opponent.locator('[data-sim-zone="bench"] [data-pokemon]')).toHaveAttribute('data-pokemon', 'staryu');
      await expect(opponent.locator('[data-sim-zone="bench"] .learn-sim-energy-card')).toHaveCount(1);
      await expect(you.locator('[data-sim-zone="discard"] img')).toHaveCount(2);
    }
    if (event === 'dartrix') {
      await expect(active(you).locator('.learn-sim-card')).toHaveCount(2);
      await expect(active(you).locator('.learn-sim-damage')).toHaveText('20');
    }
    if (event === 'you-attack-2') await expect(active(opponent).locator('.learn-sim-damage')).toHaveText('20');
    if (event === 'opponent-item-effect') {
      await expect(active(opponent).locator('[data-pokemon]')).toHaveAttribute('data-pokemon', 'staryu');
      await expect(active(opponent).locator('.learn-sim-energy-card')).toHaveCount(1);
      await expect(opponent.locator('[data-sim-zone="bench"] .learn-sim-damage')).toHaveText('20');
      await expect(opponent.locator('[data-sim-zone="discard"] img')).toHaveCount(1);
    }
    if (event === 'decidueye') {
      await expect(active(you).locator('.learn-sim-card')).toHaveCount(3);
      await expect(active(you).locator('[data-pokemon]')).toHaveAttribute('data-pokemon', 'decidueye');
      await expect(active(you).locator('.learn-sim-energy-card')).toHaveCount(2);
      await expect(active(you).locator('.learn-sim-damage')).toHaveText('40');
    }
    if (event === 'wait-for-energy') {
      await expect(page.locator('.learn-sim-copy')).toContainText('one more Energy');
      await expect(opposingHand.locator('img')).toHaveCount(5);
      await expect(active(you).locator('.learn-sim-energy-card')).toHaveCount(3);
    }
    if (event === 'crushing-arrow') {
      await expect(opponent.locator('[data-sim-zone="discard"] img')).toHaveCount(2);
      await expect(active(opponent).locator('.learn-sim-damage')).toHaveText('240');
      await expect(active(opponent).locator('.learn-sim-energy-card')).toHaveCount(0);
    }
    await settleSlide(page);
    expect(await slide(page).evaluate(element => element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth), `Desktop fit at ${event}`).toBe(true);
  }
  await expect(active(you).locator('.learn-sim-damage')).toHaveText('60');
  await expect(active(you).locator('.learn-sim-energy-card')).toHaveCount(4);
  await expect(you.locator('[data-sim-zone="prizes"] .learn-card-back')).toHaveCount(5);
  await expect(opponent.locator('[data-sim-zone="discard"] img')).toHaveCount(3);
  await expect(active(opponent).locator('[data-pokemon]')).toHaveAttribute('data-pokemon', 'rowlet');
  await expect(active(opponent).locator('.learn-sim-energy-card')).toHaveCount(1);
  await expect(active(opponent).locator('.learn-sim-damage')).toHaveText('20');
  await expect(opponent.locator('[data-sim-zone="bench"] .learn-sim-pokemon')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Replay battle', exact: true })).toBeVisible();
  await expect(page.locator('#learn-title')).toBeFocused();
  await page.clock.resume();
  expect((await new AxeBuilder({ page }).include('#learn-dialog').analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('animated-battle-prize.png') });
  await page.clock.runFor(15000);
  await expect(simulation).toHaveAttribute('data-simulation-step', String(LAST_BATTLE_STEP));
  expect(await page.evaluate(() => localStorage.getItem('locals-tcg-timer-v1'))).toBe(stored);
});

test('animation pauses, resumes, restarts and stops advancing away from the battle', async ({ page }) => {
  await page.clock.pauseAt(new Date('2026-11-04T12:01:00Z'));
  await openGuide(page);
  await page.keyboard.press('End');
  const simulation = page.locator('.learn-simulation');
  await page.clock.runFor(1250);
  await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
  await page.clock.runFor(30000);
  await expect(simulation).toHaveAttribute('data-simulation-step', '0');
  await page.getByRole('button', { name: 'Play animation', exact: true }).click();
  await page.clock.runFor(3749);
  await expect(simulation).toHaveAttribute('data-simulation-step', '0');
  await page.clock.runFor(1);
  await expect(simulation).toHaveAttribute('data-simulation-step', '1');
  await expect(page.getByRole('button', { name: 'Pause animation', exact: true })).toBeFocused();
  await page.clock.runFor(30000);
  await expect(simulation).toHaveAttribute('data-simulation-step', '7');
  await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
  expect(await page.locator('.learn-sim-energy-card').evaluate(element => element.getAnimations().every(animation => animation.playState === 'paused'))).toBe(true);
  await page.locator('[data-language]').click();
  await expect(page.getByRole('button', { name: 'Prehrať animáciu', exact: true })).toBeVisible();
  await page.clock.runFor(15000);
  await expect(simulation).toHaveAttribute('data-simulation-step', '7');
  await page.locator('[data-language]').click();
  await page.getByRole('button', { name: 'Play animation', exact: true }).click();
  await page.clock.runFor(1000);
  await page.keyboard.press('ArrowLeft');
  await page.clock.runFor(30000);
  await page.keyboard.press('End');
  await expect(simulation).toHaveAttribute('data-simulation-step', '7');
  await page.clock.runFor(4000);
  await expect(simulation).toHaveAttribute('data-simulation-step', '8');
  await page.getByRole('button', { name: 'Back to timer', exact: true }).click();
  await page.clock.runFor(30000);
  await openGuide(page);
  await expect(simulation).toHaveAttribute('data-simulation-step', '8');
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(simulation).toHaveAttribute('data-simulation-step', '0');
  await expect(page.getByRole('button', { name: 'Pause animation', exact: true })).toBeVisible();
  await page.clock.runFor(5000);
  await expect(simulation).toHaveAttribute('data-simulation-step', '1');
});

test('battle autoplays in Slovak on mobile with reduced motion and on-card damage', async ({ page }, testInfo) => {
  await page.clock.pauseAt(new Date('2026-11-04T12:01:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await openGuide(page);
  await page.keyboard.press('End');
  await page.locator('[data-language]').click();
  for (let step = 1; step <= LAST_BATTLE_STEP; step++) {
    await page.clock.runFor(5000);
    await expect(page.locator('.learn-simulation')).toHaveAttribute('data-simulation-step', String(step));
    expect(await slide(page).evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
    expect(await slide(page).evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(page.locator('.learn-navigation')).toBeInViewport();
    await expect(page.locator('.learn-sim-controls')).toBeInViewport();
    if (SIMULATION_STEPS[step].id === 'decidueye') await expect(page.locator('.learn-sim-copy')).toContainText('Pripojené Energie aj poškodenie zostávajú');
  }
  await expect(page.locator('.learn-sim-copy')).toContainText('Hra pokračuje');
  await expect(page.getByRole('button', { name: 'Zopakovať súboj', exact: true })).toBeVisible();
  await page.clock.resume();
  expect((await new AxeBuilder({ page }).include('#learn-dialog').analyze()).violations).toEqual([]);
  await page.locator('.learn-simulation').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('animated-battle-mobile-slovak.png') });
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await slide(page).evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(page.locator('.learn-navigation')).toBeInViewport();
  await page.getByRole('button', { name: 'Zopakovať súboj', exact: true }).click();
  await expect(page.locator('.learn-simulation')).toHaveAttribute('data-simulation-step', '0');
});

test('guide follows and saves the English / Slovak preference', async ({ page }) => {
  await openGuide(page);
  await page.getByRole('button', { name: 'EN / SK: Switch to Slovak', exact: true }).click();
  await expect(page.locator('#learn-dialog')).toHaveAttribute('lang', 'sk');
  await expect(page.locator('#learn-title')).toHaveText('Spoznaj hernú plochu');
  await expect(page.getByRole('button', { name: 'SK / EN: Prepnúť na angličtinu' })).toBeFocused();
  for (let i = 0; i < 8; i++) {
    await page.locator(`[data-slide-to="${i}"]`).click();
    await settleSlide(page);
    await expect(slide(page)).toHaveAttribute('data-slide', String(i));
    await expect(page.locator('#learn-title')).not.toBeEmpty();
  }
  await page.getByRole('button', { name: 'Späť na časomieru' }).click();
  await expect(page.getByRole('button', { name: 'Spustiť kolo' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Ako hrať', exact: true }).click();
  await expect(page.locator('#learn-dialog')).toHaveAttribute('lang', 'sk');
});

test('all guide slides pass accessibility checks and keep local images available', async ({ page }) => {
  const remoteRequests = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:4173')) remoteRequests.push(request.url());
  });
  await openGuide(page);
  for (let i = 0; i < 8; i++) {
    await page.locator(`[data-slide-to="${i}"]`).click();
    await settleSlide(page);
    const images = page.locator('#learn-dialog img');
    for (const image of await images.all()) {
      await expect(image).toHaveJSProperty('complete', true);
      expect(await image.evaluate((element) => element.naturalWidth)).toBeGreaterThan(0);
    }
    const results = await new AxeBuilder({ page }).include('#learn-dialog').analyze();
    expect(results.violations, JSON.stringify(results.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) })))).toEqual([]);
  }
  expect(remoteRequests).toEqual([]);
});

test('mobile slides fit the viewport, allow scrolling and swipe without losing navigation', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openGuide(page);
  await page.screenshot({ path: testInfo.outputPath('board-mobile.png') });
  for (let i = 0; i < 8; i++) {
    await page.locator(`[data-slide-to="${i}"]`).click();
    await settleSlide(page);
    expect(await page.locator('#learn-dialog').evaluate((element) => element.scrollWidth <= element.clientWidth), `Dialog overflow on slide ${i}`).toBe(true);
    expect(await slide(page).evaluate((element) => element.scrollWidth <= element.clientWidth), `Content overflow on slide ${i}`).toBe(true);
    await expect(page.locator('.learn-navigation')).toBeInViewport();
  }
  await page.keyboard.press('Home');
  await slide(page).dispatchEvent('touchstart', { touches: [{ identifier: 1, clientX: 310, clientY: 210 }] });
  await slide(page).dispatchEvent('touchend', { changedTouches: [{ identifier: 1, clientX: 110, clientY: 215 }] });
  await expect(slide(page)).toHaveAttribute('data-slide', '1');
  await settleSlide(page);
  await page.screenshot({ path: testInfo.outputPath('card-mobile.png') });
  const results = await new AxeBuilder({ page }).include('#learn-dialog').analyze();
  expect(results.violations).toEqual([]);
});

test('TV guide keeps focus and every slide fits a 1366 × 768 display in both languages', async ({ page }, testInfo) => {
  await page.clock.pauseAt(new Date('2026-11-04T12:01:00Z'));
  await page.setViewportSize({ width: 1366, height: 768 });
  await openGuide(page);
  await page.keyboard.press('End');
  await settleSlide(page);
  const normalBoard = await page.locator('.learn-sim-board').boundingBox();
  await page.getByRole('button', { name: 'Back to timer', exact: true }).click();
  await page.getByRole('button', { name: 'TV mode', exact: true }).click();
  await page.locator('#tv-learn').click();
  await expect(page.locator('body')).toHaveClass(/tv-mode/);
  for (const language of ['en', 'sk']) {
    if (language === 'sk') await page.locator('[data-language]').click();
    for (let i = 0; i < 8; i++) {
      await page.locator(`[data-slide-to="${i}"]`).click();
      await settleSlide(page);
      const dimensions = await slide(page).evaluate((element) => ({
        width: element.clientWidth, contentWidth: element.scrollWidth,
        height: element.clientHeight, contentHeight: element.scrollHeight,
      }));
      expect(dimensions.contentWidth, `${language} slide ${i}: horizontal fit`).toBeLessThanOrEqual(dimensions.width);
      expect(dimensions.contentHeight, `${language} slide ${i}: vertical fit`).toBeLessThanOrEqual(dimensions.height + 1);
      const visual = await page.locator('.learn-visual').boundingBox();
      const copy = await page.locator('.learn-narrative').boundingBox();
      expect(copy.x, `${language} slide ${i}: lesson text is on the right`).toBeGreaterThanOrEqual(visual.x + visual.width);
      await expect(page.locator('.learn-navigation')).toBeInViewport();
      if (i === 7) {
        const tvBoard = await page.locator('.learn-sim-board').boundingBox();
        expect(tvBoard.width).toBeGreaterThan(normalBoard.width * 1.1);
        expect(tvBoard.height).toBeGreaterThan(normalBoard.height);
        for (let step = 1; step <= LAST_BATTLE_STEP; step++) {
          await page.clock.runFor(5000);
          await settleSlide(page);
          const fits = await slide(page).evaluate(element => element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth);
          expect(fits, `${language} simulation action ${step}: TV fit`).toBe(true);
          if (language === 'en' && SIMULATION_STEPS[step].id === 'you-supporter') {
            await expect(page.locator('[data-hand-player="you"]')).toBeInViewport({ ratio: 1 });
            await expect(page.locator('[data-hand-player="opponent"]')).toBeInViewport({ ratio: 1 });
            await page.screenshot({ path: testInfo.outputPath('battle-supporter-tv.png') });
          }
        }
        await page.locator('[data-sim-replay]').click();
      }
    }
  }
  await page.screenshot({ path: testInfo.outputPath('guide-tv-slovak.png') });
  await page.keyboard.press('f');
  await expect(page.locator('body')).not.toHaveClass(/tv-mode/);
  await expect(page.locator('#learn-title')).toBeFocused();
  await page.getByRole('button', { name: 'Späť na časomieru' }).click();
  await expect(page.getByRole('timer')).toHaveText('30:00');
});

test('fullscreen Full HD gives the board most of the screen while both hands stay visible', async ({ page }, testInfo) => {
  await page.clock.pauseAt(new Date('2026-11-04T12:01:00Z'));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByRole('button', { name: 'TV mode', exact: true }).click();
  await page.locator('#tv-learn').click();
  await page.keyboard.press('End');
  await page.clock.runFor(SIMULATION_STEPS.findIndex(step => step.id === 'you-supporter') * SIMULATION_STEP_MS);
  await settleSlide(page);
  const board = await page.locator('.learn-sim-board').boundingBox();
  expect(board.width).toBeGreaterThan(1200);
  expect(board.height).toBeGreaterThan(750);
  await expect(page.locator('.learn-sim-trainer')).toHaveAttribute('data-trainer', 'boss');
  for (const player of ['you', 'opponent']) await expect(page.locator(`[data-hand-player="${player}"]`)).toBeInViewport({ ratio: 1 });
  expect((await page.locator('[data-hand-player="you"] .learn-sim-hand-card').first().boundingBox()).height).toBeGreaterThan(100);
  expect(await slide(page).evaluate(element => element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('battle-fullscreen-1920.png') });
});
