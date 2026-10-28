export const OVERTIME_MS = 15 * 60 * 1000;
export const FORMATS = Object.freeze({
  bo1: Object.freeze({ minutes: 30, label: 'Best of one' }),
  bo3: Object.freeze({ minutes: 50, label: 'Best of three' }),
});

export function newTimer(format = 'bo1', round = 1) {
  if (!Object.hasOwn(FORMATS, format)) format = 'bo1';
  return {
    version: 1,
    format,
    round,
    phase: 'round',
    started: false,
    running: false,
    remainingMs: FORMATS[format].minutes * 60 * 1000,
    deadline: null,
  };
}

// Deadlines, not tick counts, keep background tabs and restored sessions accurate.
export function advance(state, now = Date.now()) {
  if (!state.running) return state;
  if (state.deadline > now) return state;
  if (state.phase === 'round') {
    const overtimeDeadline = state.deadline + OVERTIME_MS;
    if (overtimeDeadline > now) {
      return { ...state, phase: 'overtime', deadline: overtimeDeadline, remainingMs: OVERTIME_MS };
    }
  }
  return { ...state, phase: 'complete', running: false, deadline: null, remainingMs: 0 };
}

export function remaining(state, now = Date.now()) {
  return Math.max(0, state.running ? state.deadline - now : state.remainingMs);
}

export function toggleRunning(state, now = Date.now()) {
  state = advance(state, now);
  if (state.phase === 'complete') return state;
  if (state.running) {
    return { ...state, running: false, remainingMs: remaining(state, now), deadline: null };
  }
  return { ...state, started: true, running: true, deadline: now + state.remainingMs };
}

export function formatTime(milliseconds) {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function restoreTimer(raw, now = Date.now()) {
  try {
    const state = JSON.parse(raw);
    if (!state || state.version !== 1 || !Object.hasOwn(FORMATS, state.format)
      || !Number.isInteger(state.round) || state.round < 1 || state.round > 999
      || !['round', 'overtime', 'complete'].includes(state.phase)
      || typeof state.running !== 'boolean' || typeof state.started !== 'boolean'
      || !Number.isFinite(state.remainingMs) || state.remainingMs < 0) return newTimer();
    const maximum = state.phase === 'round' ? FORMATS[state.format].minutes * 60000 : OVERTIME_MS;
    if (state.remainingMs > maximum
      || (state.running && (!state.started || state.phase === 'complete' || !Number.isFinite(state.deadline)))
      || (!state.started && (state.phase !== 'round' || state.remainingMs !== maximum))
      || (state.phase === 'complete' && (state.remainingMs !== 0 || !state.started))
      || (state.running && state.deadline - now > maximum)) return newTimer();
    return advance({ ...state, deadline: state.running ? state.deadline : null }, now);
  } catch {
    return newTimer();
  }
}
