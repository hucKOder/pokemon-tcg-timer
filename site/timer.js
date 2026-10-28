export const OVERTIME_MS = 15 * 60 * 1000;
export const FORMATS = Object.freeze({
  bo1: Object.freeze({ minutes: 30, label: 'Best of one' }),
  bo3: Object.freeze({ minutes: 50, label: 'Best of three' }),
});

export function newTimer(format = 'bo1', round = 1, minutes) {
  if (!Object.hasOwn(FORMATS, format)) format = 'bo1';
  if (!Number.isInteger(round) || round < 1 || round > 999) round = 1;
  if (!Number.isInteger(minutes) || minutes < FORMATS[format].minutes || minutes > 180) minutes = FORMATS[format].minutes;
  return {
    version: 1,
    format,
    round,
    phase: 'round',
    started: false,
    running: false,
    durationMs: minutes * 60000,
    remainingMs: minutes * 60000,
    deadline: null,
    breakTimer: null,
    extensions: [],
  };
}

// Deadlines, not tick counts, keep background tabs and restored sessions accurate.
export function advance(state, now = Date.now()) {
  if (state.breakTimer) {
    const clock = state.breakTimer;
    if (!clock.running || clock.deadline > now) return state;
    return { ...state, breakTimer: { ...clock, complete: true, running: false, deadline: null, remainingMs: 0 } };
  }
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
  const clock = state.breakTimer || state;
  return Math.max(0, clock.running ? clock.deadline - now : clock.remainingMs);
}

export function beginBreak(state, minutes = 10, now = Date.now()) {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) return state;
  // Preparing the next round never starts it. An active round requires UI confirmation first.
  const prepared = state.started ? newTimer(state.format, Math.min(999, state.round + 1), state.durationMs / 60000) : state;
  const durationMs = minutes * 60000;
  return { ...prepared, breakTimer: { durationMs, remainingMs: durationMs, deadline: now + durationMs, running: true, started: true, complete: false } };
}

export function setExtension(state, table, minutes) {
  table = typeof table === 'string' ? table.trim() : '';
  if (!table || table.length > 20 || !Number.isInteger(minutes) || minutes < 1 || minutes > 60) return state;
  const existing = state.extensions.findIndex((item) => item.table.toLowerCase() === table.toLowerCase());
  const extensions = [...state.extensions];
  if (existing >= 0) extensions[existing] = { table, minutes };
  else if (extensions.length < 50) extensions.push({ table, minutes });
  else return state;
  return { ...state, extensions };
}

export function toggleRunning(state, now = Date.now()) {
  state = advance(state, now);
  if (state.breakTimer) {
    const clock = state.breakTimer;
    if (clock.complete) return state;
    return { ...state, breakTimer: clock.running
      ? { ...clock, running: false, remainingMs: remaining(state, now), deadline: null }
      : { ...clock, running: true, deadline: now + clock.remainingMs } };
  }
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
    const durationMs = state.durationMs ?? FORMATS[state.format].minutes * 60000;
    if (!Number.isInteger(durationMs) || !Number.isInteger(durationMs / 60000) || durationMs < FORMATS[state.format].minutes * 60000 || durationMs > 180 * 60000) return newTimer();
    const maximum = state.phase === 'round' ? durationMs : OVERTIME_MS;
    if (state.remainingMs > maximum
      || (state.running && (!state.started || state.phase === 'complete' || !Number.isFinite(state.deadline)))
      || (!state.started && (state.phase !== 'round' || state.remainingMs !== maximum))
      || (state.phase === 'complete' && (state.remainingMs !== 0 || !state.started))
      || (state.running && state.deadline - now > maximum)) return newTimer();
    let restored = { ...state, durationMs, deadline: state.running ? state.deadline : null, extensions: [], breakTimer: null };
    if (Array.isArray(state.extensions)) {
      for (const item of state.extensions.slice(0, 50)) {
        if (item && typeof item === 'object') restored = setExtension(restored, item.table, item.minutes);
      }
    }
    const clock = state.breakTimer;
    if (clock && !state.started && !state.running && state.phase === 'round'
      && Number.isInteger(clock.durationMs) && Number.isInteger(clock.durationMs / 60000) && clock.durationMs >= 60000 && clock.durationMs <= 120 * 60000
      && Number.isFinite(clock.remainingMs) && clock.remainingMs >= 0 && clock.remainingMs <= clock.durationMs
      && clock.started === true && typeof clock.running === 'boolean' && typeof clock.complete === 'boolean'
      && (!clock.complete || (!clock.running && clock.remainingMs === 0))
      && (!clock.running || (Number.isFinite(clock.deadline) && clock.deadline - now <= clock.durationMs))) {
      restored.breakTimer = { ...clock, deadline: clock.running ? clock.deadline : null };
    }
    return advance(restored, now);
  } catch {
    return newTimer();
  }
}
