import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Synthetic players only. Never copy a real tournament into test fixtures.
function sampleTom({ tables = 8, rounds = 3, division = '2' } = {}) {
  const players = Array.from({ length: tables * 2 }, (_, i) => `<player userid="private-id-${i + 1}"><firstname>Player</firstname><lastname>${i + 1}</lastname><birthdate>2000-04-05</birthdate></player>`).join('');
  const matches = Array.from({ length: tables }, (_, i) => `<match outcome="1"><player1 userid="private-id-${i * 2 + 1}"/><player2 userid="private-id-${i * 2 + 2}"/><tablenumber>${tables - i}</tablenumber></match>`).join('');
  const roundXml = Array.from({ length: rounds }, (_, i) => `<round number="${i + 1}" type="2" stage="6"><matches>${matches}</matches></round>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><tournament version="1.86" gametype="TRADING_CARD_GAME"><data><name>Example weekly</name><organizer name="Private organizer"/></data><players>${players}</players><pods><pod category="${division}"><rounds>${roundXml}</rounds></pod></pods></tournament>`;
}

function withStandings(source = sampleTom(), groups = [{ division: '2', type: 'finished', entries: Array.from({ length: 16 }, (_, i) => ({ player: 16 - i, place: i + 1 })) }]) {
  const pods = groups.map((group) => `<pod category="${group.division}" type="${group.type}">${group.entries.map((entry) => `<player id="private-id-${entry.player}"${entry.place === null ? '' : ` place="${entry.place}"`}/>`).join('')}</pod>`).join('');
  return source.replace('</tournament>', `<standings>${pods}</standings></tournament>`);
}

const openSettings = (page) => page.getByRole('button', { name: 'Judge controls', exact: true }).click();
const closeSettings = (page) => page.getByRole('button', { name: 'Close judge controls', exact: true }).click();
const upload = (page, xml = sampleTom()) => page.locator('#tom-file').setInputFiles({ name: 'example.tdf', mimeType: 'application/xml', buffer: Buffer.from(xml) });
const showPairings = (page) => page.locator('#pairings-show').click();

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-28T12:00:00Z') });
  await page.goto('/');
});

test('local import defaults to the last round, orders tables, and never changes the timer', async ({ page }) => {
  await page.getByRole('button', { name: 'Start round' }).click();
  await page.clock.fastForward(60000);
  await openSettings(page);
  const timer = await page.evaluate(() => localStorage.getItem('locals-tcg-timer-v1'));
  const requests = [];
  page.on('request', (request) => requests.push(request));
  await upload(page);
  await expect(page.locator('#pairings-import-status')).toHaveText('Loaded locally: Example weekly');
  await expect(page.locator('#pairings-round')).toHaveValue('0:2');
  expect(await page.locator('#tom-file').inputValue()).toBe('');
  const snapshot = await page.evaluate(() => localStorage.getItem('locals-tcg-pairings-v1'));
  for (const privateText of ['userid', 'private-id', 'birthdate', '2000-04-05', 'Private organizer', 'outcome']) expect(snapshot).not.toContain(privateText);
  expect(requests).toEqual([]);
  await showPairings(page);
  await expect(page.locator('body')).toHaveClass(/tv-mode/);
  await expect(page.locator('#pairings-heading')).toHaveText('Round 3 · Masters');
  await expect(page.locator('#pairings-warning')).toBeVisible();
  await expect(page.locator('#pairings-rows tr')).toHaveCount(6);
  await expect(page.locator('#pairings-rows tr').first().locator('td').first()).toHaveText('1');
  await expect(page.locator('#pairings-page')).toHaveText('Page 1 / 2');
  expect(await page.evaluate(() => localStorage.getItem('locals-tcg-timer-v1'))).toBe(timer);
  await page.locator('#tv-pairings').click();
  await expect(page.getByRole('timer')).toHaveText('29:00');
});

test('pages rotate, pause, and can be navigated with arrows; P returns to the timer', async ({ page }) => {
  await openSettings(page);
  await upload(page);
  await showPairings(page);
  await page.clock.fastForward(12000);
  await expect(page.locator('#pairings-page')).toHaveText('Page 2 / 2');
  await expect(page.locator('#pairings-rows tr')).toHaveCount(2);
  await page.getByRole('button', { name: 'Pause rotation', exact: true }).click();
  await page.clock.fastForward(60000);
  await expect(page.locator('#pairings-page')).toHaveText('Page 2 / 2');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#pairings-page')).toHaveText('Page 1 / 2');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#pairings-page')).toHaveText('Page 2 / 2');
  await page.getByRole('button', { name: 'Resume rotation', exact: true }).click();
  await page.clock.fastForward(12000);
  await expect(page.locator('#pairings-page')).toHaveText('Page 1 / 2');
  await page.keyboard.press('p');
  await expect(page.getByRole('timer')).toBeVisible();
  await page.keyboard.press('p');
  await expect(page.locator('#pairings-stage')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByRole('timer')).toBeVisible();
  await expect(page.locator('#status-label')).toHaveText('ROUND IN PROGRESS');
});

test('selecting a round, re-importing the same filename, refresh and clearing work locally', async ({ page }) => {
  await openSettings(page);
  await upload(page, sampleTom({ tables: 2 }));
  await page.locator('#pairings-round').selectOption('0:0');
  await closeSettings(page);
  await page.reload();
  await openSettings(page);
  await expect(page.locator('#pairings-round')).toHaveValue('0:0');
  await upload(page, sampleTom({ tables: 3, rounds: 4 }));
  await expect(page.locator('#pairings-round')).toHaveValue('0:3');
  await showPairings(page);
  await expect(page.locator('#pairings-heading')).toHaveText('Round 4 · Masters');
  await expect(page.locator('#pairings-rows tr')).toHaveCount(3);
  await page.keyboard.press('f');
  await openSettings(page);
  await page.getByRole('button', { name: 'Clear TOM import' }).click();
  await expect(page.locator('#pairings-options')).not.toBeVisible();
  await closeSettings(page);
  await expect(page.getByRole('timer')).toBeVisible();
  await expect(page.locator('#pairings-rows tr')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('locals-tcg-pairings-v1'))).toBeNull();
  await page.reload();
  await expect(page.locator('#pairings-open')).not.toBeVisible();
});

test('malformed, unpaired, oversized, and unknown-player files keep the previous valid import', async ({ page }) => {
  await openSettings(page);
  await upload(page);
  for (const [xml, message] of [
    ['not XML', 'Invalid TOM file'],
    ['<tournament><data>', 'Invalid TOM file'],
    ['<!DOCTYPE tournament [<!ENTITY secret SYSTEM "file:///etc/passwd">]><tournament/>', 'Invalid TOM file'],
    [sampleTom({ rounds: 0 }), 'No pairings or standings found'],
    [sampleTom().replace('<player1 userid="private-id-1"', '<player1 userid="unknown"'), 'unknown player'],
    ['x'.repeat(5 * 1024 * 1024 + 1), 'too large'],
  ]) {
    await upload(page, xml);
    await expect(page.locator('#pairings-import-status')).toContainText(message);
    await expect(page.locator('#pairings-round')).toHaveValue('0:2');
  }
  await showPairings(page);
  await expect(page.locator('#pairings-heading')).toHaveText('Round 3 · Masters');
});

test('parser supports division pods, byes, and names containing markup as plain text', async ({ page }) => {
  const source = sampleTom({ tables: 1, rounds: 1, division: '0' })
    .replace('<firstname>Player</firstname>', '<firstname>Ľuboš &amp; &lt;img src=x&gt;</firstname>')
    .replace('<player2 userid="private-id-2"/>', '<player2 userid="-1"/>')
    .replace('</pods>', '<pod category="1"><rounds><round number="2"><matches><match><player1 userid="private-id-2"/><tablenumber>2</tablenumber></match></matches></round><round number="3"><matches/></round></rounds></pod></pods>');
  await openSettings(page);
  await upload(page, source);
  await expect(page.locator('#pairings-round option')).toHaveText(['Round 1 · Juniors', 'Round 2 · Seniors']);
  await page.locator('#pairings-round').selectOption('0:0');
  await showPairings(page);
  await expect(page.locator('#pairings-rows')).toContainText('Ľuboš & <img src=x> 1');
  await expect(page.locator('#pairings-rows')).toContainText('BYE · No opponent');
  await expect(page.locator('#pairings-rows img')).toHaveCount(0);
  await expect(page.locator('#pairings-warning')).not.toBeVisible();
});

test('display-only imports and round selection synchronize to a TV tab and clear on new tournament', async ({ page, context }) => {
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 1000));
  const display = await context.newPage();
  await display.goto('/');
  await openSettings(page);
  await upload(page);
  await expect(display.locator('#pairings-open')).toBeVisible();
  await display.keyboard.press('p');
  await expect(display.locator('#pairings-stage')).toBeVisible();
  await expect(display.locator('#pairings-heading')).toHaveText('Round 3 · Masters');
  await page.locator('#pairings-round').selectOption('0:0');
  await expect(display.locator('#pairings-heading')).toHaveText('Round 1 · Masters');
  await upload(page, sampleTom({ rounds: 4 }));
  await expect(display.locator('#pairings-heading')).toHaveText('Round 4 · Masters');
  await page.getByRole('button', { name: 'New tournament', exact: true }).click();
  await page.locator('#confirm-dialog').getByRole('button', { name: 'New tournament', exact: true }).click();
  await expect(display.locator('#pairings-stage')).not.toBeVisible();
  await expect(display.getByRole('timer')).toBeVisible();
  await expect.poll(() => display.evaluate(() => localStorage.getItem('locals-tcg-pairings-v1'))).toBeNull();
});

test('pairings import works with browser storage blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('Blocked'); };
    Storage.prototype.setItem = () => { throw new Error('Blocked'); };
  });
  await page.reload();
  await openSettings(page);
  await upload(page);
  await showPairings(page);
  await expect(page.locator('#pairings-heading')).toHaveText('Round 3 · Masters');
});

test('unknown division codes display as generic labels', async ({ page }) => {
  await openSettings(page);
  await upload(page, sampleTom({ division: 'toString' }));
  await showPairings(page);
  await expect(page.locator('#pairings-heading')).toHaveText('Round 3 · Division toString');
});

test('standings show only TOM ranks, preserving ties and without changing the timer', async ({ page }) => {
  await page.getByRole('button', { name: 'Start round' }).click();
  await openSettings(page);
  const timer = await page.evaluate(() => localStorage.getItem('locals-tcg-timer-v1'));
  const source = withStandings(sampleTom(), [
    { division: '0', type: 'finished', entries: [{ player: 5, place: 1 }] },
    { division: '2', type: 'finished', entries: [{ player: 1, place: 3 }, { player: 2, place: 1 }, { player: 3, place: 1 }, { player: 4, place: 2 }] },
  ]);
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await upload(page, source);
  await expect(page.locator('#standings-group')).toHaveValue('standings:1');
  await page.locator('#pairings-round').selectOption('0:0');
  await page.locator('#standings-show').click();
  await expect(page.locator('#pairings-heading')).toHaveText('Standings · Masters');
  await expect(page.locator('#tom-table th:visible')).toHaveText(['Rank', 'Player', 'W–L–T', 'Points', 'Op Win %', 'Op Op Win %']);
  await expect(page.locator('#pairings-rows td:nth-child(1)')).toHaveText(['1', '1', '2', '3']);
  await expect(page.locator('#pairings-rows td:nth-child(2)')).toHaveText(['Player 2', 'Player 3', 'Player 4', 'Player 1']);
  await expect(page.locator('#pairings-rows tr').first().locator('td')).toHaveText(['1', 'Player 2', '0–3–0', '0', '100.00%', '25.00%']);
  await expect(page.locator('#standings-note')).toContainText('calculated Swiss statistics');
  await expect(page.locator('#pairings-warning')).not.toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('locals-tcg-timer-v1'))).toBe(timer);
  const snapshot = await page.evaluate(() => localStorage.getItem('locals-tcg-pairings-v1'));
  for (const value of ['private-id', 'birthdate', '2000-04-05', 'outcome', 'Private organizer']) expect(snapshot).not.toContain(value);
  expect(requests).toEqual([]);
  await page.keyboard.press('s');
  await expect(page.getByRole('timer')).toBeVisible();
});

test('standings page rotation, direct switching and S shortcut work', async ({ page }) => {
  await openSettings(page);
  await upload(page, withStandings());
  await page.locator('#standings-show').click();
  await expect(page.locator('#pairings-page')).toHaveText('Page 1 / 3');
  await page.clock.fastForward(12000);
  await expect(page.locator('#pairings-page')).toHaveText('Page 2 / 3');
  await page.getByRole('button', { name: 'Pause rotation', exact: true }).click();
  await page.clock.fastForward(60000);
  await expect(page.locator('#pairings-page')).toHaveText('Page 2 / 3');
  await page.getByRole('button', { name: 'Previous standings page' }).click();
  await expect(page.locator('#pairings-page')).toHaveText('Page 1 / 3');
  await page.keyboard.press('p');
  await expect(page.locator('#pairings-heading')).toHaveText('Round 3 · Masters');
  await expect(page.locator('#tom-table th:visible')).toHaveText(['Table', 'Player 1', 'Player 2']);
  await page.keyboard.press('s');
  await expect(page.locator('#pairings-heading')).toHaveText('Standings · Masters');
  await page.locator('#tv-pairings').click();
  await expect(page.locator('#pairings-heading')).toHaveText('Round 3 · Masters');
  await page.locator('#tv-standings').click();
  await expect(page.locator('#pairings-heading')).toHaveText('Standings · Masters');
  await page.locator('#tv-standings').click();
  await expect(page.getByRole('timer')).toBeVisible();
  await page.keyboard.press('s');
  await page.keyboard.press('Space');
  await expect(page.getByRole('timer')).toBeVisible();
  await expect(page.locator('#status-label')).toHaveText('ROUND IN PROGRESS');
});

test('calculated statistics persist, while older rank-only snapshots need re-import', async ({ page }) => {
  await openSettings(page);
  await upload(page, withStandings());
  await closeSettings(page);
  await page.reload();
  await page.keyboard.press('s');
  await expect(page.locator('#pairings-rows tr').first().locator('td:nth-child(3)')).toHaveText('0–3–0');
  await expect(page.locator('#pairings-rows tr').first().locator('td:nth-child(5)')).toHaveText('100.00%');
  await page.evaluate(() => {
    const key = 'locals-tcg-pairings-v1';
    const saved = JSON.parse(localStorage.getItem(key));
    for (const group of saved.data.standings) for (const entry of group.entries) delete entry.stats;
    localStorage.setItem(key, JSON.stringify(saved));
  });
  await page.reload();
  await page.keyboard.press('s');
  await expect(page.locator('#pairings-rows tr').first().locator('td')).toHaveText(['1', 'Player 16', '—', '—', '—', '—']);
});

test('pending counts are visible and unknown outcomes are never fabricated as losses', async ({ page }) => {
  const groups = [{ division: '2', type: 'finished', entries: [{ player: 1, place: 1 }, { player: 2, place: 2 }] }];
  const pending = withStandings(sampleTom({ tables: 1, rounds: 2 }), groups).replace('<match outcome="1">', '<match outcome="0">');
  await openSettings(page);
  await upload(page, pending);
  await page.locator('#standings-show').click();
  await expect(page.locator('#pairings-rows tr').first().locator('td:nth-child(3)')).toHaveText('1–0–0Pending: 1');
  await expect(page.locator('#pairings-rows tr').first().locator('td:nth-child(4)')).toHaveText('3');
  await page.keyboard.press('f');
  await openSettings(page);
  await upload(page, pending.replace('<match outcome="0">', '<match outcome="99">'));
  await page.locator('#standings-show').click();
  await expect(page.locator('#pairings-rows tr').first().locator('td')).toHaveText(['1', 'Player 1', '—', '—', '—', '—']);
});

test('byes are shown in the record but no nonexistent opponent percentages are invented', async ({ page }) => {
  const source = withStandings(sampleTom({ tables: 1, rounds: 1 }), [
    { division: '2', type: 'finished', entries: [{ player: 1, place: 1 }] },
  ]).replace('<player2 userid="private-id-2"/>', '<player2 userid="-1"/>');
  await openSettings(page);
  await upload(page, source);
  await page.locator('#standings-show').click();
  await expect(page.locator('#pairings-rows tr').first().locator('td')).toHaveText(['1', 'Player 1', '1–0–0Byes: 1', '3', '—', '—']);
});

test('files without saved standings show an explicit empty state, never calculated ranks', async ({ page }) => {
  await openSettings(page);
  await upload(page);
  await expect(page.locator('#standings-import-status')).toContainText('No saved rankings');
  await expect(page.locator('#standings-group')).toBeDisabled();
  await showPairings(page);
  await expect(page.locator('#pairings-rows tr')).toHaveCount(6);
  await page.keyboard.press('s');
  await expect(page.locator('#tom-empty')).toContainText('Ranking order is never calculated here');
  await expect(page.locator('#tom-table')).not.toBeVisible();
  await expect(page.locator('#pairings-rows tr')).toHaveCount(0);
  await expect(page.locator('#pairings-navigation')).not.toBeVisible();
});

test('division/group selection, unranked players and standings-only imports survive refresh', async ({ page }) => {
  const source = withStandings(sampleTom({ rounds: 0 }), [
    { division: '2', type: 'finished', entries: [{ player: 2, place: 1 }] },
    { division: '2', type: 'dnf', entries: [{ player: 1, place: null }] },
  ]).replace('<firstname>Player</firstname>', '<firstname>Ľuboš &amp; &lt;img src=x&gt;</firstname>');
  await openSettings(page);
  await upload(page, source);
  await expect(page.locator('#pairings-show')).toBeDisabled();
  await page.locator('#standings-group').selectOption('standings:1');
  await closeSettings(page);
  await page.reload();
  await openSettings(page);
  await expect(page.locator('#standings-group')).toHaveValue('standings:1');
  await page.locator('#standings-show').click();
  await expect(page.locator('#pairings-heading')).toHaveText('Standings · Masters · Dropped / unfinished');
  await expect(page.locator('#pairings-rows')).toContainText('—Ľuboš & <img src=x> 1');
  await expect(page.locator('#pairings-rows img')).toHaveCount(0);
  await page.keyboard.press('f');
  await openSettings(page);
  await page.getByRole('button', { name: 'Clear TOM import' }).click();
  await expect(page.locator('#standings-group option')).toHaveCount(0);
  await expect(page.locator('#pairings-rows tr')).toHaveCount(0);
});

test('invalid standings do not overwrite a valid import', async ({ page }) => {
  await openSettings(page);
  await upload(page, withStandings());
  for (const [source, message] of [
    [withStandings().replace('<player id="private-id-16"', '<player id="missing"'), 'unknown player'],
    [withStandings().replace('place="1"', 'place="-2"'), 'Invalid TOM file'],
    [withStandings().replace('place="1"', 'place="1.5"'), 'Invalid TOM file'],
  ]) {
    await upload(page, source);
    await expect(page.locator('#pairings-import-status')).toContainText(message);
  }
  await page.locator('#standings-show').click();
  await expect(page.locator('#pairings-heading')).toHaveText('Standings · Masters');
  await expect(page.locator('#pairings-rows tr').first().locator('td:nth-child(2)')).toHaveText('Player 16');
});

test('standings sync across windows and a new import without ranks removes stale standings', async ({ page, context }) => {
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 1000));
  const display = await context.newPage();
  await display.goto('/');
  await openSettings(page);
  const groups = [
    { division: '0', type: 'finished', entries: [{ player: 1, place: 1 }] },
    { division: '2', type: 'finished', entries: [{ player: 2, place: 1 }] },
  ];
  await upload(page, withStandings(sampleTom(), groups));
  await expect(display.locator('#standings-open')).toBeVisible();
  await display.keyboard.press('s');
  await expect(display.locator('#pairings-stage')).toBeVisible();
  await expect(display.locator('#pairings-heading')).toHaveText('Standings · Masters');
  await page.locator('#standings-group').selectOption('standings:0');
  await expect(display.locator('#pairings-heading')).toHaveText('Standings · Juniors');
  await upload(page);
  await expect(display.locator('#tom-empty')).toBeVisible();
  await expect(display.locator('#pairings-rows tr')).toHaveCount(0);
  await page.getByRole('button', { name: 'New tournament', exact: true }).click();
  await page.locator('#confirm-dialog').getByRole('button', { name: 'New tournament', exact: true }).click();
  await expect(display.locator('#pairings-stage')).not.toBeVisible();
  await expect(display.locator('#standings-open')).not.toBeVisible();
});

for (const [width, height, language] of [[1366, 768, 'en'], [1920, 1080, 'sk'], [320, 740, 'sk']]) {
  test(`standings fit ${width} × ${height} and pass accessibility (${language})`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openSettings(page);
    await upload(page, withStandings());
    await page.getByLabel('Language', { exact: true }).selectOption(language);
    await page.locator('#standings-show').click();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width >= 800) expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    if (language === 'sk') {
      await expect(page.locator('#pairings-heading')).toHaveText('Poradie · Masters');
      await expect(page.locator('#tom-table th:visible')).toHaveText(['Miesto', 'Hráč', 'V–P–R', 'Body', 'Výhry súperov %', 'Výhry súperov súperov %']);
    }
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations).toEqual([]);
    await page.screenshot({ path: `/tmp/opencode/kraken-standings-${width}.png` });
  });
}

for (const [width, height] of [[1366, 768], [1920, 1080], [320, 740]]) {
  test(`pairings fit ${width} × ${height} and pass accessibility in English and Slovak`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openSettings(page);
    await upload(page);
    if (width === 320) await page.getByLabel('Language', { exact: true }).selectOption('sk');
    await showPairings(page);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width >= 800) expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations).toEqual([]);
    await page.screenshot({ path: `/tmp/opencode/kraken-pairings-${width}.png` });
  });
}
