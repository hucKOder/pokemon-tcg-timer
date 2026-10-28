import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSwissStats, restoreSwissStats } from '../site/standings.js';

const round = (...matches) => ({ type: '2', matches: matches.map(([first, second, outcome]) => ({ first, second, outcome })) });
const pod = (...rounds) => ({ rounds });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test('Swiss points and both resistance levels use full precision and the 25% floor', () => {
  // Synthetic six-player event; expected fractions calculated independently.
  const stats = calculateSwissStats([pod(
    round(['D', 'F', '1'], ['A', 'B', '2'], ['E', 'C', '2']),
    round(['D', 'C', '1'], ['B', 'E', '2'], ['A', 'F', '2']),
    round(['D', 'B', '1'], ['C', 'F', '2'], ['E', 'A', '1']),
  )]);
  const { opWin, opOpWin, ...record } = stats.get('D');
  assert.deepEqual(record, { wins: 3, losses: 0, ties: 0, points: 9, byes: 0, pending: 0 });
  near(opWin, 4 / 9);
  near(opOpWin, 70 / 108);
  assert.equal(stats.get('A').points, 0);
  assert.equal(stats.get('F').points, 6);
  near(stats.get('A').opWin, 5 / 9);
  near(stats.get('A').opOpWin, 53 / 108);
  near(stats.get('B').opWin, 23 / 36);
  near(stats.get('C').opWin, 7 / 9);
  near(stats.get('E').opOpWin, 71 / 108);
});

test('a tie is half a resistance win but one match point; a double loss is not a tie', () => {
  const stats = calculateSwissStats([pod(round(['A', 'B', '3'], ['C', 'D', '10']))]);
  assert.deepEqual(stats.get('A'), { wins: 0, losses: 0, ties: 1, points: 1, byes: 0, pending: 0, opWin: 0.5, opOpWin: 0.5 });
  assert.deepEqual(stats.get('C'), { wins: 0, losses: 1, ties: 0, points: 0, byes: 0, pending: 0, opWin: 0.25, opOpWin: 0.25 });
});

test('random byes grant points, but contribute neither opponents nor resistance wins/rounds', () => {
  const stats = calculateSwissStats([pod(
    round(['A', null, '1'], ['B', 'C', '1']),
    round(['A', 'B', '1'], [null, 'C', '2']),
  )]);
  assert.equal(stats.get('A').wins, 2);
  assert.equal(stats.get('A').byes, 1);
  assert.equal(stats.get('A').points, 6);
  assert.equal(stats.get('A').opWin, 0.5);
  assert.equal(stats.get('B').opWin, 0.625);
  assert.equal(stats.get('A').opOpWin, 0.625);
  const byeOnly = calculateSwissStats([pod(round(['A', null, '1']))]).get('A');
  assert.equal(byeOnly.points, 3);
  assert.equal(byeOnly.opWin, null);
  assert.equal(byeOnly.opOpWin, null);
});

test('drops use played rounds and a 75% cap, rather than guessing a dropped player completed the event', () => {
  const pods = [pod(round(['A', 'B', '1']), round(['B', 'C', '1']))];
  const dropped = calculateSwissStats(pods, new Set(['A']));
  assert.equal(dropped.get('B').opWin, 0.5);
  const finished = calculateSwissStats(pods);
  assert.equal(finished.get('B').opWin, 0.375);
});

test('pending matches never become losses, wins or ties and do not lower a partial-snapshot win rate', () => {
  const stats = calculateSwissStats([pod(
    round(['A', 'B', '1'], ['C', 'D', '2']),
    round(['A', 'C', '0'], ['B', 'D', '1']),
  )]);
  assert.equal(stats.get('A').pending, 1);
  assert.equal(stats.get('A').wins, 1);
  assert.equal(stats.get('A').losses, 0);
  assert.equal(stats.get('A').points, 3);
  assert.equal(stats.get('B').opWin, 0.75);
  const pendingOnly = calculateSwissStats([pod(round(['A', 'B', '0']))]).get('A');
  assert.equal(pendingOnly.points, 0);
  assert.equal(pendingOnly.opWin, null);
});

test('unknown outcomes propagate unavailable resistance rather than silently becoming a result', () => {
  const stats = calculateSwissStats([pod(
    round(['A', 'B', '99'], ['C', 'D', '1']),
    round(['C', 'A', '1'], ['D', 'B', '1']),
  )]);
  assert.equal(stats.get('A'), null);
  assert.equal(stats.get('B'), null);
  assert.equal(stats.get('C').points, 6);
  assert.equal(stats.get('C').opWin, null);
  assert.equal(stats.get('C').opOpWin, null);
});

test('top-cut and unknown round types never pollute Swiss records or resistance', () => {
  const swiss = round(['A', 'B', '1']);
  const cut = { ...round(['A', 'B', '2']), type: '1' };
  const unknown = { ...cut, type: null };
  const stats = calculateSwissStats([pod(swiss, cut, unknown)]);
  assert.equal(stats.get('A').points, 3);
  assert.equal(stats.get('A').losses, 0);
  assert.equal(calculateSwissStats([pod(cut)]).size, 0);
});

test('duplicated participation and impossible bye outcomes are unavailable', () => {
  assert.equal(calculateSwissStats([pod(round(['A', 'B', '1'], ['A', 'C', '1']))]).get('A'), null);
  assert.equal(calculateSwissStats([pod(round(['A', null, '2']))]).get('A'), null);
});

test('persisted summaries are whitelisted and invalid data cannot fabricate standings', () => {
  const stats = { wins: 1, losses: 2, ties: 1, points: 4, byes: 0, pending: 1, opWin: 0.4, opOpWin: 0.5 };
  assert.deepEqual(restoreSwissStats({ ...stats, userid: 'private', birthdate: 'private' }), stats);
  assert.equal(restoreSwissStats(undefined), null);
  for (const patch of [{ points: 999 }, { wins: -1 }, { byes: 2 }, { opWin: 1.01 }, { opOpWin: '50%' }, { pending: 1.5 }]) {
    assert.throws(() => restoreSwissStats({ ...stats, ...patch }));
  }
});
