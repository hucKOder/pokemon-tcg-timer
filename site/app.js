import { FORMATS, OVERTIME_MS, newTimer, beginBreak, setExtension, advance, remaining, toggleRunning, formatTime, restoreTimer } from './timer.js?v=2';
import { restorePreferences } from './preferences.js?v=2';
import { translate } from './i18n.js?v=6';
import { MAX_TOM_BYTES, PAIRINGS_PER_PAGE, ROTATION_MS, parseTom, restorePairings, pairingPage } from './pairings.js?v=3';

const STORAGE_KEY = 'locals-tcg-timer-v1';
const SOUND_KEY = 'locals-tcg-sound-v1';
const PREFERENCES_KEY = 'locals-tcg-preferences-v1';
const PAIRINGS_KEY = 'locals-tcg-pairings-v1';
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
let preferences = restorePreferences(readStorage(PREFERENCES_KEY));
let pairings = restorePairings(readStorage(PAIRINGS_KEY));
let pairingsVisible = false;
let tomView = 'pairings';
let pairingsPage = 0;
let pairingsRotating = true;
let pairingsRotation;
let importSequence = 0;
const t = (source, values) => translate(preferences.language, source, values);
let audio;
let masterVolume;
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

function savePreferences() {
  try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences)); } catch { /* Optional preferences. */ }
}

function applyPreferences() {
  $('toast').hidden = true;
  $('settings-status').hidden = true;
  document.documentElement.lang = preferences.language;
  for (const element of document.querySelectorAll('[data-i18n]')) {
    element.dataset.i18n ||= element.textContent.trim();
    element.textContent = t(element.dataset.i18n);
  }
  for (const [attribute, dataKey] of [['aria-label', 'i18nAria'], ['title', 'i18nTitle']]) {
    for (const element of document.querySelectorAll(`[data-${dataKey === 'i18nAria' ? 'i18n-aria' : 'i18n-title'}]`)) {
      element.dataset[dataKey] ||= element.getAttribute(attribute);
      element.setAttribute(attribute, t(element.dataset[dataKey]));
    }
  }
  $('language').value = preferences.language;
  $('volume').value = Math.round(preferences.volume * 100);
  $('volume-value').textContent = `${Math.round(preferences.volume * 100)}%`;
  $('show-extensions').checked = preferences.showExtensions;
  if (masterVolume) masterVolume.gain.setValueAtTime(preferences.volume, audio.currentTime);
  lastView = '';
  lastDisplay = '';
  renderSound();
  renderLocalTime();
  renderPairings();
  tick();
}

function selectedPairings() {
  return pairings?.data.rounds.find((round) => round.key === pairings.selectedKey);
}

function selectedStandings() {
  return pairings?.data.standings.find((group) => group.key === pairings.selectedStandingsKey);
}

function currentTomEntries() {
  return (tomView === 'standings' ? selectedStandings()?.entries : selectedPairings()?.matches) || [];
}

function divisionLabel(code) {
  const divisions = { '0': 'Juniors', '1': 'Seniors', '2': 'Masters' };
  return Object.hasOwn(divisions, code) ? t(divisions[code]) : t('Division {division}', { division: code });
}

function pairingLabel(round) {
  return `${t('Round {round}', { round: round.number })} · ${divisionLabel(round.division)}`;
}

function standingsLabel(group) {
  const suffix = group.type === 'finished' ? '' : ` · ${group.type === 'dnf' ? t('Dropped / unfinished') : t('Group {group}', { group: group.type })}`;
  return `${t('Standings')} · ${divisionLabel(group.division)}${suffix}`;
}

function renderTomViewButtons() {
  $('tv-pairings').textContent = t(pairingsVisible && tomView === 'pairings' ? 'Show timer' : 'Show pairings');
  $('tv-standings').textContent = t(pairingsVisible && tomView === 'standings' ? 'Show timer' : 'Show standings');
}

function persistPairings() {
  try {
    if (pairings) localStorage.setItem(PAIRINGS_KEY, JSON.stringify(pairings));
    else localStorage.removeItem(PAIRINGS_KEY);
  } catch { toast(t('TOM views work in this tab, but browser storage is unavailable.')); }
}

function restartPairingsRotation() {
  clearInterval(pairingsRotation);
  if (pairingsVisible && pairingsRotating && currentTomEntries().length > PAIRINGS_PER_PAGE) {
    pairingsRotation = setInterval(() => {
      if (document.visibilityState !== 'visible' || document.querySelector('dialog[open]')) return;
      pairingsPage += 1;
      renderPairingsPage();
    }, ROTATION_MS);
  }
}

function setPairingsVisible(visible) {
  pairingsVisible = Boolean(visible && pairings);
  document.body.classList.toggle('show-pairings', pairingsVisible);
  $('pairings-stage').hidden = !pairingsVisible;
  renderTomViewButtons();
  restartPairingsRotation();
  if (pairingsVisible) {
    renderPairingsPage();
    $('pairings-heading').focus({ preventScroll: true });
  } else if (document.activeElement?.closest('#pairings-stage')) elements['time-display'].focus({ preventScroll: true });
  void syncWakeLock();
}

function renderPairingsPage() {
  if (!pairings) return;
  const isStandings = tomView === 'standings';
  const round = selectedPairings();
  const group = selectedStandings();
  const entries = currentTomEntries();
  const page = pairingPage(entries, pairingsPage);
  pairingsPage = page.index;
  $('tom-view-eyebrow').textContent = t(isStandings ? 'TOM RANKS · CALCULATED SWISS STATS' : 'TOM · LOCAL PAIRINGS');
  $('pairings-heading').textContent = isStandings ? (group ? standingsLabel(group) : t('Standings')) : (round ? pairingLabel(round) : t('Pairings'));
  $('pairings-event').textContent = pairings.data.name;
  $('pairings-warning').hidden = isStandings || !round || round.number === state.round;
  $('pairings-warning').textContent = round ? t('Timer: round {round}. Displayed pairings: round {pairingRound}.', { round: state.round, pairingRound: round.number }) : '';
  $('tom-table').hidden = !entries.length;
  $('tom-table').classList.toggle('standings-table', isStandings);
  $('pairings-navigation').hidden = !entries.length;
  $('tom-empty').hidden = entries.length > 0;
  $('tom-empty').textContent = t(isStandings ? 'This TOM file has no saved rankings. TOM may only export rankings when the tournament ends. Ranking order is never calculated here.' : 'No pairings are saved in this TOM file.');
  $('standings-note').hidden = !isStandings || !entries.length;
  $('tom-table-caption').textContent = t(isStandings ? 'TOM ranks with calculated Swiss statistics' : 'Pairings from the imported TOM file');
  $('tom-column-first').textContent = t(isStandings ? 'Rank' : 'Table');
  $('tom-column-second').textContent = t(isStandings ? 'Player' : 'Player 1');
  $('tom-column-third').textContent = t(isStandings ? 'W–L–T' : 'Player 2');
  $('tom-column-third').title = isStandings ? t('Wins–losses–ties. Byes count as wins; pending matches are excluded.') : '';
  for (const [id, label, title] of [
    ['standings-column-points', 'Points', 'Calculated match points: 3 per win, 1 per tie.'],
    ['standings-column-op-win', 'Op Win %', 'Calculated opponents’ win percentage. Random byes are excluded from resistance.'],
    ['standings-column-op-op-win', 'Op Op Win %', 'Calculated opponents’ opponents’ win percentage.'],
  ]) {
    $(id).hidden = !isStandings;
    $(id).textContent = t(label);
    $(id).title = t(title);
  }
  $('pairings-previous').setAttribute('aria-label', t(isStandings ? 'Previous standings page' : 'Previous pairings page'));
  $('pairings-next').setAttribute('aria-label', t(isStandings ? 'Next standings page' : 'Next pairings page'));
  const rows = page.matches.map((entry) => {
    const row = document.createElement('tr');
    const stats = entry.stats;
    const percent = (value) => value === null || value === undefined ? '—' : new Intl.NumberFormat(preferences.language === 'sk' ? 'sk-SK' : 'en-GB', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    const values = isStandings
      ? [entry.place ?? '—', entry.player, stats ? `${stats.wins}–${stats.losses}–${stats.ties}` : '—', stats?.points ?? '—', percent(stats?.opWin), percent(stats?.opOpWin)]
      : [entry.table, entry.player1, entry.player2 ?? t('BYE · No opponent')];
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    if (isStandings && stats && (stats.byes || stats.pending)) {
      const detail = document.createElement('span');
      detail.className = 'record-detail';
      detail.textContent = [stats.byes ? t('Byes: {count}', { count: stats.byes }) : '', stats.pending ? t('Pending: {count}', { count: stats.pending }) : ''].filter(Boolean).join(' · ');
      row.children[2].append(detail);
    }
    return row;
  });
  $('pairings-rows').replaceChildren(...rows);
  $('pairings-page').textContent = t('Page {page} / {count}', { page: page.index + 1, count: page.count });
  $('pairings-previous').disabled = page.count === 1;
  $('pairings-next').disabled = page.count === 1;
  $('pairings-rotation').hidden = page.count === 1;
  $('pairings-rotation').textContent = t(pairingsRotating ? 'Pause rotation' : 'Resume rotation');
  $('pairings-rotation').setAttribute('aria-pressed', String(!pairingsRotating));
  const time = pairings.importedAt ? new Intl.DateTimeFormat(preferences.language === 'sk' ? 'sk-SK' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(pairings.importedAt) : '—';
  $('pairings-source').textContent = t('Local snapshot · imported {time}. Save and re-import after changes in TOM.', { time });
}

function renderPairings() {
  $('pairings-options').hidden = !pairings;
  const hasRounds = Boolean(pairings?.data.rounds.length);
  $('pairings-open').hidden = !hasRounds;
  $('tv-pairings').hidden = !hasRounds;
  $('pairings-show').disabled = !hasRounds;
  $('pairings-round').disabled = !hasRounds;
  $('standings-open').hidden = !pairings;
  $('tv-standings').hidden = !pairings;
  $('pairings-round').replaceChildren();
  $('standings-group').replaceChildren();
  if (!pairings) {
    for (const id of ['pairings-heading', 'pairings-event', 'pairings-warning', 'pairings-rows', 'pairings-page', 'pairings-source', 'standings-import-status', 'tom-empty']) $(id).replaceChildren();
    $('pairings-import-status').textContent = t('No TOM file imported. Maximum file size: 5 MB.');
    setPairingsVisible(false);
    return;
  }
  if (!hasRounds) tomView = 'standings';
  $('pairings-import-status').textContent = t('Loaded locally: {name}', { name: pairings.data.name });
  for (const round of pairings.data.rounds) {
    const option = document.createElement('option');
    option.value = round.key;
    option.textContent = pairingLabel(round);
    $('pairings-round').append(option);
  }
  $('pairings-round').value = pairings.selectedKey;
  for (const group of pairings.data.standings) {
    const option = document.createElement('option');
    option.value = group.key;
    option.textContent = standingsLabel(group);
    $('standings-group').append(option);
  }
  $('standings-group').value = pairings.selectedStandingsKey;
  $('standings-group').disabled = !pairings.data.standings.length;
  $('standings-import-status').textContent = t(pairings.data.standings.length ? 'Saved TOM rankings available. Re-import to update.' : 'No saved rankings in this file. Re-import after TOM saves standings, usually at the end of the event.');
  renderTomViewButtons();
  renderPairingsPage();
  restartPairingsRotation();
}

async function importTomFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const sequence = ++importSequence;
  $('pairings-import-status').textContent = t('Reading TOM file…');
  try {
    if (file.size > MAX_TOM_BYTES) throw new Error('TOM file is too large. Maximum file size: 5 MB.');
    const data = parseTom(await file.text());
    if (sequence !== importSequence) return;
    const latestRound = data.rounds.at(-1);
    const standingsGroup = data.standings.find((group) => group.division === latestRound?.division) || data.standings[0];
    pairings = { data, selectedKey: latestRound?.key ?? null, selectedStandingsKey: standingsGroup?.key ?? null, importedAt: Date.now() };
    pairingsPage = 0;
    persistPairings();
    renderPairings();
  } catch (error) {
    if (sequence === importSequence) $('pairings-import-status').textContent = t(error.message);
  } finally {
    // Release the raw File reference and allow choosing the same saved file again.
    if (sequence === importSequence) event.target.value = '';
  }
}

function announce(message) {
  elements.announcement.textContent = message;
}

function toast(message) {
  const target = $('settings-dialog').open && !$('confirm-dialog').open ? $('settings-status') : $('toast');
  $('toast').hidden = true;
  $('settings-status').hidden = true;
  target.textContent = message;
  target.hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { target.hidden = true; }, 4500);
}

function unlockAudio(force = false) {
  interacted = true;
  if (!soundEnabled && !force) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (!masterVolume) {
      masterVolume = audio.createGain();
      masterVolume.gain.value = preferences.volume;
      masterVolume.connect(audio.destination);
    }
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
  source.connect(gain).connect(masterVolume);
  activeSounds.add(source);
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
    activeSounds.delete(source);
  };
}

async function chime(kind, { preview = false } = {}) {
  stopSounds();
  if ((!soundEnabled && !preview) || !audio) return;
  const playback = soundPlayback;
  try {
    if (audio.state === 'suspended') await audio.resume();
    const buffer = kind === 'overtime' ? await loadItemSound() : null;
    // Muting or a newer alert cancels playback that was waiting for decoding/resume.
    if ((!soundEnabled && !preview) || playback !== soundPlayback || audio.state !== 'running') return;
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
  if ((!soundEnabled && !preview) || playback !== soundPlayback || audio.state !== 'running') return;
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
  const isRunning = () => state.breakTimer ? state.breakTimer.running : state.running;
  const needed = (isRunning() || pairingsVisible) && document.visibilityState === 'visible' && interacted;
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
      if ((!isRunning() && !pairingsVisible) || document.visibilityState !== 'visible') {
        wakeLock = null;
        await lock.release().catch(() => {});
      }
    } catch { /* OS settings or battery saver can deny a wake lock. */ }
    finally { wakeRequest = null; }
  }
}

function render(now = Date.now()) {
  const clock = state.breakTimer || state;
  const inBreak = Boolean(state.breakTimer);
  const ms = remaining(state, now);
  const display = formatTime(ms);
  if (display !== lastDisplay) {
    elements['time-display'].textContent = display;
    const [minutes, seconds] = display.split(':').map(Number);
    elements['time-display'].setAttribute('aria-label', t('{minutes} minutes {seconds} seconds remaining', { minutes, seconds }));
    lastDisplay = display;
  }
  document.title = `${display} · ${inBreak ? t('Break mode') : state.phase === 'overtime' ? t('Overtime') : t('Round {round}', { round: state.round })} · Pokémon TCG · Kraken Cards`;
  const total = inBreak ? clock.durationMs : state.phase === 'round' ? state.durationMs : OVERTIME_MS;
  elements['timeline-fill'].style.transform = `scaleX(${Math.min(1, ms / total)})`;
  document.body.dataset.warning = String(!inBreak && state.phase === 'round' && state.started && ms <= 5 * 60000);
  document.body.dataset.longTime = String(ms > 99 * 60000 + 59000);
  const view = JSON.stringify([state.phase, state.running, state.started, state.format, state.round, state.durationMs, state.breakTimer, state.extensions]);
  if (view === lastView) return;
  lastView = view;
  const completed = inBreak ? clock.complete : state.phase === 'complete';
  const paused = clock.started && !clock.running && !completed;
  document.body.dataset.phase = inBreak ? 'break' : state.phase;
  document.body.dataset.paused = String(paused);
  document.body.dataset.running = String(clock.running);
  elements['round-label'].textContent = inBreak ? t('BREAK') : t('ROUND {round}', { round: String(state.round).padStart(2, '0') });
  elements['status-label'].textContent = t(paused ? 'TIMER PAUSED' : inBreak ? (completed ? 'BREAK COMPLETE' : 'BREAK IN PROGRESS') : completed ? 'ROUND COMPLETE' : state.phase === 'overtime' ? 'TIME CALLED · OVERTIME' : state.running ? 'ROUND IN PROGRESS' : 'READY TO PLAY');
  elements['phase-label'].textContent = t(inBreak ? 'BREAK REMAINING' : state.phase === 'overtime' ? 'OVERTIME REMAINING' : completed ? 'OVERTIME LIMIT REACHED' : 'ROUND TIME');
  const custom = state.durationMs !== FORMATS[state.format].minutes * 60000;
  elements['duration-label'].textContent = inBreak ? t('{minutes} MINUTES', { minutes: clock.durationMs / 60000 }) : state.phase === 'round' ? t(custom ? '{minutes} MINUTES · CUSTOM' : '{minutes} MINUTES', { minutes: state.durationMs / 60000 }) : t('15 MINUTE MAXIMUM');
  elements['overtime-reminder'].hidden = inBreak || state.phase !== 'overtime';
  $('round-footnote').hidden = inBreak;

  let heading, description;
  if (inBreak) {
    heading = completed ? 'Break is over. Please find your seats.' : paused ? 'Break paused.' : 'Next round starts in…';
    description = completed ? t('Wait for the judge to announce the start of round {round}.', { round: state.round }) : paused ? t('The next round will not start until the judge announces it.') : t('Round {round} · Please be seated when the countdown ends.', { round: state.round });
  } else if (state.phase === 'complete') {
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
  elements['stage-heading'].textContent = t(heading);
  elements['stage-description'].textContent = inBreak ? description : t(description);
  const button = elements['start-pause'];
  button.querySelector('use').setAttribute('href', completed ? '#i-check' : clock.running ? '#i-pause' : '#i-play');
  button.querySelector('span').textContent = t(completed ? (inBreak ? 'BREAK COMPLETE' : 'Round complete') : clock.running ? 'Pause timer' : clock.started ? 'Resume timer' : 'Start round');
  button.disabled = completed;
  $('next-round').querySelector('span').textContent = t(inBreak ? 'Back to round' : 'Next round');
  $('reset').setAttribute('aria-label', t(inBreak ? 'Reset break' : 'Reset round'));
  $('reset').title = t(inBreak ? 'Reset break' : 'Reset round (R)');
  for (const option of document.querySelectorAll('[data-format]')) {
    const selected = option.dataset.format === state.format;
    option.classList.toggle('selected', selected);
    option.setAttribute('aria-pressed', String(selected));
    option.querySelector('span').textContent = `${selected ? state.durationMs / 60000 : FORMATS[option.dataset.format].minutes} min`;
    option.disabled = inBreak;
  }
  $('round-minutes').disabled = state.started;
  $('round-minutes').min = FORMATS[state.format].minutes;
  $('round-length-help').textContent = t(state.started ? 'Reset the round before changing its length.' : 'Minimum {minutes} minutes for {format}; maximum 180.', { minutes: FORMATS[state.format].minutes, format: state.format.toUpperCase() });
  renderExtensions();
  if (pairingsVisible) renderPairingsPage();
}

function renderExtensions() {
  const list = $('extension-list');
  list.replaceChildren();
  for (const extension of state.extensions) {
    const row = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = t('Table {table}: +{minutes} min', extension);
    const remove = document.createElement('button');
    remove.className = 'icon-button';
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', t('Remove extension for table {table}', extension));
    remove.addEventListener('click', () => update({ ...state, extensions: state.extensions.filter((item) => item.table !== extension.table) }));
    row.append(label, remove);
    list.append(row);
  }
  $('extensions-empty').hidden = state.extensions.length > 0;
  const visible = preferences.showExtensions && state.extensions.length > 0 && !state.breakTimer;
  $('extensions-summary').hidden = !visible;
  document.body.dataset.hasExtensions = String(visible);
  const chips = $('extensions-chips');
  chips.replaceChildren();
  for (const extension of state.extensions.slice(0, 4)) {
    const chip = document.createElement('span');
    chip.className = 'extension-chip';
    chip.textContent = t('Table {table}: +{minutes} min', extension);
    chip.title = chip.textContent;
    chips.append(chip);
  }
  if (state.extensions.length > 4) {
    const more = document.createElement('span');
    more.textContent = t('+{count} more · ask a judge', { count: state.extensions.length - 4 });
    chips.append(more);
  }
}

function tick() {
  const now = Date.now();
  const next = advance(state, now);
  if (next !== state) {
    const breakEnded = next.breakTimer?.complete && !state.breakTimer?.complete;
    state = next;
    persist();
    void chime(breakEnded ? 'overtime' : state.phase);
    announce(t(breakEnded ? 'Break is over. Please find your seats.' : state.phase === 'overtime' ? 'Time called. Finish the current turn, then play three additional turns. The fifteen-minute overtime limit has started.' : 'Overtime limit reached. Call a judge for unresolved matches.'));
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
  if (state.breakTimer ? state.breakTimer.complete : state.phase === 'complete') return;
  const next = toggleRunning(state);
  const running = next.breakTimer ? next.breakTimer.running : next.running;
  if (running) setPairingsVisible(false);
  update(next, t(running ? ((state.breakTimer || state.started) ? 'Timer resumed.' : 'Round {round} started. {minutes} minutes.') : 'Timer paused.', { round: state.round, minutes: state.durationMs / 60000 }));
}

function askConfirmation(title, description, label, action) {
  previousFocus = document.activeElement;
  $('confirm-title').textContent = t(title);
  $('confirm-description').textContent = t(description);
  $('confirm-action').textContent = t(label);
  confirmAction = action;
  elements['confirm-dialog'].returnValue = '';
  elements['confirm-dialog'].showModal();
}

function resetRound() {
  if (state.breakTimer) {
    const minutes = state.breakTimer.durationMs / 60000;
    askConfirmation('Restart this break?', t('The break countdown will start again from {minutes} minutes.', { minutes }), 'Reset break', () => update(beginBreak(state, minutes)));
    return;
  }
  const reset = () => update(newTimer(state.format, state.round, state.durationMs / 60000), t('Round reset. Ready to play.'));
  if ((state.started && state.phase !== 'complete') || state.extensions.length > 0) {
    askConfirmation('Reset this round?', 'This clears the current timer, overtime, and table extensions. The clock keeps running until you confirm.', 'Reset round', reset);
  } else reset();
}

function nextRound() {
  if (state.breakTimer) {
    const back = () => update({ ...state, breakTimer: null }, t('Round {round} ready. Press start when everyone is ready.', { round: state.round }));
    if (!state.breakTimer.complete) askConfirmation('End break?', 'The round will be ready but will not start automatically.', 'End break', back);
    else back();
    return;
  }
  if (state.round >= 999) return toast(t('Round limit reached. Start a new tournament from Judge controls.'));
  const next = () => update(newTimer(state.format, state.round + 1, state.durationMs / 60000), t('Round {round} ready. Press start when everyone is ready.', { round: state.round + 1 }));
  if ((state.started && state.phase !== 'complete') || state.extensions.length > 0) {
    askConfirmation('Move to the next round?', 'This clears the current round. The next round will be ready, but will not start automatically.', 'Next round', next);
  } else next();
}

function selectFormat(format) {
  if (state.breakTimer || (format === state.format && state.durationMs === FORMATS[format].minutes * 60000)) return;
  const change = () => update(newTimer(format, state.round), t('{format} selected. {minutes} minutes.', { format: format.toUpperCase(), minutes: FORMATS[format].minutes }));
  if ((state.started && state.phase !== 'complete') || state.extensions.length > 0) {
    askConfirmation('Change the match format?', 'Changing the format resets this round’s timer and table extensions. The clock keeps running until you confirm.', t('Use {format}', { format: format.toUpperCase() }), change);
  } else change();
}

function renderSound() {
  elements['sound-toggle'].setAttribute('aria-pressed', String(soundEnabled));
  elements['sound-toggle'].setAttribute('aria-label', t(soundEnabled ? 'Mute alerts' : 'Enable alerts'));
  elements['sound-toggle'].title = t(soundEnabled ? 'Sound on · Pokémon item-received alert · click to mute' : 'Sound off · click to enable and preview');
  elements['sound-toggle'].querySelector('use').setAttribute('href', soundEnabled ? '#i-sound' : '#i-muted');
}

async function toggleTv() {
  unlockAudio();
  tvMode = !tvMode;
  document.body.classList.toggle('tv-mode', tvMode);
  $('tv-toolbar').hidden = !tvMode;
  if (tvMode) {
    $('toast').hidden = true;
    (pairingsVisible ? $('pairings-heading') : elements['time-display']).focus({ preventScroll: true });
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      try { await document.documentElement.requestFullscreen(); } catch { toast(t('TV layout is on. Use your browser’s fullscreen option if needed.')); }
    }
  } else {
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch { /* TV layout still exits. */ }
    }
    $('tv-toggle').focus({ preventScroll: true });
  }
}

function openSettings(section) {
  $('settings-status').hidden = true;
  $('round-number').value = state.round;
  $('round-minutes').value = state.durationMs / 60000;
  $('break-minutes').value = state.breakTimer ? state.breakTimer.durationMs / 60000 : 10;
  $('settings-dialog').showModal();
  if (section === 'break') {
    $('break-minutes').focus({ preventScroll: true });
    $('break-settings').scrollIntoView({ block: 'center' });
  } else $('settings-dialog').scrollTop = 0;
}

$('settings-open').addEventListener('click', () => openSettings());
function showTomView(view) {
  $('settings-dialog').close();
  if (tomView !== view) pairingsPage = 0;
  tomView = view;
  setPairingsVisible(true);
  if (!tvMode) void toggleTv();
}
function toggleTomView(view) {
  const hide = pairingsVisible && tomView === view;
  if (tomView !== view) pairingsPage = 0;
  tomView = view;
  setPairingsVisible(!hide);
}
$('tom-file').addEventListener('change', importTomFile);
$('pairings-show').addEventListener('click', () => showTomView('pairings'));
$('pairings-open').addEventListener('click', () => showTomView('pairings'));
$('standings-show').addEventListener('click', () => showTomView('standings'));
$('standings-open').addEventListener('click', () => showTomView('standings'));
$('pairings-back').addEventListener('click', () => setPairingsVisible(false));
$('tv-pairings').addEventListener('click', () => toggleTomView('pairings'));
$('tv-standings').addEventListener('click', () => toggleTomView('standings'));
$('pairings-clear').addEventListener('click', () => {
  importSequence += 1;
  pairings = null;
  persistPairings();
  renderPairings();
});
$('pairings-round').addEventListener('change', (event) => {
  if (!pairings) return;
  pairings.selectedKey = event.target.value;
  pairingsPage = 0;
  persistPairings();
  renderPairingsPage();
  restartPairingsRotation();
});
$('standings-group').addEventListener('change', (event) => {
  if (!pairings) return;
  pairings.selectedStandingsKey = event.target.value;
  pairingsPage = 0;
  persistPairings();
  renderPairingsPage();
  restartPairingsRotation();
});
function changePairingsPage(offset) {
  pairingsPage += offset;
  renderPairingsPage();
  restartPairingsRotation();
}
$('pairings-previous').addEventListener('click', () => changePairingsPage(-1));
$('pairings-next').addEventListener('click', () => changePairingsPage(1));
$('pairings-rotation').addEventListener('click', () => {
  pairingsRotating = !pairingsRotating;
  renderPairingsPage();
  restartPairingsRotation();
});
$('settings-close').addEventListener('click', () => $('settings-dialog').close());
$('break-open').addEventListener('click', () => openSettings('break'));
$('language').addEventListener('change', (event) => {
  preferences.language = event.target.value;
  savePreferences();
  applyPreferences();
});
$('volume').addEventListener('input', (event) => {
  preferences.volume = Number(event.target.value) / 100;
  $('volume-value').textContent = `${event.target.value}%`;
  if (masterVolume) masterVolume.gain.setValueAtTime(preferences.volume, audio.currentTime);
  savePreferences();
});
$('test-sound').addEventListener('click', () => {
  unlockAudio(true);
  void chime('overtime', { preview: true });
  toast(t(preferences.volume === 0 ? 'Volume is zero. Raise it to hear the preview.' : 'Preview only. Your alert mute setting is unchanged.'));
});
$('round-settings-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const round = Number($('round-number').value);
  const minutes = Number($('round-minutes').value);
  if (!Number.isInteger(round) || round < 1 || round > 999 || !Number.isInteger(minutes) || minutes < FORMATS[state.format].minutes || minutes > 180) return;
  if (state.started && minutes * 60000 !== state.durationMs) return toast(t('Reset the round before changing its length.'));
  const next = minutes * 60000 === state.durationMs ? { ...state, round } : { ...newTimer(state.format, round, minutes), extensions: state.extensions, breakTimer: state.breakTimer };
  update(next, t('Round settings saved.'));
  toast(t('Round settings saved.'));
});
$('break-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const minutes = Number($('break-minutes').value);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) return;
  const begin = () => {
    stopSounds();
    unlockAudio();
    update(beginBreak(state, minutes));
    $('settings-dialog').close();
  };
  if (state.started) askConfirmation('End this round and start a break?', 'This clears the current round and its table extensions, then prepares the next round. Confirm only after all matches are resolved.', 'Start break', begin);
  else if (state.breakTimer) askConfirmation('Restart this break?', t('The break countdown will start again from {minutes} minutes.', { minutes }), 'Start break', begin);
  else begin();
});
$('extension-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const next = setExtension(state, $('extension-table').value, Number($('extension-minutes').value));
  if (next === state) return toast(t(state.extensions.length >= 50 ? 'Limit reached: 50 table notes.' : 'Enter a table label and an extension from 1 to 60 minutes.'));
  update(next);
  $('extension-table').value = '';
  $('extension-table').focus();
  toast(t('Extension saved.'));
});
$('show-extensions').addEventListener('change', (event) => {
  preferences.showExtensions = event.target.checked;
  savePreferences();
  renderExtensions();
});
$('new-tournament').addEventListener('click', () => {
  askConfirmation('Start a new tournament?', 'This resets to round 1 and clears the timer, break, table extensions, and TOM import. Language, volume, and the selected match length are kept.', 'New tournament', () => {
    stopSounds();
    importSequence += 1;
    pairings = null;
    persistPairings();
    renderPairings();
    update(newTimer(state.format, 1, state.durationMs / 60000), t('New tournament ready. Round 1.'));
    $('settings-dialog').close();
  });
});

elements['start-pause'].addEventListener('click', startPause);
$('reset').addEventListener('click', resetRound);
$('next-round').addEventListener('click', nextRound);
document.querySelectorAll('[data-format]').forEach((button) => button.addEventListener('click', () => selectFormat(button.dataset.format)));
elements['confirm-dialog'].addEventListener('close', () => {
  const action = confirmAction;
  confirmAction = null;
  if (elements['confirm-dialog'].returnValue === 'confirm') action?.();
  if (previousFocus?.checkVisibility()) previousFocus.focus({ preventScroll: true });
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
  toast(t(soundEnabled ? 'Sound on. Pokémon item-received jingle at time called; a separate alert at the overtime limit.' : 'Sound off. Visual alerts remain on.'));
});

document.addEventListener('keydown', (event) => {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  if (document.querySelector('dialog[open]')) return;
  if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  const key = event.key.toLowerCase();
  if (key === 'f') { event.preventDefault(); void toggleTv(); }
  else if (key === 'p' && pairings?.data.rounds.length) { event.preventDefault(); toggleTomView('pairings'); }
  else if (key === 's' && pairings) { event.preventDefault(); toggleTomView('standings'); }
  else if (pairingsVisible && ['arrowleft', 'arrowright'].includes(key)) { event.preventDefault(); changePairingsPage(key === 'arrowright' ? 1 : -1); }
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
  } else if (event.key === PREFERENCES_KEY) {
    preferences = restorePreferences(event.newValue);
    applyPreferences();
  } else if (event.key === PAIRINGS_KEY) {
    importSequence += 1;
    pairings = restorePairings(event.newValue);
    pairingsPage = 0;
    renderPairings();
  }
});
// A click after a restored session unlocks browser audio and the screen wake lock.
document.addEventListener('pointerdown', () => { unlockAudio(); void syncWakeLock(); }, { once: true });
function renderLocalTime() {
  $('local-time').textContent = new Intl.DateTimeFormat(preferences.language === 'sk' ? 'sk-SK' : 'en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).toUpperCase();
}

applyPreferences();
setInterval(tick, 100);
setInterval(renderLocalTime, 10000);
