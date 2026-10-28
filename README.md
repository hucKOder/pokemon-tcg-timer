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

## Use it

Choose BO1 or BO3, then **Start round**. Click **TV mode** for a huge fullscreen display and cast/mirror the laptop to your TV. Click **Next round** to prepare the following round; it does not start automatically.

| Key | Action |
| --- | --- |
| Space / Enter | Start, pause or resume (when not focused on another control) |
| F | Toggle TV mode |
| Escape | Exit fullscreen / TV mode, or close a dialog |
| R | Reset (asks for confirmation during an active round) |

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
