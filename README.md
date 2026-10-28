# Kraken Cards · Pokémon TCG round timer

A simple, big-screen round timer for local Pokémon TCG tournaments. Static HTML, CSS and JavaScript, with no runtime dependencies, accounts, analytics or remote services.

**[Open the timer →](https://huckoder.github.io/pokemon-tcg-timer/)**

- **BO1:** 30 minutes. **BO3:** 50 minutes for the whole match.
- Automatically enters **15-minute overtime**, with a reminder to finish the current turn and play **3 additional turns**. Each table tracks its own turns; the shared timer is a maximum, not permission to play beyond +3 turns.
- TV mode, fullscreen, optional audible alerts, pause/resume, round counter and a screen wake lock where supported.
- The classic Pokémon Red/Blue/Yellow **item-received jingle** plays at time called. A distinct descending chime marks the overtime limit. Toggle sound off and on to preview the jingle; muting also stops any currently playing alert.
- Refresh-safe countdown based on actual deadlines, not accumulated ticks. State is saved locally and synchronized between same-origin browser tabs.
- Self-hosted fonts; no third-party requests during use. Once loaded, the timer continues without a network connection. An initial load/reload requires access to the hosted site or the local server.
- Kraken Cards branding: the store's official logo, blue/navy and gold palette, light controls, and a high-contrast dark TV display with the logo always visible. Store links open separately so they do not interrupt the timer.
- Judge controls: break countdown, sound test and volume, custom round lengths, round-number corrections, a new-tournament reset, table-extension notes, and English / Slovak UI.

## Use it

Choose BO1 or BO3, then **Start round**. Click **TV mode** for a huge fullscreen display and cast/mirror the laptop to your TV. Click **Next round** to prepare the following round; it does not start automatically.

### Judge controls

Open the **sliders icon** in the top right (accessible name **Judge controls**, or **Panel rozhodcu** in Slovak).

- **Sound & language:** switch between English and Slovak, adjust volume from 0–100%, and use **Test sound**. Testing plays a preview even if alerts are muted, without changing the saved mute preference. The app cannot override the laptop/TV's own mute or volume.
- **Round setup:** edit the round number at any time without changing the deadline. Before starting, choose a custom duration: BO1 minimum 30 minutes, BO3 minimum 50, maximum 180. Reset the round before changing an active round's length. Custom durations carry into subsequent rounds; clicking a format button restores that format's default.
- **Break mode:** use the footer shortcut or judge controls to start a separate 1–120-minute countdown. Starting a break after a round has begun asks for confirmation, clears that round's extension notes, and prepares the next round. Starting a break on a ready round keeps that round number. Breaks support pause/resume and refresh recovery. At zero they stop: use **Back to round**, then start the match only on the judge's announcement. Nothing starts automatically.
- **Table extensions:** record a table label and its **total** judge-granted extension (1–60 minutes). Adding the same table updates its total rather than adding more minutes. Notes can be shown or hidden on the timer/TV; the display shows up to four notes plus a count of additional entries. The judge controls list contains all notes. These are notes only—not per-table countdowns, turn tracking, or match-resolution logic. They never change the shared deadline. New rounds, round resets, format resets, and new tournaments clear the old notes.
- **New tournament:** confirmation resets to round 1 and clears the round, break, and extension notes. The selected format/custom duration, language, volume, and mute preferences are kept.

All timer state and preferences persist locally and synchronize between same-origin tabs/windows. For an operator screen on the laptop and an uncluttered timer on the TV, extend the desktop instead of mirroring, open the timer in two windows, and put only the TV window into TV mode. Refresh all windows after a site update. Synchronization does not extend to another device or browser profile.

### TOM pairings and standings on the TV

1. Generate pairings in TOM and **save the tournament**.
2. Open **Judge controls → TOM pairings & standings → Import TOM file (.tdf)** and choose that saved file.
3. Select the round / division (defaults to the last available round in the file), then click **Show pairings** for the fullscreen TV view.
4. Six tables are shown per page. Larger rounds rotate every 12 seconds; use the arrows or pause rotation as needed. **P** switches between pairings and timer; **← / →** change pages. Starting/resuming the timer in that window returns to the clock.
5. **Save and re-import each round**, including after any pairing correction. The browser cannot watch TOM automatically. You can choose the same file again.

For standings, choose **Standings division / group → Show standings**. Columns are **Rank, Player, W–L–T, Points, Op Win %, Op Op Win %**. Rank and name come from TOM; ties keep TOM's order and unranked players show **—**. The other columns are **calculated Swiss estimates from the saved match results**, not percentages exported by TOM. Calculations never reorder TOM's ranks. Dropped/unfinished players are a separate group when present. **S** switches standings/timer, **P** switches pairings/timer, and the TV toolbar lets you move directly between views. Standings use the same six-row pages and optional 12-second rotation.

**TOM may only export rankings when the event ends**, and may omit them for combined age divisions. If no rankings are saved, the view explains this instead of inventing ranking order. The selected pairing round does **not** change the saved standings into historical round-by-round standings: statistics use all saved Swiss results. **Re-import the .tdf after updating the app** to populate the new columns; old rank-only imports show **—**. Files containing standings but no paired rounds are supported, with unavailable statistics shown as **—**.

Calculation details ([RK9's TCG explanation](https://rk9.gg/article/20210525-all-about-tiebreakers-in-the-pokemon-tcg), [General Tournament Rules Handbook §5.3](https://www.pokemon.com/static-assets/content-assets/cms2/pdf/play-pokemon/rules/play-pokemon-tournament-rules-handbook-en.pdf)):

- Only TOM Swiss rounds (`type="2"`) are used, never top-cut matches. Supported outcomes: player 1 win (`1`), player 2 win (`2`), draw (`3`), double loss (`10`), pending (`0`). Unknown/missing result codes make that player's statistics unavailable rather than being guessed; unavailable opponent data propagates to the relevant percentages.
- Points are 3 per win and 1 per tie. Completed random byes count as wins/points, but are excluded from resistance wins, rounds played, and opponent lists. Bye and pending counts appear beneath the record when applicable.
- Resistance win rates use wins plus half a tie, with a 25% floor and a 75% ceiling for players in TOM's `dnf` groups (100% otherwise). Completed Swiss scopes use the scope's round count minus byes; dropped players use rounds actually played. Partially reported scopes use recorded games only so pending matches are not treated as losses.
- Op Win % averages opponents' resistance win rates. Op Op Win % averages opponents' Op Win %. A player with no eligible opponents shows **—**, not 0%. Arithmetic uses full precision, with percentages rounded to two decimals only for display.

**Verify official figures in TOM.** Reconstruction can differ due to rounding, late-entry/penalty handling, incomplete result/drop information, or future TOM formats/rule changes. The TV explicitly labels the statistics as calculated. This is not a replacement for TOM's standings or tiebreaker decisions.

Importing or selecting a pairing round **never changes the timer's round, duration, or running state**. If the displayed pairing round differs from the timer round, a warning appears. Review the selection before displaying it, especially when opening a completed tournament.

This is a **local-only display**, not online pairings for players' phones. The XML is parsed in your browser; nothing is uploaded or committed to GitHub. Only tournament title, division/round, table numbers, display names, saved ranks/standings groups, calculated statistical summaries, and import time are saved in this browser's local storage, and synchronized to other windows on the same origin/profile. Player IDs, birth dates, organizer details, individual match results, and the source file are not retained. Use **Clear TOM import** (or confirm **New tournament**) to erase both saved pairings and standings. Browser storage restrictions may prevent persistence/synchronization, but importing still works in the current tab.

For an extended TV desktop, import/select on the laptop window, then press **P** for pairings or **S** for standings in the TV window. Re-imports and selections update both windows; which view is displayed and page rotation are per-window. No network is needed for re-imports once the site is loaded. The importer supports TOM's XML `.tdf` layout (checked against TOM 1.86), including separate division pods and unopposed players; unfamiliar/malformed files are rejected rather than replacing a valid import. It does not generate pairings, assign rankings, or change match results. Maximum file size: 5 MB.

| Key | Action |
| --- | --- |
| Space / Enter | Start, pause or resume (when not focused on another control) |
| F | Toggle TV mode |
| Escape | Exit fullscreen / TV mode, or close a dialog |
| R | Reset (asks for confirmation during an active round) |
| P | Switch timer / imported pairings |
| S | Switch timer / imported standings |
| ← / → | Previous / next page while viewing pairings or standings |

Alerts sound at time called and the overtime limit, provided browser audio is unlocked by user interaction. Keep the laptop awake, avoid closing its lid, and check your TV's audio routing before an event. The site requests a screen wake lock, but the browser/OS can refuse it. Reloading a running timer restores the correct time; click the page after a reload to re-enable audio and wake lock.

The round-end audio is loaded from this site and decoded after interaction, so it needs no third-party connection during the round. If loading or decoding fails, the original generated chime is used as a fallback. Sound asset attribution is in `site/sounds/README.md`.

### Rules

Presets follow the September 1, 2026 Play! Pokémon handbooks:

- [General Tournament Rules Handbook, §5.5.7](https://www.pokemon.com/static-assets/content-assets/cms2/pdf/play-pokemon/rules/play-pokemon-tournament-rules-handbook-en.pdf): minimum 30-minute single-game / 50-minute BO3 Championship Series rounds.
- [TCG Tournament Handbook, §7.4.3](https://www.pokemon.com/static-assets/content-assets/cms2/pdf/play-pokemon/rules/play-pokemon-tcg-tournament-handbook-en.pdf): +3 turns, maximum 15-minute overtime beginning when time is called. If time is called during Pokémon Checkup, the next turn is the first additional turn.
- [Official February 13, 2026 end-of-round update](https://www.pokemon.com/us/news/an-update-to-end-of-round-procedures-at-pokemon-tcg-championship-events).

The Head Judge is responsible for announcements, individual time extensions, match resolution, and Swiss / single-elimination tiebreakers. This shared display does not manage individual table extensions or results. Rules may change; check the linked official handbook before an event. This is an independent, unofficial tool, not affiliated with The Pokémon Company.

## Development

Requires Node.js 24+.

```sh
npm install
npm run dev
```

Open `http://localhost:4173`. The `site/` folder can also be served by any static web server.

```sh
npm test
npm run test:e2e
```

Browser tests use `/usr/bin/chromium` when available. Otherwise install Playwright Chromium with `npx playwright install chromium`.

## Deployment

The GitHub Actions workflow tests the timer model, then publishes `site/` to GitHub Pages on every push to `main`. Select **GitHub Actions** under the repository's **Settings → Pages → Source**.

Fonts: Barlow Condensed by Jeremy Tribby and DM Sans by its contributors, both under the SIL Open Font License. License texts are in `site/fonts/`.

The Kraken Cards logo belongs to the store and is included at the store owner's request. Asset source and optimization details are in `site/brand/README.md`.
