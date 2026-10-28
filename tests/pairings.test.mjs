import test from 'node:test';
import assert from 'node:assert/strict';
import { pairingPage, restorePairings } from '../site/pairings.js';

const savedPairings = () => ({
  data: { name: 'Example weekly', rounds: [
    { key: '0:0', number: 1, division: '2', matches: [{ table: '1', player1: 'Alex Example', player2: 'Sam Example' }] },
    { key: '0:1', number: 2, division: '2', matches: [{ table: '—', player1: 'Alex Example', player2: null }] },
  ], standings: [] },
  selectedKey: '0:0', selectedStandingsKey: null, importedAt: 1793188800000,
});

test('pairings pages wrap both ways without losing tables', () => {
  const matches = Array.from({ length: 15 }, (_, i) => i + 1);
  assert.deepEqual(pairingPage(matches), { index: 0, count: 3, matches: [1, 2, 3, 4, 5, 6] });
  assert.deepEqual(pairingPage(matches, 1).matches, [7, 8, 9, 10, 11, 12]);
  assert.deepEqual(pairingPage(matches, -1).matches, [13, 14, 15]);
  assert.equal(pairingPage(matches, 3).index, 0);
  assert.deepEqual(pairingPage([]), { index: 0, count: 1, matches: [] });
});

test('display snapshots restore selection and strip all non-display fields', () => {
  const expected = savedPairings();
  const saved = savedPairings();
  saved.xml = 'private source';
  saved.data.organizer = 'private organizer';
  saved.data.rounds[0].matches[0].userid = 'private ID';
  saved.data.rounds[0].matches[0].birthdate = 'private date';
  assert.deepEqual(restorePairings(JSON.stringify(saved)), expected);
  saved.selectedKey = 'missing';
  assert.equal(restorePairings(JSON.stringify(saved)).selectedKey, '0:1');
  saved.importedAt = 1e100;
  assert.equal(restorePairings(JSON.stringify(saved)).importedAt, null);
});

test('corrupt pairing snapshots cannot crash the timer or inject invalid rows', () => {
  for (const raw of [null, '', '{}', 'null', '42', '{bad', '[]']) assert.equal(restorePairings(raw), null);
  for (const corrupt of [
    (s) => { s.data.rounds = []; },
    (s) => { s.data.rounds[0].number = 0; },
    (s) => { s.data.rounds[0].matches[0].player1 = ''; },
    (s) => { s.data.rounds[0].matches[0].player2 = {}; },
    (s) => { s.data.rounds[0].matches[0].table = null; },
    (s) => { s.data.rounds[1].key = '0:0'; },
  ]) {
    const saved = savedPairings();
    corrupt(saved);
    assert.equal(restorePairings(JSON.stringify(saved)), null);
  }
});

test('legacy pairing-only snapshots migrate without losing the selected round', () => {
  const legacy = savedPairings();
  delete legacy.data.standings;
  delete legacy.selectedStandingsKey;
  assert.deepEqual(restorePairings(JSON.stringify(legacy)), savedPairings());
});

test('standings snapshots keep TOM ranks, ties and unranked players, but strip private fields', () => {
  const saved = savedPairings();
  saved.data.standings = [
    { key: 'standings:0', division: '2', type: 'finished', entries: [{ place: 1, player: 'Alex Example', stats: null }, { place: 1, player: 'Sam Example', stats: null }] },
    { key: 'standings:1', division: '2', type: 'dnf', entries: [{ place: null, player: 'Other Example', stats: null }] },
  ];
  saved.selectedStandingsKey = 'standings:1';
  const expected = structuredClone(saved);
  saved.data.standings[0].entries[0].id = 'private ID';
  saved.data.standings[0].entries[0].birthdate = 'private date';
  assert.deepEqual(restorePairings(JSON.stringify(saved)), expected);
  saved.selectedStandingsKey = 'missing';
  assert.equal(restorePairings(JSON.stringify(saved)).selectedStandingsKey, 'standings:0');
  saved.data.rounds = [];
  const standingsOnly = restorePairings(JSON.stringify(saved));
  assert.equal(standingsOnly.selectedKey, null);
  assert.equal(standingsOnly.data.standings.length, 2);
});

test('invalid saved standings are rejected without affecting the timer', () => {
  for (const corrupt of [
    (s) => { s.data.standings = 'bad'; },
    (s) => { s.data.standings[0].entries = []; },
    (s) => { s.data.standings[0].entries[0].place = 0; },
    (s) => { s.data.standings[0].entries[0].place = 1.5; },
    (s) => { s.data.standings[0].entries[0].player = ''; },
    (s) => { s.data.standings.push(s.data.standings[0]); },
  ]) {
    const saved = savedPairings();
    saved.data.standings = [{ key: 'standings:0', division: '2', type: 'finished', entries: [{ place: 1, player: 'Alex Example' }] }];
    corrupt(saved);
    assert.equal(restorePairings(JSON.stringify(saved)), null);
  }
});

test('calculated statistics survive restoration without retaining private input fields', () => {
  const saved = savedPairings();
  const stats = { wins: 2, losses: 1, ties: 0, points: 6, byes: 0, pending: 0, opWin: 0.5, opOpWin: 0.625 };
  saved.data.standings = [{ key: 'standings:0', division: '2', type: 'finished', entries: [{ place: 1, player: 'Alex Example', stats: { ...stats, userid: 'private ID', birthdate: 'private date' } }] }];
  const restored = restorePairings(JSON.stringify(saved));
  assert.deepEqual(restored.data.standings[0].entries[0].stats, stats);
  saved.data.standings[0].entries[0].stats.points = 99;
  assert.equal(restorePairings(JSON.stringify(saved)), null);
});
