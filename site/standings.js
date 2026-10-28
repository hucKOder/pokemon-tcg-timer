// Display-only reconstruction, not an official TOM calculation. IDs are transient
// keys during import and must never be persisted with these summaries.
// https://rk9.gg/article/20210525-all-about-tiebreakers-in-the-pokemon-tcg
// General Tournament Rules Handbook §5.3: 25% floor, 75% cap for drops.
const COMPLETED = new Set(['1', '2', '3', '10']);
const average = (values) => values.length && values.every((value) => value !== null)
  ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export function calculateSwissStats(pods, dropped = new Set()) {
  const records = new Map();
  const scopeRounds = new Map();
  const get = (id, scope) => {
    if (!records.has(id)) records.set(id, { wins: 0, losses: 0, ties: 0, byes: 0, pending: 0, opponents: [], scopes: new Set(), unsupported: false });
    const record = records.get(id);
    record.scopes.add(scope);
    return record;
  };
  pods.forEach((pod, scope) => {
    let completedRounds = 0;
    let complete = true;
    for (const round of pod.rounds) {
      if (round.type !== '2') continue; // TOM Swiss; never mix in top-cut results.
      if (round.matches.some((match) => COMPLETED.has(match.outcome))) completedRounds += 1;
      if (round.matches.some((match) => !COMPLETED.has(match.outcome))) complete = false;
      const seen = new Set();
      for (const match of round.matches) {
        const { first, second, outcome } = match;
        const ids = [first, second].filter((id) => id !== null);
        for (const id of ids) {
          const record = get(id, scope);
          if (seen.has(id)) record.unsupported = true;
          seen.add(id);
        }
        if (outcome === '0') {
          for (const id of ids) get(id, scope).pending += 1;
          continue;
        }
        if (!COMPLETED.has(outcome)) {
          for (const id of ids) get(id, scope).unsupported = true;
          continue;
        }
        if (ids.length === 1) {
          const winner = outcome === '1' ? first : outcome === '2' ? second : null;
          const record = get(ids[0], scope);
          if (winner !== ids[0]) record.unsupported = true;
          else { record.wins += 1; record.byes += 1; }
          continue;
        }
        if (ids.length !== 2 || first === second) continue;
        const a = get(first, scope), b = get(second, scope);
        a.opponents.push(second);
        b.opponents.push(first);
        if (outcome === '1') { a.wins += 1; b.losses += 1; }
        else if (outcome === '2') { a.losses += 1; b.wins += 1; }
        else if (outcome === '3') { a.ties += 1; b.ties += 1; }
        else { a.losses += 1; b.losses += 1; } // Double loss is not a draw.
      }
    }
    scopeRounds.set(scope, { count: completedRounds, complete });
  });

  const winRates = new Map();
  for (const [id, record] of records) {
    const played = record.wins - record.byes + record.losses + record.ties;
    // In an unfinished snapshot, use recorded games only. Pending matches must
    // not lower a player's rate as though they had already lost.
    const partial = [...record.scopes].some((scope) => !scopeRounds.get(scope).complete);
    const rounds = dropped.has(id) || partial ? played : [...record.scopes].reduce((total, scope) => total + scopeRounds.get(scope).count, 0) - record.byes;
    const rate = record.unsupported || rounds <= 0 ? null : Math.min(dropped.has(id) ? 0.75 : 1, Math.max(0.25, (record.wins - record.byes + record.ties / 2) / rounds));
    winRates.set(id, rate);
  }
  const opponentRates = new Map();
  for (const [id, record] of records) {
    opponentRates.set(id, record.unsupported ? null : average(record.opponents.map((opponent) => winRates.get(opponent) ?? null)));
  }
  return new Map([...records].map(([id, record]) => [id, record.unsupported ? null : {
    wins: record.wins, losses: record.losses, ties: record.ties,
    points: record.wins * 3 + record.ties, byes: record.byes, pending: record.pending,
    opWin: opponentRates.get(id),
    opOpWin: average(record.opponents.map((opponent) => opponentRates.get(opponent) ?? null)),
  }]));
}

export function restoreSwissStats(value) {
  if (value === null || value === undefined) return null;
  const count = (number) => Number.isInteger(number) && number >= 0 && number <= 1000;
  const rate = (number) => number === null || (Number.isFinite(number) && number >= 0 && number <= 1);
  if (!['wins', 'losses', 'ties', 'byes', 'pending'].every((key) => count(value[key])) || value.byes > value.wins || value.points !== value.wins * 3 + value.ties || !rate(value.opWin) || !rate(value.opOpWin)) throw new Error('Invalid saved Swiss statistics');
  return { wins: value.wins, losses: value.losses, ties: value.ties, points: value.points, byes: value.byes, pending: value.pending, opWin: value.opWin, opOpWin: value.opOpWin };
}
