import test from 'node:test';
import assert from 'node:assert/strict';
import { newTimer, toggleRunning, advance, remaining, formatTime, restoreTimer, OVERTIME_MS } from '../site/timer.js';

const MINUTE = 60000;
const NOW = 1793188800000;

test('BO1 and BO3 are 30 and 50 minutes, respectively', () => {
  assert.equal(newTimer().remainingMs, 30 * MINUTE);
  assert.equal(newTimer('bo3').remainingMs, 50 * MINUTE);
  assert.equal(newTimer('__proto__').format, 'bo1');
});

test('starting a timer establishes an absolute deadline', () => {
  const state = toggleRunning(newTimer(), NOW);
  assert.equal(state.running, true);
  assert.equal(state.started, true);
  assert.equal(state.deadline, NOW + 30 * MINUTE);
  assert.equal(remaining(state, NOW + 12345), 30 * MINUTE - 12345);
});

test('pause and resume preserve the exact remaining milliseconds', () => {
  let state = toggleRunning(newTimer('bo3'), NOW);
  state = toggleRunning(state, NOW + 12345);
  assert.equal(state.running, false);
  assert.equal(state.deadline, null);
  assert.equal(remaining(state, NOW + 999999), 50 * MINUTE - 12345);
  state = toggleRunning(state, NOW + MINUTE);
  assert.equal(state.deadline, NOW + MINUTE + 50 * MINUTE - 12345);
});

test('time called begins a single shared 15-minute overtime immediately', () => {
  const state = toggleRunning(newTimer(), NOW);
  assert.equal(advance(state, NOW + 30 * MINUTE - 1).phase, 'round');
  const overtime = advance(state, NOW + 30 * MINUTE);
  assert.equal(overtime.phase, 'overtime');
  assert.equal(overtime.running, true);
  assert.equal(overtime.deadline, NOW + 45 * MINUTE);
  assert.equal(remaining(overtime, NOW + 30 * MINUTE), OVERTIME_MS);
});

test('a suspended/background tab never grants extra overtime', () => {
  const state = toggleRunning(newTimer(), NOW);
  const overtime = advance(state, NOW + 37 * MINUTE);
  assert.equal(overtime.phase, 'overtime');
  assert.equal(remaining(overtime, NOW + 37 * MINUTE), 8 * MINUTE);
  assert.equal(overtime.deadline, NOW + 45 * MINUTE);
});

test('sleeping through both phases completes the round', () => {
  const state = toggleRunning(newTimer('bo3'), NOW);
  const completed = advance(state, NOW + 80 * MINUTE);
  assert.equal(completed.phase, 'complete');
  assert.equal(completed.running, false);
  assert.equal(completed.remainingMs, 0);
  assert.equal(completed.deadline, null);
});

test('overtime completes at its exact limit, not one tick later', () => {
  let state = toggleRunning(newTimer(), NOW);
  state = advance(state, NOW + 30 * MINUTE);
  assert.equal(advance(state, NOW + 45 * MINUTE - 1).phase, 'overtime');
  assert.equal(advance(state, NOW + 45 * MINUTE).phase, 'complete');
});

test('pausing at the boundary pauses overtime, not the expired main clock', () => {
  let state = toggleRunning(newTimer(), NOW);
  state = toggleRunning(state, NOW + 31 * MINUTE);
  assert.equal(state.phase, 'overtime');
  assert.equal(state.running, false);
  assert.equal(state.remainingMs, 14 * MINUTE);
  state = toggleRunning(state, NOW + 33 * MINUTE);
  assert.equal(state.deadline, NOW + 47 * MINUTE);
});

test('completed rounds cannot restart accidentally', () => {
  let state = toggleRunning(newTimer(), NOW);
  state = advance(state, NOW + 45 * MINUTE);
  assert.equal(toggleRunning(state, NOW + 46 * MINUTE), state);
});

test('formatting rounds up partial seconds and never shows negative values', () => {
  assert.equal(formatTime(30 * MINUTE), '30:00');
  assert.equal(formatTime(MINUTE - 1), '01:00');
  assert.equal(formatTime(1001), '00:02');
  assert.equal(formatTime(1), '00:01');
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(-999), '00:00');
});

test('restoring after refresh continues from the original deadline', () => {
  const state = toggleRunning(newTimer('bo3', 4), NOW);
  const restored = restoreTimer(JSON.stringify(state), NOW + 10 * MINUTE);
  assert.equal(restored.round, 4);
  assert.equal(restored.running, true);
  assert.equal(remaining(restored, NOW + 10 * MINUTE), 40 * MINUTE);
});

test('restoring during overtime or after both deadlines reconciles automatically', () => {
  const raw = JSON.stringify(toggleRunning(newTimer(), NOW));
  const overtime = restoreTimer(raw, NOW + 40 * MINUTE);
  assert.equal(overtime.phase, 'overtime');
  assert.equal(remaining(overtime, NOW + 40 * MINUTE), 5 * MINUTE);
  assert.equal(restoreTimer(raw, NOW + 50 * MINUTE).phase, 'complete');
});

test('paused timers stay paused across reloads', () => {
  let state = toggleRunning(newTimer(), NOW);
  state = toggleRunning(state, NOW + 12 * MINUTE);
  const restored = restoreTimer(JSON.stringify(state), NOW + 120 * MINUTE);
  assert.equal(restored.running, false);
  assert.equal(restored.remainingMs, 18 * MINUTE);
});

test('corrupt, incomplete, and impossible storage resets safely', () => {
  for (const raw of [null, '{}', '{bad', 'null', '[]', '42', '"text"']) {
    assert.deepEqual(restoreTimer(raw, NOW), newTimer());
  }
  for (const changes of [
    { format: '__proto__' }, { version: 2 }, { round: -1 }, { round: 1.5 },
    { round: 1000 }, { remainingMs: -10 }, { remainingMs: 31 * MINUTE },
    { phase: 'unknown' }, { running: true, deadline: null },
    { running: true, started: true, deadline: NOW + 31 * MINUTE },
    { phase: 'complete' }, { phase: 'overtime' },
  ]) {
    assert.deepEqual(restoreTimer(JSON.stringify({ ...newTimer(), ...changes }), NOW), newTimer());
  }
});
