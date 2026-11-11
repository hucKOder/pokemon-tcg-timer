# Learning guide card images

`learn-qr.svg` is a locally generated QR code for `https://huckoder.github.io/pokemon-tcg-timer/#learn`. The `#learn` link opens the presentation directly. Regenerate it with `qrencode -t SVG --svg-path -l M -m 4 -s 8 -o site/learn/learn-qr.svg 'https://huckoder.github.io/pokemon-tcg-timer/#learn'`. The SVG includes a white four-module quiet zone and does not contact an external QR provider.

The guide uses actual Pokémon TCG cards, hosted locally so an already-loaded presentation does not depend on a third-party card service.

Images refreshed on November 4, 2026. Pokémon and Trainer examples come from 2026 expansions; the Basic Energy uses the 2025 Mega Evolution design. The selected card's name, expansion, and year appear beside its explanation.

| Local file | Card / expansion | Year | Artwork source |
| --- | --- | --- | --- |
| `pikachu.png` | Pikachu, 30th Celebration, 023/128 | 2026 | [TCGdex](https://assets.tcgdex.net/en/me/30th/023/high.png) |
| `rowlet.png` | Rowlet, Perfect Order, 010/088 | 2026 | [TCGdex](https://assets.tcgdex.net/en/me/me03/010/high.png) |
| `dartrix.png` | Dartrix, Perfect Order, 011/088 | 2026 | [TCGdex](https://assets.tcgdex.net/en/me/me03/011/high.png) |
| `decidueye-ex.png` | Decidueye ex, Perfect Order, 012/088 | 2026 | [TCGdex](https://assets.tcgdex.net/en/me/me03/012/high.png) |
| `evolution-energy.png` | Basic Grass Energy, Mega Evolution Energy, 001 | 2025 | [Pokémon](https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEE/MEE_EN_1.png) |
| `water-energy.png` | Basic Water Energy, Mega Evolution Energy, 003 | 2025 | [Pokémon](https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEE/MEE_EN_3.png) |
| `charmander.png` | Charmander, Ascended Heroes, 020/217 | 2026 | [TCGdex](https://assets.tcgdex.net/en/me/me02.5/020/high.png) |
| `staryu.png` | Staryu, Perfect Order, 020/088 | 2026 | [TCGdex](https://assets.tcgdex.net/en/me/me03/020/high.png) |
| `energy.png` | Basic Lightning Energy, Mega Evolution Energy, 004 | 2025 | [Pokémon](https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEE/MEE_EN_4.png) |
| `item.png` | Switch, 30th Celebration, 127/128 | 2026 | [TCGdex](https://assets.tcgdex.net/en/me/30th/127/high.png) |
| `supporter.png` | Boss’s Orders, Ascended Heroes, 183/217 | 2026 | [TCGdex](https://assets.tcgdex.net/en/me/me02.5/183/high.png) |
| `stadium.png` | Prism Tower, Chaos Rising, 080/086 | 2026 | [TCGdex](https://assets.tcgdex.net/en/me/me04/080/high.png) |
| `special-energy.png` | Voltaic Lightning Energy, Pitch Black, 084/084 | 2026 | [TCGdex](https://assets.tcgdex.net/en/me/me05/084/high.png) |

Card data was checked against the artwork and the [TCGdex card API](https://api.tcgdex.net/v2/en/cards/30th-023). The Pikachu annotations describe this printing's 70 HP and Thunder Shock attack: 1 Lightning and 1 Colorless Energy, 20 damage, and a coin flip for Paralysis. Markers sit beside the printed fields to keep the card text visible.

The evolution demonstration uses the matching Rowlet → Dartrix → Decidueye ex line. It places each new card over the previous one, with one Grass Energy and 20 damage kept through both evolutions. HP changes from 80 to 100 to 320; the damage is not healed. Each step represents an eligible later turn. The final explanation includes Decidueye ex's two-Prize rule. Animation is initiated by the presenter, can be replayed, and becomes an immediate state change when reduced motion is requested.

The final practice battle reuses these cards for setup and seven alternating player turns, playing one action every five seconds. Both prepared hands are face up for teaching, with each card keeping its identity as it moves from hand to play and discard. Your first-turn Switch brings Rowlet Active. On your second turn, Boss’s Orders brings the opposing Rowlet Active; the opponent later plays Switch to return Staryu. Items and Supporters are shown large before their effects resolve and they enter the discard pile. The Supporter is played after the starting player's first turn, and each turn uses at most one normal Energy attachment. Attached cards and damage stay when Pokémon switch places.

Attack costs and effects were checked against the local card artwork: Staryu's Water Gun costs 1 Water and deals 20; Dartrix's Leafage costs 1 Grass and deals 20; Decidueye ex's Crushing Arrow costs 1 Grass plus 3 Colorless, deals 240, and discards an Energy from the opposing Active Pokémon. These matchups do not apply Weakness or Resistance. The opponent has 5 cards in hand when Decidueye ex could attack, so Sniper's Eye does not reduce the cost. Actual Grass and Water Energy cards fan behind the Pokémon, and a numeric damage counter sits on the Pokémon card. Pause and restart controls are available; reduced motion retains automatic progression without card movement. Prepared hands and draws make this a repeatable teaching example rather than a playable rules engine.

Card artwork and card designs © Pokémon / Nintendo / Creatures Inc. / GAME FREAK inc. The guide is independent and unofficial. The small face-down card design is an original CSS illustration, not an official Pokémon card back.

Content reference: [official Pokémon TCG rulebook](https://assets.pokemon.com/assets/cms2/pdf/trading-card-game/rulebook/svi_rulebook_en.pdf), especially card types, zones, setup, turn order, and victory conditions. This is a beginner overview; card text can override general rules. Cards illustrate the rules and are not a deck recommendation or a claim about current tournament legality.
