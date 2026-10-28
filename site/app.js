import { FORMATS, OVERTIME_MS, newTimer, advance, remaining, toggleRunning, formatTime, restoreTimer } from './timer.js';

const STORAGE_KEY = 'locals-tcg-timer-v1';
const SOUND_KEY = 'locals-tcg-sound-v1';
// Cache the small local clip on load so alerts do not depend on a network at time called.
const itemSoundData = fetch(new URL('./sounds/pokemon-item-received.mp3', import.meta.url))
  .then((response) => response.ok ? response.arrayBuffer() : null)
  .catch(() => null);
const $ = (id) => document.getElementById(id);
const elements = Object.fromEntries([
  'time-display', 'round-label', 'status-label', 'timeline-fill', 'phase-label',
  'duration-label', 'stage-heading', 'stage-description', 'overtime-reminder',
  'start-pause', 'sound-toggle', 'announcement', 'confirm-dialog', 'rules-dialog',
].map((id) => [id, $(id)]));

function readStorage(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

let state = restoreTimer(readStorage(STORAGE_KEY));
let soundEnabled = readStorage(SOUND_KEY) !== 'off';
let audio;
let itemSoundBuffer;
let soundPlayback = 0;
const activeSounds = new Set();
let wakeLock;
let wakeRequest;
let interacted = false;
let tvMode = false;
let confirmAction = null;
let previousFocus;
let toastTimeout;
let lastDisplay = '';
let lastView = '';

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Timer also works without storage. */ }
}

function announce(message) {
  elements.announcement.textContent = message;
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { $('toast').hidden = true; }, 4500);
}

function unlockAudio() {
  interacted = true;
  if (!soundEnabled) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') void audio.resume().catch(() => {});
    void loadItemSound();
  } catch { /* Sound is optional on browsers without Web Audio. */ }
}

function loadItemSound() {
  itemSoundBuffer ??= itemSoundData
    .then((data) => data ? audio.decodeAudioData(data) : null)
    .catch(() => null);
  return itemSoundBuffer;
}

function stopSounds() {
  soundPlayback += 1;
  for (const source of activeSounds) {
    try { source.stop(); } catch { /* Already-ended sources need no further action. */ }
  }
  activeSounds.clear();
}

function connectSound(source, gain) {
  source.connect(gain).connect(audio.destination);
  activeSounds.add(source);
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
    activeSounds.delete(source);
  };
}

async function chime(kind) {
  stopSounds();
  if (!soundEnabled || !audio) return;
  const playback = soundPlayback;
  try {
    if (audio.state === 'suspended') await audio.resume();
    const buffer = kind === 'overtime' ? await loadItemSound() : null;
    // Muting or a newer alert cancels playback that was waiting for decoding/resume.
    if (!soundEnabled || playback !== soundPlayback || audio.state !== 'running') return;
    if (buffer) {
      const source = audio.createBufferSource();
      const gain = audio.createGain();
      source.buffer = buffer;
      gain.gain.value = 0.65;
      connectSound(source, gain);
      source.start();
      return;
    }
  } catch { /* Fall back to the generated alert if the clip cannot be played. */ }
  if (!soundEnabled || playback !== soundPlayback || audio.state !== 'running') return;
  const notes = kind === 'overtime' ? [660, 660, 880] : [660, 520, 440];
  const start = audio.currentTime;
  notes.forEach((frequency, index) => {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    const at = start + index * 0.32;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.22, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.65);
    connectSound(oscillator, gain);
    oscillator.start(at);
    oscillator.stop(at + 0.7);
  });
}

async function syncWakeLock() {
  const needed = state.running && document.visibilityState === 'visible' && interacted;
  if (!needed && wakeLock) {
    const lock = wakeLock;
    wakeLock = null;
    await lock.release().catch(() => {});
  } else if (needed && !wakeLock && !wakeRequest && 'wakeLock' in navigator) {
    wakeRequest = navigator.wakeLock.request('screen');
    try {
      const lock = await wakeRequest;
      wakeLock = lock;
      lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
      if (!state.running || document.visibilityState !== 'visible') {
        wakeLock = null;
        await lock.release().catch(() => {});
      }
    } catch { /* OS settings or battery saver can deny a wake lock. */ }
    finally { wakeRequest = null; }
  }
}

function render(now = Date.now()) {
  const ms = remaining(state, now);
  const display = formatTime(ms);
  if (display !== lastDisplay) {
    elements['time-display'].textContent = display;
    const [minutes, seconds] = display.split(':').map(Number);
    elements['time-display'].setAttribute('aria-label', `${minutes} minutes ${seconds} seconds remaining`);
    lastDisplay = display;
  }
  document.title = `${display} · ${state.phase === 'overtime' ? 'Overtime' : 'Round ' + state.round} · Pokémon TCG · Kraken Cards`;
  const total = state.phase === 'round' ? FORMATS[state.format].minutes * 60000 : OVERTIME_MS;
  elements['timeline-fill'].style.transform = `scaleX(${Math.min(1, ms / total)})`;
  document.body.dataset.warning = String(state.phase === 'round' && state.started && ms <= 5 * 60000);
  const view = `${state.phase}-${state.running}-${state.started}-${state.format}-${state.round}`;
  if (view === lastView) return;
  lastView = view;
  const paused = state.started && !state.running && state.phase !== 'complete';
  document.body.dataset.phase = state.phase;
  document.body.dataset.paused = String(paused);
  document.body.dataset.running = String(state.running);
  elements['round-label'].textContent = `ROUND ${String(state.round).padStart(2, '0')}`;
  elements['status-label'].textContent = paused ? 'TIMER PAUSED' : state.phase === 'complete' ? 'ROUND COMPLETE' : state.phase === 'overtime' ? 'TIME CALLED · OVERTIME' : state.running ? 'ROUND IN PROGRESS' : 'READY TO PLAY';
  elements['phase-label'].textContent = state.phase === 'overtime' ? 'OVERTIME REMAINING' : state.phase === 'complete' ? 'OVERTIME LIMIT REACHED' : 'ROUND TIME';
  elements['duration-label'].textContent = state.phase === 'round' ? `${FORMATS[state.format].minutes} MINUTES` : '15 MINUTE MAXIMUM';
  elements['overtime-reminder'].hidden = state.phase !== 'overtime';

  let heading, description;
  if (state.phase === 'complete') {
    heading = 'That’s time. Thank you, Trainers.';
    description = 'Overtime limit reached. Call a judge for any unresolved matches.';
  } else if (paused) {
    heading = 'A moment at the judge’s table.';
    description = 'The clock is paused. Wait for the judge’s announcement to resume.';
  } else if (state.phase === 'overtime') {
    heading = 'Finish the current turn, then 3 additional turns.';
    description = 'Report your result as soon as your match is resolved.';
  } else if (state.running) {
    heading = 'Round in progress. Good luck, Trainers.';
    description = 'Play at a steady pace. Raise your hand if you need a judge.';
  } else {
    heading = 'Good games start here.';
    description = 'Find your opponent. Shuffle up. Make it a good round.';
  }
  elements['stage-heading'].textContent = heading;
  elements['stage-description'].textContent = description;
  const completed = state.phase === 'complete';
  const button = elements['start-pause'];
  button.querySelector('use').setAttribute('href', completed ? '#i-check' : state.running ? '#i-pause' : '#i-play');
  button.querySelector('span').textContent = completed ? 'Round complete' : state.running ? 'Pause timer' : state.started ? 'Resume timer' : 'Start round';
  button.disabled = completed;
  for (const option of document.querySelectorAll('[data-format]')) {
    const selected = option.dataset.format === state.format;
    option.classList.toggle('selected', selected);
    option.setAttribute('aria-pressed', String(selected));
  }
}

function tick() {
  const now = Date.now();
  const next = advance(state, now);
  if (next !== state) {
    state = next;
    persist();
    void chime(state.phase);
    announce(state.phase === 'overtime' ? 'Time called. Finish the current turn, then play three additional turns. The fifteen-minute overtime limit has started.' : 'Overtime limit reached. Call a judge for unresolved matches.');
    void syncWakeLock();
  }
  render(now);
}

function update(next, message) {
  state = next;
  persist();
  tick();
  if (message) announce(message);
  void syncWakeLock();
}

function startPause() {
  unlockAudio();
  tick();
  if (state.phase === 'complete') return;
  const next = toggleRunning(state);
  update(next, next.running ? (state.started ? 'Timer resumed.' : `Round ${state.round} started. ${FORMATS[state.format].minutes} minutes.`) : 'Timer paused.');
}

function askConfirmation(title, description, label, action) {
  previousFocus = document.activeElement;
  $('confirm-title').textContent = title;
  $('confirm-description').textContent = description;
  $('confirm-action').textContent = label;
  confirmAction = action;
  elements['confirm-dialog'].returnValue = '';
  elements['confirm-dialog'].showModal();
}

function resetRound() {
  const reset = () => update(newTimer(state.format, state.round), 'Round reset. Ready to play.');
  if (state.started && state.phase !== 'complete') {
    askConfirmation('Reset this round?', 'This clears the current timer and overtime. The clock keeps running until you confirm.', 'Reset round', reset);
  } else reset();
}

function nextRound() {
  if (state.round >= 999) return toast('Round limit reached. Reset your session in browser storage to start over.');
  const next = () => update(newTimer(state.format, state.round + 1), `Round ${state.round + 1} ready. Press start when everyone is ready.`);
  if (state.started && state.phase !== 'complete') {
    askConfirmation('Move to the next round?', 'This clears the current round. The next round will be ready, but will not start automatically.', 'Next round', next);
  } else next();
}

function selectFormat(format) {
  if (format === state.format) return;
  const change = () => update(newTimer(format, state.round), `${FORMATS[format].label} selected. ${FORMATS[format].minutes} minutes.`);
  if (state.started && state.phase !== 'complete') {
    askConfirmation('Change the match format?', 'Changing the format resets this round’s timer. The clock keeps running until you confirm.', `Use ${format.toUpperCase()}`, change);
  } else change();
}

function renderSound() {
  elements['sound-toggle'].setAttribute('aria-pressed', String(soundEnabled));
  elements['sound-toggle'].setAttribute('aria-label', soundEnabled ? 'Mute alerts' : 'Enable alerts');
  elements['sound-toggle'].title = soundEnabled ? 'Sound on · Pokémon item-received alert · click to mute' : 'Sound off · click to enable and preview';
  elements['sound-toggle'].querySelector('use').setAttribute('href', soundEnabled ? '#i-sound' : '#i-muted');
}

async function toggleTv() {
  unlockAudio();
  tvMode = !tvMode;
  document.body.classList.toggle('tv-mode', tvMode);
  $('tv-toolbar').hidden = !tvMode;
  if (tvMode) {
    elements['time-display'].focus({ preventScroll: true });
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      try { await document.documentElement.requestFullscreen(); } catch { toast('TV layout is on. Use your browser’s fullscreen option if needed.'); }
    }
  } else {
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch { /* TV layout still exits. */ }
    }
    $('tv-toggle').focus({ preventScroll: true });
  }
}

elements['start-pause'].addEventListener('click', startPause);
$('reset').addEventListener('click', resetRound);
$('next-round').addEventListener('click', nextRound);
document.querySelectorAll('[data-format]').forEach((button) => button.addEventListener('click', () => selectFormat(button.dataset.format)));
elements['confirm-dialog'].addEventListener('close', () => {
  const action = confirmAction;
  confirmAction = null;
  if (elements['confirm-dialog'].returnValue === 'confirm') action?.();
  previousFocus?.focus({ preventScroll: true });
});
$('rules-open').addEventListener('click', () => elements['rules-dialog'].showModal());
$('rules-close').addEventListener('click', () => elements['rules-dialog'].close());
$('tv-toggle').addEventListener('click', toggleTv);
$('tv-exit').addEventListener('click', toggleTv);
elements['sound-toggle'].addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  try { localStorage.setItem(SOUND_KEY, soundEnabled ? 'on' : 'off'); } catch { /* Optional preference. */ }
  unlockAudio();
  renderSound();
  if (soundEnabled) void chime('overtime');
  else stopSounds();
  toast(soundEnabled ? 'Sound on. Pokémon item-received jingle at time called; a separate alert at the overtime limit.' : 'Sound off. Visual alerts remain on.');
});

document.addEventListener('keydown', (event) => {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  if (document.querySelector('dialog[open]')) return;
  if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  const key = event.key.toLowerCase();
  if (key === 'f') { event.preventDefault(); void toggleTv(); }
  else if (key === 'escape' && tvMode) { event.preventDefault(); void toggleTv(); }
  else if (key === 'r') { event.preventDefault(); resetRound(); }
  else if ((event.code === 'Space' || key === 'enter') && !event.target.closest('button, a')) {
    event.preventDefault();
    startPause();
  }
});

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && tvMode) {
    tvMode = false;
    document.body.classList.remove('tv-mode');
    $('tv-toolbar').hidden = true;
    $('tv-toggle').focus({ preventScroll: true });
  }
});
document.addEventListener('visibilitychange', () => { tick(); void syncWakeLock(); });
window.addEventListener('pageshow', tick);
window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY) {
    state = restoreTimer(event.newValue);
    tick();
    void syncWakeLock();
  } else if (event.key === SOUND_KEY) {
    soundEnabled = event.newValue !== 'off';
    if (!soundEnabled) stopSounds();
    renderSound();
  }
});
// A click after a restored session unlocks browser audio and the screen wake lock.
document.addEventListener('pointerdown', () => { unlockAudio(); void syncWakeLock(); }, { once: true });
function renderLocalTime() {
  $('local-time').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).toUpperCase();
}

renderSound();
renderLocalTime();
tick();
setInterval(tick, 100);
setInterval(renderLocalTime, 10000);
