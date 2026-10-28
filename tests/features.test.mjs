import test from 'node:test';
import assert from 'node:assert/strict';
import { newTimer, beginBreak, setExtension, advance, remaining, toggleRunning, restoreTimer } from '../site/timer.js';
import { restorePreferences, DEFAULT_PREFERENCES } from '../site/preferences.js';
import { translate } from '../site/i18n.js';

const NOW = 1793188800000;
const MINUTE = 60000;

test('custom lengths retain official minimums and cap at 180 minutes', () => {
  assert.equal(newTimer('bo3', 1, 75).durationMs, 75 * MINUTE);
  assert.equal(newTimer('bo3', 1, 49).durationMs, 50 * MINUTE);
  assert.equal(newTimer('bo1', 1, 29).durationMs, 30 * MINUTE);
  assert.equal(newTimer('bo1', 1, 181).durationMs, 30 * MINUTE);
  assert.equal(newTimer('bo1', 0, 30).round, 1);
  let state = toggleRunning(newTimer('bo3', 7, 75), NOW);
  state = advance(state, NOW + 75 * MINUTE);
  assert.equal(state.phase, 'overtime');
  assert.equal(state.deadline, NOW + 90 * MINUTE);
});

test('legacy sessions migrate without losing their running deadline', () => {
  const legacy = toggleRunning(newTimer('bo3', 4), NOW);
  delete legacy.durationMs;
  delete legacy.extensions;
  delete legacy.breakTimer;
  const restored = restoreTimer(JSON.stringify(legacy), NOW + 10 * MINUTE);
  assert.equal(restored.durationMs, 50 * MINUTE);
  assert.equal(remaining(restored, NOW + 10 * MINUTE), 40 * MINUTE);
  assert.deepEqual(restored.extensions, []);
});

test('breaks prepare the next round but never start it or enter overtime', () => {
  let state = toggleRunning(newTimer('bo3', 4, 75), NOW);
  state = beginBreak(state, 10, NOW + 5 * MINUTE);
  assert.equal(state.round, 5);
  assert.equal(state.started, false);
  assert.equal(state.running, false);
  assert.equal(state.remainingMs, 75 * MINUTE);
  assert.equal(state.breakTimer.running, true);
  state = advance(state, NOW + 40 * MINUTE);
  assert.equal(state.phase, 'round');
  assert.equal(state.breakTimer.complete, true);
  assert.equal(state.breakTimer.running, false);
  assert.equal(remaining(state), 0);
  assert.equal(toggleRunning(state), state);
});

test('break pause, resume and reload retain exact time', () => {
  let state = beginBreak(newTimer('bo1', 3), 10, NOW);
  assert.equal(state.round, 3);
  state = toggleRunning(state, NOW + 2 * MINUTE);
  assert.equal(state.breakTimer.running, false);
  state = restoreTimer(JSON.stringify(state), NOW + 60 * MINUTE);
  assert.equal(remaining(state), 8 * MINUTE);
  state = toggleRunning(state, NOW + 60 * MINUTE);
  assert.equal(state.breakTimer.deadline, NOW + 68 * MINUTE);
  state = restoreTimer(JSON.stringify(state), NOW + 70 * MINUTE);
  assert.equal(state.breakTimer.complete, true);
  assert.equal(state.started, false);
});

test('invalid break metadata cannot replace or reset a running round', () => {
  const state = toggleRunning(newTimer(), NOW);
  assert.equal(beginBreak(state, 0, NOW), state);
  assert.equal(beginBreak(state, 121, NOW), state);
  const bad = { ...state, breakTimer: { running: true, deadline: NOW + MINUTE } };
  const restored = restoreTimer(JSON.stringify(bad), NOW);
  assert.equal(restored.breakTimer, null);
  assert.equal(restored.deadline, state.deadline);
});

test('extension totals update by table without affecting the deadline', () => {
  let state = toggleRunning(newTimer(), NOW);
  const deadline = state.deadline;
  state = setExtension(state, ' 4A ', 3);
  state = setExtension(state, '4a', 5);
  assert.deepEqual(state.extensions, [{ table: '4a', minutes: 5 }]);
  assert.equal(state.deadline, deadline);
  assert.equal(setExtension(state, ' ', 2), state);
  assert.equal(setExtension(state, '3', 0), state);
  assert.equal(setExtension(state, '3', 61), state);
  const restored = restoreTimer(JSON.stringify({ ...state, extensions: [...state.extensions, null, { table: 'bad', minutes: -2 }] }), NOW);
  assert.deepEqual(restored.extensions, state.extensions);
  assert.equal(restored.deadline, deadline);
  assert.deepEqual(beginBreak(state, 5, NOW).extensions, []);
});

test('corrupt preferences use safe defaults', () => {
  for (const raw of [null, '{bad', '42', 'null', '{}']) assert.deepEqual(restorePreferences(raw), DEFAULT_PREFERENCES);
  assert.deepEqual(restorePreferences('{"language":"sk","volume":0.4,"showExtensions":false}'), { language: 'sk', volume: 0.4, showExtensions: false });
  assert.deepEqual(restorePreferences('{"language":"bad","volume":-1,"showExtensions":"yes"}'), DEFAULT_PREFERENCES);
});

test('English and Slovak messages interpolate without interpreting user HTML', () => {
  assert.equal(translate('sk', 'ROUND {round}', { round: '03' }), 'KOLO 03');
  assert.equal(translate('en', 'Table {table}: +{minutes} min', { table: '<img>', minutes: 3 }), 'Table <img>: +3 min');
  assert.equal(translate('sk', 'Start round'), 'Spustiť kolo');
});

test('Slovak messages are direct and extension counts use natural agreement', () => {
  assert.equal(translate('sk', 'Good games start here.'), 'Kolo je pripravené.');
  assert.equal(translate('sk', 'Round in progress. Good luck, Trainers.'), 'Kolo prebieha.');
  assert.equal(translate('sk', 'That’s time. Thank you, Trainers.'), 'Nadstavenie sa skončilo.');
  assert.equal(translate('en', 'Good games start here.'), 'Good games start here.');
  assert.equal(translate('sk', '{minutes} MINUTES', { minutes: 1 }), '1 MIN');
  for (const count of [1, 2, 4]) {
    assert.equal(translate('sk', '+{count} more · ask a judge', { count }), `+${count} ďalšie · podrobnosti u rozhodcu`);
  }
  assert.equal(translate('sk', '+{count} more · ask a judge', { count: 5 }), '+5 ďalších · podrobnosti u rozhodcu');
});
