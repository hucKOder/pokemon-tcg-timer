// TOM is parsed entirely in the browser. Never persist the source XML or player IDs.
import { calculateSwissStats, restoreSwissStats } from './standings.js?v=1';

export const MAX_TOM_BYTES = 5 * 1024 * 1024;
export const PAIRINGS_PER_PAGE = 6;
export const ROTATION_MS = 12000;

const children = (node, tag) => [...(node?.children || [])].filter((child) => child.tagName === tag);
const child = (node, tag) => children(node, tag)[0];
const text = (node, tag) => child(node, tag)?.textContent.trim() || '';
const validText = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

export function parseTom(source) {
  const invalid = () => { throw new Error('Invalid TOM file. Choose a saved Pokémon TCG .tdf file.'); };
  if (typeof source !== 'string' || source.length > MAX_TOM_BYTES || /<!DOCTYPE|<!ENTITY/i.test(source)) invalid();
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  const root = doc.documentElement;
  if (doc.querySelector('parsererror') || root.tagName !== 'tournament') invalid();
  if (root.getAttribute('gametype') && root.getAttribute('gametype') !== 'TRADING_CARD_GAME') invalid();
  const name = text(child(root, 'data'), 'name');
  if (!validText(name, 300)) invalid();

  const players = new Map();
  for (const player of children(child(root, 'players'), 'player')) {
    const id = player.getAttribute('userid');
    const displayName = [text(player, 'firstname'), text(player, 'lastname')].filter(Boolean).join(' ');
    if (!id || players.has(id) || !validText(displayName, 160) || players.size >= 10000) invalid();
    players.set(id, displayName);
  }
  const resolvePlayerId = (slot) => {
    const id = slot?.getAttribute('userid')?.trim();
    if (players.has(id)) return id;
    // Empty slots and TOM's placeholder IDs represent an unopposed player.
    if (!id || ['0', '-1', 'bye'].includes(id.toLowerCase())) return null;
    throw new Error('A pairing references an unknown player. Save again in TOM and re-import.');
  };
  const resolvePlayer = (slot) => players.get(resolvePlayerId(slot)) ?? null;

  const rounds = [];
  children(child(root, 'pods'), 'pod').forEach((pod, podIndex) => {
    const division = pod.getAttribute('category') || '?';
    if (!validText(division, 20)) invalid();
    children(child(pod, 'rounds'), 'round').forEach((round, roundIndex) => {
      const number = Number(round.getAttribute('number'));
      const matches = children(child(round, 'matches'), 'match').map((match) => {
        const first = resolvePlayer(child(match, 'player1'));
        const second = resolvePlayer(child(match, 'player2'));
        const table = text(match, 'tablenumber');
        if ((!first && !second) || (first && second && !validText(table, 20)) || table.length > 20) invalid();
        return { table: table || '—', player1: first || second, player2: first ? second : null };
      });
      if (!matches.length) return; // TOM can include an unpaired, future round.
      if (!Number.isInteger(number) || number < 1 || number > 999 || matches.length > 10000 || rounds.length >= 1000) invalid();
      matches.sort((a, b) => a.table.localeCompare(b.table, 'en', { numeric: true }));
      rounds.push({ key: `${podIndex}:${roundIndex}`, number, division, matches });
    });
  });
  const standingPods = children(child(root, 'standings'), 'pod');
  const dropped = new Set(standingPods.filter((pod) => pod.getAttribute('type') === 'dnf').flatMap((pod) => children(pod, 'player').map((entry) => entry.getAttribute('id')?.trim())));
  const statistics = calculateSwissStats(children(child(root, 'pods'), 'pod').map((pod) => ({
    rounds: children(child(pod, 'rounds'), 'round').map((round) => ({
      type: round.getAttribute('type'),
      matches: children(child(round, 'matches'), 'match').map((match) => ({
        first: resolvePlayerId(child(match, 'player1')), second: resolvePlayerId(child(match, 'player2')), outcome: match.getAttribute('outcome'),
      })),
    })),
  })), dropped);
  const standings = [];
  standingPods.forEach((pod, podIndex) => {
    const division = pod.getAttribute('category') || '?';
    const type = pod.getAttribute('type') || 'unknown';
    if (!validText(division, 20) || !validText(type, 40)) invalid();
    const seen = new Set();
    const entries = children(pod, 'player').map((entry) => {
      const id = entry.getAttribute('id')?.trim();
      if (!players.has(id)) throw new Error('Standings reference an unknown player. Save again in TOM and re-import.');
      if (seen.has(id)) invalid();
      seen.add(id);
      const rawPlace = entry.getAttribute('place')?.trim();
      const place = !rawPlace || rawPlace === '0' ? null : Number(rawPlace);
      if (place !== null && (!Number.isInteger(place) || place < 1 || place > 10000)) invalid();
      return { place, player: players.get(id), stats: statistics.get(id) ?? null };
    });
    if (!entries.length) return;
    if (entries.length > 10000 || standings.length >= 1000) invalid();
    // Preserve TOM's ranks and its order within ties; derived stats never reorder them.
    entries.sort((a, b) => (a.place ?? Infinity) - (b.place ?? Infinity));
    standings.push({ key: `standings:${podIndex}`, division, type, entries });
  });
  if (!rounds.length && !standings.length) throw new Error('No pairings or standings found. Save the tournament in TOM, then import again.');
  return { name, rounds, standings };
}

// Whitelist the display-only fields, including when restoring data from another tab.
export function restorePairings(raw) {
  try {
    if (typeof raw !== 'string' || raw.length > MAX_TOM_BYTES) return null;
    const saved = JSON.parse(raw);
    if (!validText(saved.data.name, 300) || !Array.isArray(saved.data.rounds) || saved.data.rounds.length > 1000) return null;
    const keys = new Set();
    const rounds = saved.data.rounds.map((round) => {
      if (!validText(round.key, 40) || keys.has(round.key) || !Number.isInteger(round.number) || round.number < 1 || round.number > 999 || !validText(round.division, 20) || !Array.isArray(round.matches) || !round.matches.length || round.matches.length > 10000) throw new Error();
      keys.add(round.key);
      const matches = round.matches.map((match) => {
        if (!validText(match.table, 20) || !validText(match.player1, 160) || (match.player2 !== null && !validText(match.player2, 160))) throw new Error();
        return { table: match.table, player1: match.player1, player2: match.player2 };
      });
      return { key: round.key, number: round.number, division: round.division, matches };
    });
    // Older pairing-only snapshots remain usable until the next TOM import.
    const rawStandings = saved.data.standings ?? [];
    if (!Array.isArray(rawStandings) || rawStandings.length > 1000) return null;
    const standingKeys = new Set();
    const standings = rawStandings.map((group) => {
      if (!validText(group.key, 40) || standingKeys.has(group.key) || !validText(group.division, 20) || !validText(group.type, 40) || !Array.isArray(group.entries) || !group.entries.length || group.entries.length > 10000) throw new Error();
      standingKeys.add(group.key);
      const entries = group.entries.map((entry) => {
        if (!validText(entry.player, 160) || (entry.place !== null && (!Number.isInteger(entry.place) || entry.place < 1 || entry.place > 10000))) throw new Error();
        return { place: entry.place, player: entry.player, stats: restoreSwissStats(entry.stats) };
      });
      return { key: group.key, division: group.division, type: group.type, entries };
    });
    if (!rounds.length && !standings.length) return null;
    return {
      data: { name: saved.data.name, rounds, standings },
      selectedKey: keys.has(saved.selectedKey) ? saved.selectedKey : rounds.at(-1)?.key ?? null,
      selectedStandingsKey: standingKeys.has(saved.selectedStandingsKey) ? saved.selectedStandingsKey : standings[0]?.key ?? null,
      importedAt: Number.isFinite(saved.importedAt) && saved.importedAt > 0 && saved.importedAt <= 8640000000000000 ? saved.importedAt : null,
    };
  } catch { return null; }
}

export function pairingPage(matches, page = 0) {
  const count = Math.max(1, Math.ceil(matches.length / PAIRINGS_PER_PAGE));
  const index = ((Math.trunc(page) || 0) % count + count) % count;
  return { index, count, matches: matches.slice(index * PAIRINGS_PER_PAGE, (index + 1) * PAIRINGS_PER_PAGE) };
}
