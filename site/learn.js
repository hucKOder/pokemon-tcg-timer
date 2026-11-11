import { SIMULATION_CARDS, SIMULATION_PHASES, SIMULATION_STEPS, SIMULATION_STEP_MS, getSimulationState } from './learn-simulation.js?v=3';

const ASSETS = './learn/';
const RULEBOOK = 'https://assets.pokemon.com/assets/cms2/pdf/trading-card-game/rulebook/svi_rulebook_en.pdf';
const CARD_EDITIONS = {
  'pikachu.png': 'Pikachu · 30th Celebration · 2026',
  'energy.png': 'Basic Lightning Energy · Mega Evolution Energy · 2025',
  'special-energy.png': 'Voltaic Lightning Energy · Pitch Black · 2026',
  'item.png': 'Switch · 30th Celebration · 2026',
  'supporter.png': 'Boss’s Orders · Ascended Heroes · 2026',
  'stadium.png': 'Prism Tower · Chaos Rising · 2026',
};

// This presentation has its own, per-window state. It never writes timer state.
export function createLearnPresentation({ getLanguage, onLanguageChange, onOpen, onClose = () => {}, onVisibilityChange, onFullscreen, onShare }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'learn-dialog';
  dialog.className = 'learn-dialog';
  dialog.setAttribute('aria-labelledby', 'learn-title');
  document.body.append(dialog);
  let slide = 0;
  let zone = 'active';
  let part = 0;
  let cardType = 0;
  let turn = 0;
  let energyAttached = false;
  let evolutionStep = 0;
  let simulationStep = 0;
  let simulationPlaying = true;
  let simulationTimer;
  let simulationDue = 0;
  let simulationRemaining = SIMULATION_STEP_MS;
  const simulationAnimations = new Set();
  let opener;
  let touchStart;
  const l = (en, sk) => getLanguage() === 'sk' ? sk : en;
  const names = () => [l('The board', 'Herná plocha'), l('Read a card', 'Čítanie karty'), l('Card types', 'Druhy kariet'), l('Evolution', 'Vývoj'), l('Set up', 'Príprava'), l('Your turn', 'Tvoj ťah'), l('Win the game', 'Ako vyhrať'), l('Practice battle', 'Ukážkový súboj')];
  const slides = () => [
    { title: l('The playing area', 'Spoznaj hernú plochu'), description: l('Each player has their own side of the board. Select an area to see where your cards go and how you use them.', 'Každý hráč má svoju stranu hernej plochy. Klikni na niektorú oblasť a zisti, ktoré karty do nej patria a ako ich používaš.'), hint: l('Explore the board', 'Preskúmaj hernú plochu') },
    { title: l('How to read a card', 'Ako čítať kartu'), description: l('A Pokémon card shows its HP, attacks, and the Energy it needs. Select a number on Pikachu’s card to learn what it means.', 'Na karte Pokémona nájdeš jeho HP, útoky a potrebné Energie. Klikni na číslo na Pikachuovej karte a dozvieš sa viac.'), hint: l('Get to know Pikachu', 'Spoznaj Pikachu') },
    { title: l('The cards in your deck', 'Karty v tvojom balíčku'), description: l('Select a card to explore Pokémon, the two kinds of Energy, and three Trainer card types.', 'Vyber si kartu a spoznaj Pokémonov, oba druhy Energií a tri druhy Trénerských kariet.'), hint: l('Choose a card to explore', 'Vyber kartu a zisti viac') },
    { title: l('How evolution works', 'Ako funguje vývoj'), description: l('Follow Rowlet → Dartrix → Decidueye ex. Each evolution happens on a later turn.', 'Rowlet → Dartrix → Decidueye ex. Každý vývoj príde v ďalšom ťahu.'), hint: l('Try evolving a Pokémon', 'Skús vyvinúť Pokémona') },
    { title: l('Before you start', 'Príprava na hru'), description: l('Each player needs a 60-card deck. Prepare your side of the board in these four steps.', 'Každý hráč potrebuje balíček 60 kariet. Svoju stranu si pripravíš v štyroch krokoch.'), hint: l('An example starting board', 'Príklad pripravenej hernej plochy') },
    { title: l('Your turn', 'Tvoj ťah'), description: l('Draw a card, prepare your Pokémon, then attack if you can. If you don’t want to attack, you can end your turn.', 'Potiahni kartu, priprav svojich Pokémonov a ak môžeš, zaútoč. Ak nechceš útočiť, môžeš svoj ťah ukončiť.'), hint: l('Walk through a turn', 'Prejdi si jeden ťah') },
    { title: l('How to win', 'Ako vyhrať'), description: l('You win as soon as one of these three things happens.', 'Vyhráš, keď nastane jedna z týchto troch situácií.'), hint: l('You’re ready to play', 'Môžeš začať hrať') },
    { title: l('A few turns together', 'Niekoľko spoločných ťahov'), description: l('From setup to your first Prize. The battle plays automatically.', 'Od prípravy po prvú odmenu. Súboj sa prehráva automaticky.'), hint: l('Watch a practice battle', 'Sleduj ukážkový súboj') },
  ];
  const zones = () => ({
    active: [l('Active Spot', 'Aktívny Pokémon'), l('This is the Pokémon you battle with. It usually attacks your opponent’s Active Pokémon. Keep one Pokémon here while you have Pokémon in play.', 'S týmto Pokémonom bojuješ. Zvyčajne útočí na súperovho aktívneho Pokémona. Kým máš Pokémonov v hre, musí tu byť práve jeden.')],
    bench: [l('Bench', 'Lavička'), l('Room for up to 5 Pokémon. Get your next attacker ready here. If your Active Pokémon is Knocked Out, replace it with one from your Bench.', 'Na lavičke môžeš mať až 5 Pokémonov. Tu si pripravíš ďalšieho útočníka. Keď je tvoj aktívny Pokémon vyradený, nahraď ho jedným z lavičky.')],
    prizes: [l('Prize cards', 'Karty odmien'), l('Start with 6 cards from your deck here, face down. When you Knock Out an opposing Pokémon, take a Prize into your hand. Take your last Prize to win.', 'Na začiatku sem odlož 6 kariet z balíčka lícom nadol. Za vyradenie súperovho Pokémona si vezmi odmenu do ruky. Keď vezmeš poslednú, vyhrávaš.')],
    deck: [l('Deck', 'Balíček'), l('Your deck starts with 60 cards. Keep it face down and draw the top card at the start of each turn.', 'Tvoj balíček má na začiatku 60 kariet. Nechaj ho lícom nadol a na začiatku každého ťahu si potiahni vrchnú kartu.')],
    discard: [l('Discard pile', 'Odhadzovací balíček'), l('Put used Items, Knocked Out Pokémon, and other discarded cards here, face up. Both players can look through either discard pile.', 'Sem odkladaj použité Predmety, vyradených Pokémonov a ďalšie odhodené karty lícom nahor. Obaja hráči si môžu oba odhadzovacie balíčky prezrieť.')],
  });
  const parts = () => [
    [l('Name & Evolution Stage', 'Meno a vývojové štádium'), l('This is Pikachu, a Basic Pokémon. Basic Pokémon can go straight into play; Stage 1 and Stage 2 Pokémon evolve from the Pokémon named on their card.', 'Toto je Pikachu, základný Pokémon. Základných Pokémonov môžeš položiť priamo do hry. Pokémoni 1. a 2. štádia sa vyvíjajú z Pokémona uvedeného na karte.'), 35, 0],
    [l('HP & type', 'HP a typ'), l('Pikachu has 70 HP and is a Lightning type. If the damage on a Pokémon reaches or exceeds its HP, that Pokémon is Knocked Out.', 'Pikachu má 70 HP a je elektrického typu. Ak poškodenie Pokémona dosiahne alebo prekročí jeho HP, Pokémon je vyradený.'), 83, 0],
    [l('Attack cost', 'Cena útoku'), l('Thunder Shock needs 1 Lightning Energy and 1 Energy of any type. The Colorless star means any type. Attached Energy usually stays after attacking.', 'Thunder Shock potrebuje 1 elektrickú Energiu a 1 Energiu ľubovoľného typu. Bezfarebná hviezda znamená ľubovoľný typ. Pripojené Energie po útoku zvyčajne zostávajú.'), 0, 64],
    [l('Attacks & damage', 'Útoky a poškodenie'), l('Thunder Shock does 20 damage before Weakness, Resistance, and other effects. A heads on its coin flip also Paralyzes the opponent’s Active Pokémon.', 'Thunder Shock spôsobí 20 poškodenia pred započítaním slabosti, odolnosti a ďalších efektov. Ak pri hode mincou padne hlava, súperov aktívny Pokémon je aj paralyzovaný.'), 100, 64],
    [l('Weakness & Resistance', 'Slabosť a odolnosť'), l('Pikachu takes double attack damage from Fighting Pokémon because of its ×2 Weakness. Resistance, when printed, reduces attack damage from the shown type.', 'Pikachu dostáva dvojnásobné poškodenie od bojových Pokémonov vďaka slabosti ×2. Uvedená odolnosť znižuje poškodenie od zobrazeného typu.'), 0, 88],
    [l('Retreat Cost', 'Cena ústupu'), l('Once per turn, you may retreat to a Benched Pokémon by discarding attached Energy equal to this cost. Pikachu’s one star costs 1 Energy of any type.', 'Raz za ťah môžeš ustúpiť na lavičku odhodením pripojených Energií podľa tejto ceny. Pikachuova jedna hviezda stojí 1 Energiu ľubovoľného typu.'), 100, 88],
  ];
  const types = () => [
    [l('Pokémon', 'Pokémon'), 'pikachu.png', l('Your battle partners', 'Tvoji partneri v boji'), l('Play Basic Pokémon onto your Bench, then evolve them into stronger Pokémon. Normally, you can’t evolve on either player’s first turn or on the turn a Pokémon enters play.', 'Polož základných Pokémonov na lavičku a neskôr ich vyviň na silnejších. Bežne nemôžeš vyvíjať v prvom ťahu ani v ťahu, v ktorom Pokémon prišiel do hry.'), l('Pokémon', 'Pokémon')],
    [l('Basic Energy', 'Základná Energia'), 'energy.png', l('Power up your attacks', 'Priprav si útoky'), l('Normally, attach just 1 Energy from your hand per turn: Basic or Special. This Basic Lightning Energy provides 1 Lightning Energy to pay attack costs.', 'Bežne pripojíš len 1 Energiu z ruky za ťah: základnú alebo špeciálnu. Táto základná elektrická Energia poskytuje 1 elektrickú Energiu na zaplatenie ceny útoku.'), l('Energy', 'Energia')],
    [l('Special Energy', 'Špeciálna Energia'), 'special-energy.png', l('Energy with an extra effect', 'Energia s ďalším účinkom'), l('Special Energy uses your normal Energy attachment. Voltaic Lightning Energy provides 1 Lightning Energy. Attached to a Lightning Pokémon, it also adds 20 damage to that Pokémon’s attacks against the opponent’s Active Pokémon.', 'Špeciálna Energia sa počíta do bežného pripojenia Energie za ťah. Voltaic Lightning Energy poskytuje 1 elektrickú Energiu. Elektrickému Pokémonovi navyše pridá 20 poškodenia k útokom na súperovho aktívneho Pokémona.'), l('Energy', 'Energia')],
    [l('Item', 'Predmet'), 'item.png', l('Useful help throughout your turn', 'Pomoc počas tvojho ťahu'), l('Items are Trainer cards. Play as many as you like on your turn, following each card’s text, then discard them. Switch swaps your Active Pokémon with 1 of your Benched Pokémon.', 'Predmety sú Trénerské karty. Počas ťahu ich môžeš zahrať viac. Vykonaj text karty a potom ju odhoď. Switch vymení tvojho aktívneho Pokémona za jedného z lavičky.'), l('Trainer · Item', 'Trénerská karta · Predmet')],
    [l('Supporter', 'Podporovateľ'), 'supporter.png', l('One Supporter per turn', 'Jeden Podporovateľ za ťah'), l('Play only 1 Supporter per turn, then discard it. The player going first cannot play one on their first turn. Boss’s Orders brings 1 of your opponent’s Benched Pokémon into the Active Spot.', 'Za ťah môžeš zahrať iba 1 Podporovateľa. Potom ho odhoď. Hráč, ktorý začína, ho v prvom ťahu nemôže zahrať. Boss’s Orders presunie jedného zo súperových Pokémonov z lavičky na aktívne miesto.'), l('Trainer · Supporter', 'Trénerská karta · Podporovateľ')],
    [l('Stadium', 'Štadión'), 'stadium.png', l('A shared playing field', 'Spoločná herná plocha'), l('Only 1 Stadium stays in play for both players. Play at most 1 per turn; it must have a different name from the Stadium already in play. Prism Tower lets each player discard 2 cards to draw 1, once during their turn.', 'V hre zostáva iba 1 Štadión pre oboch hráčov. Za ťah môžeš zahrať najviac 1 a musí mať iné meno než ten v hre. Prism Tower umožní každému hráčovi raz počas jeho ťahu odhodiť 2 karty a potiahnuť 1.'), l('Trainer · Stadium', 'Trénerská karta · Štadión')],
  ];
  const turns = () => [
    [l('Draw a card', 'Potiahni kartu'), l('Take the top card of your deck into your hand. Do this at the start of every turn, including the very first turn.', 'Vezmi si vrchnú kartu balíčka do ruky. Urob to na začiatku každého ťahu vrátane úplne prvého.'), 'deck'],
    [l('Build your team', 'Priprav svoj tím'), l('Bench Basic Pokémon, evolve eligible Pokémon, play Trainers, and use Abilities. Normally, attach 1 Energy from your hand and retreat at most once. These actions can happen in any order.', 'Polož základných Pokémonov na lavičku, vyvíjaj, hraj Trénerské karty a používaj schopnosti. Bežne pripoj 1 Energiu z ruky a ustúp najviac raz. Tieto akcie môžeš robiť v ľubovoľnom poradí.'), 'bench'],
    [l('Attack, then end', 'Zaútoč a ukonči ťah'), l('Check the Energy cost and follow your attack’s text. Attacking ends your turn. If you don’t attack, you can pass. Then resolve Pokémon Checkup before the next player’s turn.', 'Skontroluj cenu útoku a vykonaj jeho text. Útok ukončí tvoj ťah. Ak neútočíš, môžeš ťah ukončiť. Pred ťahom súpera potom vyriešte kontrolu Pokémonov.'), 'active'],
  ];
  const evolutionSteps = () => [
    {
      name: 'Rowlet', file: 'rowlet.png', hp: 80, stage: l('Basic', 'Základný'), time: l('Already in play', 'Už v hre'),
      title: l('Start with Rowlet', 'Začni s Rowletom'),
      description: l('Rowlet has been in play since a previous turn. Add Dartrix on top: its card says it evolves from Rowlet.', 'Rowlet je v hre od predchádzajúceho ťahu. Polož naň Dartrixa: jeho karta uvádza, že sa vyvíja z Rowleta.'),
      action: l('Evolve into Dartrix', 'Vyvinúť na Dartrixa'),
    },
    {
      name: 'Dartrix', file: 'dartrix.png', hp: 100, stage: l('Stage 1', '1. štádium'), time: l('Evolve this turn', 'Vývoj v tomto ťahu'),
      title: l('Dartrix covers Rowlet', 'Dartrix zakrýva Rowleta'),
      description: l('Dartrix keeps the Energy and 20 damage. On a later turn, add Decidueye ex, which evolves from Dartrix.', 'Dartrix si ponechá Energiu aj 20 poškodenia. V ďalšom ťahu pridaj Decidueye ex, ktorý sa vyvíja z Dartrixa.'),
      action: l('Next turn: Decidueye ex', 'Ďalší ťah: Decidueye ex'),
    },
    {
      name: 'Decidueye ex', file: 'decidueye-ex.png', hp: 320, stage: l('Stage 2', '2. štádium'), time: l('On a later turn', 'V ďalšom ťahu'),
      title: l('Decidueye ex is on top', 'Decidueye ex je navrchu'),
      description: l('Use its new attacks and Ability. The Energy and 20 damage stay. If this Pokémon ex is Knocked Out, your opponent takes 2 Prizes.', 'Používaj jeho nové útoky a schopnosť. Energia aj 20 poškodenia zostávajú. Za vyradenie tohto Pokémona ex si súper vezme 2 odmeny.'),
      action: l('Replay evolution', 'Zopakovať vývoj'),
    },
  ];
  const image = (file, alt = '') => `<img src="${ASSETS}${file}?v=2" alt="${alt}" draggable="false" ${file === 'pikachu.png' ? 'fetchpriority="high"' : ''}>`;
  const edition = (file) => `<p class="learn-card-edition">${CARD_EDITIONS[file]}</p>`;
  const back = () => '<span class="learn-card-back"><span class="learn-pokeball"></span></span>';

  function board() {
    const labels = zones();
    const miniature = (file) => `<span class="learn-mini-card">${image(file)}</span>`;
    const side = (opponent) => {
      const tag = opponent ? 'div' : 'button';
      const area = (key, content, extra = '') => `<${tag} class="learn-zone learn-zone-${key} ${!opponent && zone === key ? 'is-highlighted' : ''}" ${opponent ? '' : `type="button" data-zone="${key}" aria-pressed="${zone === key}"`}><span class="learn-zone-label">${labels[key][0]}${extra}</span>${content}</${tag}>`;
      return `<div class="learn-board-side ${opponent ? 'is-opponent' : 'is-you'}" ${opponent ? 'aria-hidden="true"' : ''}>
        ${area('prizes', `<span class="learn-prize-grid">${Array.from({ length: 6 }, back).join('')}</span>`, ' <b>6</b>')}
        ${area('active', `<span class="learn-active-stack">${miniature(opponent ? 'staryu.png' : 'pikachu.png')}${!opponent && energyAttached ? '<span class="learn-attached-energy" aria-hidden="true">ϟ</span>' : ''}</span>`)}
        ${area('bench', `<span class="learn-bench-row">${miniature(opponent ? 'charmander.png' : 'rowlet.png')}${miniature(opponent ? 'rowlet.png' : 'charmander.png')}${Array.from({ length: 3 }, () => '<span class="learn-empty-slot"></span>').join('')}</span>`, ' <b>≤ 5</b>')}
        ${area('deck', `<span class="learn-deck-stack">${back()}</span>`)}
        ${area('discard', miniature('item.png'))}
      </div>`;
    };
    return `<div class="learn-board" aria-label="${l('Example Pokémon TCG playing area', 'Príklad hernej plochy Pokémon TCG')}">
      <span class="learn-player-label learn-opponent-label">${l('YOUR OPPONENT', 'TVOJ SÚPER')}</span>
      ${side(true)}<div class="learn-board-divider"><span class="learn-pokeball"></span></div>${side(false)}
      <span class="learn-player-label learn-you-label">${l('YOUR SIDE', 'TVOJA STRANA')}</span>
    </div>`;
  }

  function narrative() {
    if (slide === 0) return `<div class="learn-facts"><div><strong>60</strong><span>${l('cards per deck', 'kariet v balíčku')}</span></div><div><strong>6</strong><span>${l('Prize cards', 'kariet odmien')}</span></div></div>`;
    if (slide === 1 || slide === 2 || slide === 3 || slide === 7) return '';
    if (slide === 4) return `<ol class="learn-setup-list">
      <li><strong>${l('Flip a coin', 'Hoď mincou')}</strong><span>${l('The winner chooses who goes first.', 'Víťaz vyberie, kto začne.')}</span></li>
      <li><strong>${l('Draw 7 cards', 'Potiahni 7 kariet')}</strong><span>${l('Shuffle your deck first.', 'Najprv zamiešaj balíček.')}</span></li>
      <li><strong>${l('Place your Pokémon', 'Polož Pokémonov')}</strong><span>${l('1 Basic in the Active Spot; up to 5 on the Bench. Keep them face down.', '1 základný aktívny Pokémon a až 5 na lavičke. Polož ich lícom nadol.')}</span></li>
      <li><strong>${l('Set aside 6 Prizes', 'Odlož 6 odmien')}</strong><span>${l('Take the top 6 cards, face down. Both players reveal their Pokémon to begin.', 'Odlož vrchných 6 kariet lícom nadol. Obaja otočte Pokémonov a začnite.')}</span></li>
    </ol>`;
    if (slide === 5) return `<div class="learn-turn-steps" role="group" aria-label="${l('Parts of a turn', 'Časti ťahu')}">${turns().map((entry, i) => `<button type="button" data-turn="${i}" aria-pressed="${turn === i}"><span>${i + 1}</span>${entry[0]}</button>`).join('')}</div><p class="learn-first-turn">${l('Going first? You can’t attack or play a Supporter on your first turn.', 'Začínaš? V prvom ťahu nemôžeš útočiť ani hrať Podporovateľa.')}</p>`;
    return `<div class="learn-win-list"><p><strong>${l('Take all your Prizes', 'Vezmi všetky odmeny')}</strong><span>${l('Some Pokémon give up more than 1 Prize.', 'Za niektorých Pokémonov získaš viac odmien.')}</span></p><p><strong>${l('No Pokémon left', 'Súper nemá Pokémonov')}</strong><span>${l('Your opponent has no Pokémon left in play.', 'Súperovi nezostane žiadny Pokémon v hre.')}</span></p><p><strong>${l('No card to draw', 'Súper nemá čo potiahnuť')}</strong><span>${l('Your opponent can’t draw a card to start their turn.', 'Súper si na začiatku ťahu nemôže potiahnuť kartu.')}</span></p></div><a class="learn-source-link" href="${RULEBOOK}" target="_blank" rel="noopener noreferrer">${l('Explore the official rulebook', 'Pozri si oficiálne pravidlá')} ↗</a>`;
  }

  function evolutionVisual(animateEvolution) {
    const steps = evolutionSteps();
    const current = steps[evolutionStep];
    const next = steps[evolutionStep + 1];
    return `<div class="learn-evolution-scene" data-evolution-step="${evolutionStep}">
      <ol class="learn-evolution-path" aria-label="${l('Evolution stages', 'Vývojové štádiá')}">${steps.map((entry, index) => `<li class="${index <= evolutionStep ? 'is-reached' : ''}" ${index === evolutionStep ? 'aria-current="step"' : ''}><span>${entry.stage}</span><strong>${entry.name}</strong><small>${entry.time}</small></li>`).join('')}</ol>
      <div class="learn-evolution-table">
        <div class="learn-evolution-aura ${animateEvolution ? 'is-evolving' : ''}" aria-hidden="true"></div>
        <div class="learn-evolution-stack" role="img" aria-label="${current.name} · ${current.stage} · ${current.hp} HP · ${l('1 Energy attached, 20 damage', '1 pripojená Energia, 20 poškodenia')}">
          <div class="learn-evolution-energy" aria-hidden="true">${image('evolution-energy.png')}</div>
          ${steps.slice(0, evolutionStep + 1).map((entry, index) => `<div class="learn-evolution-card ${animateEvolution && index === evolutionStep ? 'is-entering' : ''}" style="--layer:${index};--depth:${evolutionStep - index}" data-evolution-card="${index}">${image(entry.file)}</div>`).join('')}
          <span class="learn-evolution-damage" aria-hidden="true"><b>20</b><small>${l('damage', 'poškodenie')}</small></span>
          <span class="learn-evolution-energy-count" aria-hidden="true">1 ${l('Energy', 'Energia')}</span>
        </div>
        ${next ? `<div class="learn-evolution-next" aria-hidden="true">${image(next.file)}<span>${l('Next: ', 'Ďalej: ')}${next.name}</span></div>` : ''}
      </div>
      <div class="learn-evolution-stats"><span><b>${current.hp}</b> HP</span><span><b>20</b> ${l('damage kept', 'poškodenie zostáva')}</span><span><b>${current.hp - 20}</b> ${l('HP left', 'zostáva HP')}</span></div>
    </div>`;
  }

  function evolutionDetail() {
    const current = evolutionSteps()[evolutionStep];
    return `<div class="learn-evolution-detail">
      <div class="learn-evolution-copy" aria-live="polite"><h2>${current.title}</h2><p>${current.description}</p></div>
      <button type="button" class="learn-evolve" data-evolve="">${current.action}<span aria-hidden="true">${evolutionStep === 2 ? '↺' : '↑'}</span></button>
      <ul class="learn-evolution-rules"><li>${l('Normally, no evolution on your first turn, on the turn this Pokémon enters play, or twice in one turn.', 'Bežne nemôžeš vyvíjať v prvom ťahu, v ťahu, keď Pokémon príde do hry, ani dvakrát v tom istom ťahu.')}</li><li>${l('Keep attached cards and damage. Use the top card’s HP, attacks and Abilities.', 'Pripojené karty a poškodenie zostávajú. Používaj HP, útoky a schopnosti vrchnej karty.')}</li><li>${l('Evolution clears Special Conditions and effects of attacks.', 'Vývoj odstráni špeciálne stavy a účinky útokov.')}</li></ul>
      <p class="learn-card-edition">Perfect Order · 2026</p>
    </div>`;
  }

  const simulationText = ([en, sk]) => l(en, sk);
  const simulationMotion = (key, content, source, extra = '', style = '') => `<span class="learn-sim-motion ${extra}" data-motion-key="${key}" data-enter-from="${source}" ${style ? `style="${style}"` : ''}>${content}</span>`;

  function simulationHands() {
    const state = getSimulationState(simulationStep);
    return `<div class="learn-sim-hands">${['opponent', 'you'].map(player => `<div class="learn-sim-hand-group" data-hand-player="${player}">
      <p>${player === 'you' ? l('Your hand', 'Tvoja ruka') : l('Opponent’s hand', 'Súperova ruka')}</p>
      <div class="learn-sim-hand" role="group" data-sim-anchor="${player}-hand" style="--hand-count:${Math.max(1, state[player].hand)}" aria-label="${state[player].hand} ${l('cards in hand, revealed for this example', 'kariet v ruke, odhalených pre túto ukážku')}">
        ${state[player].handCards.map((card, index) => simulationMotion(card.id, image(SIMULATION_CARDS[card.type].file, SIMULATION_CARDS[card.type].name), `${player}-deck`, 'learn-sim-hand-card', `--hand-index:${index}`)).join('')}
      </div></div>`).join('')}</div>`;
  }

  function simulationVisual() {
    const state = getSimulationState(simulationStep);
    const step = SIMULATION_STEPS[simulationStep];
    const labels = zones();
    const motion = simulationMotion;
    const renderPokemon = (pokemon, player) => {
      if (!pokemon) return '<span class="learn-empty-slot" aria-hidden="true"></span>';
      const card = SIMULATION_CARDS[pokemon.cards.at(-1).type];
      const description = state.revealed ? `${card.name}, ${pokemon.damage} ${l('damage', 'poškodenia')}, ${pokemon.energy.length} ${l('attached Energy', 'pripojených Energií')}` : l('Face-down Pokémon', 'Pokémon lícom nadol');
      return `<div class="learn-sim-pokemon" role="img" aria-label="${description}" data-pokemon="${pokemon.cards.at(-1).type}">
        ${pokemon.energy.map((entry, index) => motion(entry.id, image(SIMULATION_CARDS[entry.type].file), `${player}-hand`, 'learn-sim-energy-card', `--energy:${index}`)).join('')}
        ${pokemon.cards.map((entry, index) => motion(entry.id, state.revealed ? image(SIMULATION_CARDS[entry.type].file) : back(), `${player}-hand`, 'learn-sim-card', `--depth:${pokemon.cards.length - 1 - index};--layer:${index}`)).join('')}
        ${pokemon.damage ? `<span class="learn-sim-damage" aria-hidden="true">${pokemon.damage}</span>` : ''}
      </div>`;
    };
    const side = (player) => {
      const current = state[player];
      const activeTurn = step.phase > 0 && (step.phase % 2 === 1 ? player === 'you' : player === 'opponent');
      const area = (key, content) => `<div class="learn-zone learn-zone-${key} ${activeTurn && key === 'active' ? 'is-highlighted' : ''}" data-sim-zone="${key}"><span class="learn-zone-label">${labels[key][0]}</span>${content}</div>`;
      return `<section class="learn-board-side ${player === 'opponent' ? 'is-opponent' : 'is-you'}" data-sim-player="${player}" aria-label="${player === 'you' ? l('Your side', 'Tvoja strana') : l('Opponent’s side', 'Súperova strana')}">
        ${area('prizes', `<span class="learn-prize-grid" role="img" data-sim-anchor="${player}-prizes" aria-label="${current.prizes} ${l('Prizes left', 'zostávajúcich odmien')}">${current.prizeCards.map(card => motion(card.id, back(), `${player}-deck`)).join('')}</span>`)}
        ${area('active', renderPokemon(current.active, player))}
        ${area('bench', `<span class="learn-bench-row">${Array.from({ length: 2 }, () => '<span class="learn-empty-slot" aria-hidden="true"></span>').join('')}${renderPokemon(current.bench, player)}${Array.from({ length: 2 }, () => '<span class="learn-empty-slot" aria-hidden="true"></span>').join('')}</span>`)}
        ${area('deck', `<span class="learn-deck-stack" role="img" data-sim-anchor="${player}-deck" aria-label="${current.deck} ${l('cards in deck', 'kariet v balíčku')}">${back()}</span>`)}
        ${area('discard', `<span class="learn-sim-discard" role="img" aria-label="${current.discard} ${l('discarded cards', 'odhodených kariet')}">${current.discardCards.map((entry, index) => motion(entry.id, image(SIMULATION_CARDS[entry.type].file), `${player}-hand`, 'learn-sim-discard-card', `--layer:${index}`)).join('')}</span>`)}
      </section>`;
    };
    return `<div class="learn-simulation" data-simulation-step="${simulationStep}" data-simulation-event="${step.id}">
      <div class="learn-board learn-sim-board" aria-label="${l('Animated Pokémon TCG battle', 'Animovaný súboj Pokémon TCG')}">
        <span class="learn-player-label learn-opponent-label">${l('YOUR OPPONENT', 'TVOJ SÚPER')}</span>
        ${side('opponent')}<div class="learn-board-divider" aria-hidden="true"><span class="learn-pokeball"></span></div>${side('you')}
        <span class="learn-player-label learn-you-label">${l('YOUR SIDE', 'TVOJA STRANA')}</span>
        ${state.trainer ? `<div class="learn-sim-trainer" role="img" data-trainer="${state.trainer.card.type}" aria-label="${SIMULATION_CARDS[state.trainer.card.type].name}">${motion(state.trainer.card.id, image(SIMULATION_CARDS[state.trainer.card.type].file), `${state.trainer.player}-hand`, 'learn-sim-played-card')}</div>` : ''}
      </div>
    </div>`;
  }

  function simulationCaption() {
    const current = SIMULATION_STEPS[simulationStep];
    switch (current.action) {
      case 'opening-hands': return l('Both players draw their opening hands.', 'Obaja hráči si potiahnu úvodné karty.');
      case 'place-basics': return l('Place a Basic Pokémon Active and another on the Bench, face down.', 'Polož základného Pokémona na aktívne miesto a ďalšieho na lavičku, lícom nadol.');
      case 'prizes': return l('Set aside face-down Prizes, then reveal the Pokémon.', 'Odlož odmeny lícom nadol a potom otoč Pokémonov.');
      case 'draw': return l('Start each turn by drawing a card from the deck.', 'Každý ťah začni potiahnutím karty z balíčka.');
      case 'attach': return current.target === 'bench' ? l('Energy can also be attached to a Pokémon on the Bench.', 'Energiu môžeš pripojiť aj Pokémonovi na lavičke.') : l('Attach one Energy from your hand per turn. It stays after attacking.', 'Za ťah pripoj jednu Energiu z ruky. Po útoku zostáva.');
      case 'evolve': return l('Put the Evolution on top. Attached Energy and damage stay.', 'Polož vývoj navrch. Pripojené Energie aj poškodenie zostávajú.');
      case 'play-trainer': return current.card === 'boss' ? l('One Supporter per turn. Going first, you must wait until your second turn to play one.', 'Za ťah môžeš zahrať jedného Podporovateľa. Ak začínaš, musíš počkať až na svoj druhý ťah.') : l('Play an Item from your hand. You may play more than one Item in a turn.', 'Zahraj Predmet z ruky. Za ťah môžeš zahrať viac Predmetov.');
      case 'resolve-trainer': return current.card === 'boss' ? l('Bring an opposing Benched Pokémon into the Active Spot, then discard the Supporter.', 'Presuň súperovho Pokémona z lavičky na aktívne miesto a odhoď Podporovateľa.') : l('Swap your Active and Benched Pokémon, then discard the Item. Attached cards and damage stay.', 'Vymeň svojho aktívneho Pokémona s Pokémonom z lavičky a odhoď Predmet. Pripojené karty aj poškodenie zostávajú.');
      case 'attack': return current.discardEnergy ? l('This attack also discards an opposing Energy. The damage is enough for a Knock Out.', 'Tento útok odhodí aj súperovu Energiu. Poškodenie stačí na vyradenie.') : l('The Active Pokémon attacks. Add damage, keep the Energy, then end the turn.', 'Aktívny Pokémon zaútočí. Pridaj poškodenie, ponechaj Energie a ukonči ťah.');
      case 'knockout': return l('Take a Prize, discard the Knocked Out Pokémon, and promote from the Bench. The game continues!', 'Vezmi odmenu, odhoď vyradeného Pokémona a vyber nového z lavičky. Hra pokračuje!');
      case 'pass': return current.id === 'you-pass-1' ? l('Going first means no attack or Supporter on your first turn.', 'Ak začínaš, v prvom ťahu nemôžeš útočiť ani hrať Podporovateľa.') : l('The attack needs one more Energy. The Ability does not reduce its cost here, so wait for your next turn.', 'Na útok chýba jedna Energia. Schopnosť tu cenu nezníži, takže počkaj na ďalší ťah.');
      default: return l('You chose to go first. Both hands are face up for this teaching example.', 'Vybral si prvý ťah. V tejto ukážke sú obe ruky odhalené, aby si videl každú kartu.');
    }
  }

  function simulationCopy() {
    const current = SIMULATION_STEPS[simulationStep];
    return `<span class="learn-sim-turn">${simulationText(SIMULATION_PHASES[current.phase])}</span><h2>${simulationText(current.title)}</h2><p>${simulationCaption()}</p>`;
  }

  function simulationPlayLabel() {
    return simulationStep === SIMULATION_STEPS.length - 1 ? l('Replay battle', 'Zopakovať súboj') : simulationPlaying ? l('Pause animation', 'Pozastaviť animáciu') : l('Play animation', 'Prehrať animáciu');
  }

  function simulationDetail() {
    return `<div class="learn-sim-detail">
      <div class="learn-sim-copy" aria-live="polite" aria-atomic="true">${simulationCopy()}</div>
      ${simulationHands()}
      <progress class="learn-sim-progress" max="${SIMULATION_STEPS.length - 1}" value="${simulationStep}" aria-label="${l('Battle progress', 'Priebeh súboja')}"></progress>
      <div class="learn-sim-controls"><button type="button" data-sim-toggle="">${simulationPlayLabel()}</button><button type="button" data-sim-replay="">${l('Restart', 'Od začiatku')} <span aria-hidden="true">↺</span></button></div>
    </div>`;
  }

  function stopSimulationClock() {
    if (simulationTimer !== undefined) {
      simulationRemaining = Math.max(0, simulationDue - performance.now());
      clearTimeout(simulationTimer);
      simulationTimer = undefined;
    }
  }

  function cancelSimulationAnimations() {
    for (const animation of simulationAnimations) animation.cancel();
    simulationAnimations.clear();
  }

  function simulationPositions() {
    return new Map([...dialog.querySelectorAll('.learn-slide [data-motion-key], .learn-slide [data-sim-anchor]')].map(node => [node.dataset.motionKey || node.dataset.simAnchor, node.getBoundingClientRect()]));
  }

  function playSimulationAnimation(node, frames, options = {}) {
    const animation = node.animate(frames, { duration: 800, easing: 'cubic-bezier(.2,.7,.2,1)', ...options });
    simulationAnimations.add(animation);
    animation.finished.then(() => simulationAnimations.delete(animation), () => simulationAnimations.delete(animation));
    if (!simulationPlaying && simulationStep !== SIMULATION_STEPS.length - 1) animation.pause();
  }

  function animateSimulation(previous) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const node of dialog.querySelectorAll('.learn-slide [data-motion-key]')) {
      const old = previous.get(node.dataset.motionKey);
      const source = old || previous.get(node.dataset.enterFrom);
      if (!source) continue;
      const target = node.getBoundingClientRect();
      const direction = node.closest('.is-opponent') ? -1 : 1;
      const x = (source.x + source.width / 2 - target.x - target.width / 2) * direction;
      const y = (source.y + source.height / 2 - target.y - target.height / 2) * direction;
      if (Math.abs(x) + Math.abs(y) < 1) continue;
      playSimulationAnimation(node, [
        { translate: `${x}px ${y}px`, scale: old ? `${source.width / target.width} ${source.height / target.height}` : '.8', opacity: old ? 1 : 0 },
        { translate: '0px 0px', scale: '1', opacity: 1 },
      ], { delay: old ? 0 : Number(node.style.getPropertyValue('--hand-index') || 0) * 65 });
    }
    const current = SIMULATION_STEPS[simulationStep];
    if (current.action === 'prizes') {
      for (const node of dialog.querySelectorAll('.learn-sim-card')) playSimulationAnimation(node, [{ rotate: 'y -90deg' }, { rotate: 'y 0deg' }]);
    }
    if (current.action === 'attack') {
      const attacker = dialog.querySelector(`[data-sim-player="${current.player}"] [data-sim-zone="active"] .learn-sim-pokemon`);
      const defender = dialog.querySelector(`[data-sim-player="${current.player === 'you' ? 'opponent' : 'you'}"] [data-sim-zone="active"] .learn-sim-pokemon`);
      playSimulationAnimation(attacker, [{ translate: '0 0' }, { translate: '0 -28%', offset: .45 }, { translate: '0 0' }], { duration: 650 });
      playSimulationAnimation(defender, [{ filter: 'brightness(1)' }, { filter: 'brightness(1.8)', offset: .2 }, { filter: 'brightness(1)' }], { delay: 250, duration: 450 });
      const counter = defender.querySelector('.learn-sim-damage');
      if (counter) playSimulationAnimation(counter, [{ scale: 1.5 }, { scale: 1 }], { delay: 250, duration: 450 });
    }
  }

  function updateSimulationControls() {
    const toggle = dialog.querySelector('[data-sim-toggle]');
    if (!toggle) return;
    toggle.textContent = simulationPlayLabel();
    dialog.querySelector('.learn-sim-progress').value = simulationStep;
  }

  function updateSimulation({ animate = false } = {}) {
    const previous = simulationPositions();
    const slideElement = dialog.querySelector('.learn-slide');
    const scrollTop = slideElement.scrollTop;
    cancelSimulationAnimations();
    dialog.querySelector('.learn-simulation').outerHTML = simulationVisual();
    dialog.querySelector('.learn-sim-hands').outerHTML = simulationHands();
    dialog.querySelector('.learn-sim-copy').innerHTML = simulationCopy();
    updateSimulationControls();
    slideElement.scrollTop = scrollTop;
    if (animate) animateSimulation(previous);
  }

  function scheduleSimulation() {
    if (simulationTimer !== undefined || !dialog.open || slide !== 7 || !simulationPlaying || document.hidden || simulationStep === SIMULATION_STEPS.length - 1) return;
    simulationDue = performance.now() + simulationRemaining;
    simulationTimer = setTimeout(() => {
      simulationTimer = undefined;
      simulationStep++;
      simulationRemaining = SIMULATION_STEP_MS;
      if (simulationStep === SIMULATION_STEPS.length - 1) simulationPlaying = false;
      updateSimulation({ animate: true });
      scheduleSimulation();
    }, simulationRemaining);
  }

  function restartSimulation() {
    stopSimulationClock();
    simulationStep = 0;
    simulationRemaining = SIMULATION_STEP_MS;
    simulationPlaying = true;
    updateSimulation();
    scheduleSimulation();
  }

  function visual(animateEvolution = false) {
    if (slide === 1) return `<div class="learn-hero-card">${image('pikachu.png', l('Pikachu Pokémon card from 30th Celebration, number 23 of 128', 'Karta Pikachu zo série 30th Celebration, číslo 23 zo 128'))}${parts().map((entry, i) => `<button type="button" class="learn-hotspot ${part === i ? 'is-selected' : ''}" style="--x:${entry[2]}%;--y:${entry[3]}%" data-part="${i}" aria-label="${i + 1}. ${entry[0]}" aria-pressed="${part === i}">${i + 1}</button>`).join('')}</div>`;
    if (slide === 2) return `<div class="learn-type-cards" role="group" aria-label="${l('Card types', 'Druhy kariet')}">${types().map((entry, i) => `<button type="button" class="learn-type-card ${cardType === i ? 'is-selected' : ''}" data-type="${i}" aria-pressed="${cardType === i}">${image(entry[1])}<span class="learn-type-caption"><span class="learn-type-number">0${i + 1}</span><strong>${entry[0]}</strong></span></button>`).join('')}</div>`;
    if (slide === 3) return evolutionVisual(animateEvolution);
    if (slide === 7) return simulationVisual();
    return board();
  }

  function detail() {
    if (slide === 1) return `<div class="learn-card-key"><div class="learn-part-buttons" role="group" aria-label="${l('Parts of a Pokémon card', 'Časti karty Pokémona')}">${parts().map((entry, i) => `<button type="button" data-part="${i}" aria-pressed="${part === i}"><span>${i + 1}</span>${entry[0]}</button>`).join('')}</div><div class="learn-part-detail" aria-live="polite"><h2>${parts()[part][0]}</h2><p>${parts()[part][1]}</p>${edition('pikachu.png')}</div></div>`;
    if (slide === 2) return `<div class="learn-type-detail" aria-live="polite"><span class="learn-eyebrow">${types()[cardType][4]}</span><h2>${types()[cardType][2]}</h2><p>${types()[cardType][3]}</p>${edition(types()[cardType][1])}</div>`;
    if (slide === 3) return evolutionDetail();
    if (slide === 7) return simulationDetail();
    return `<div class="learn-board-caption" aria-live="polite">${caption()}</div>`;
  }

  function caption() {
    const selected = slide === 4 && zone === 'deck'
      ? [l('No Basic Pokémon?', 'Nemáš základného Pokémona?'), l('Show your hand, shuffle it back into your deck, and draw 7 again. Your opponent may draw 1 extra card each time you do this.', 'Ukáž karty v ruke, zamiešaj ich späť do balíčka a znova potiahni 7. Súper si môže za každý takýto pokus potiahnuť 1 kartu navyše.')]
      : slide === 5 && turn >= 0 ? turns()[turn] : null;
    return `<span class="learn-caption-icon" aria-hidden="true">${slide === 6 ? '★' : '↳'}</span><div><strong>${selected ? selected[0] : zones()[zone][0]}</strong><p>${selected ? selected[1] : zones()[zone][1]}</p>${slide === 5 && turn === 1 ? `<button type="button" class="learn-attach" data-attach ${energyAttached ? 'disabled' : ''}>${energyAttached ? l('✓ Energy attached · once this turn', '✓ Energia pripojená · raz za ťah') : l('+ Try attaching an Energy', '+ Skús pripojiť Energiu')}</button>` : ''}</div>`;
  }

  function render({ animate = false, animateEvolution = false } = {}) {
    const content = slides()[slide];
    const total = names().length;
    const isLast = slide === total - 1;
    dialog.lang = getLanguage();
    dialog.innerHTML = `<div class="learn-shell">
      <header class="learn-header">
        <div class="learn-brand"><img src="./brand/kraken-cards-logo.webp" alt="Kraken Cards" width="709" height="520"><span><b>Pokémon TCG</b><span>${l('A QUICK START GUIDE', 'STRUČNÝ SPRIEVODCA HROU')}</span></span></div>
        <div class="learn-header-actions"><button type="button" class="learn-language" data-language aria-label="${l('EN / SK: Switch to Slovak', 'SK / EN: Prepnúť na angličtinu')}">${getLanguage() === 'sk' ? 'SK / EN' : 'EN / SK'}</button><button type="button" class="learn-fullscreen" data-fullscreen aria-label="${l('Toggle fullscreen', 'Prepnúť celú obrazovku')}" title="${l('Fullscreen (F)', 'Celá obrazovka (F)')}"><svg class="icon"><use href="#i-expand"/></svg></button><button type="button" class="learn-close" data-close aria-label="${l('Back to timer', 'Späť na časomieru')}"><span>${l('Back to timer', 'Späť na časomieru')}</span><svg class="icon"><use href="#i-close"/></svg></button></div>
        <button type="button" class="learn-guide-qr" data-share aria-label="${l('Scan to learn: show QR code', 'Naskenuj návod: zobraziť QR kód')}"><img src="./learn/learn-qr.svg" alt="" width="164" height="164"><span>${l('Scan to learn', 'Naskenuj návod')}</span></button>
      </header>
      <div class="learn-slide ${animate ? 'learn-slide-enter' : ''}" data-slide="${slide}">
        <div class="learn-narrative"><div class="learn-summary"><p class="learn-eyebrow"><span class="learn-step-number">0${slide + 1}</span> ${names()[slide]}</p><h1 id="learn-title" tabindex="-1">${content.title.replace('\n', '<br> ')}</h1><p class="learn-intro">${content.description}</p></div><div class="learn-explanation">${narrative()}${detail()}</div></div>
        <div class="learn-visual"><div class="learn-visual-label"><span class="learn-live-dot"></span>${content.hint}<span>POKÉMON TCG</span></div>${visual(animateEvolution)}</div>
      </div>
      <footer class="learn-footer"><div class="learn-progress-copy"><strong>0${slide + 1}<span> / ${String(total).padStart(2, '0')}</span></strong><span>${l('The basics, one step at a time.', 'Základy, krok za krokom.')}</span></div><nav class="learn-progress" aria-label="${l('Presentation slides', 'Snímky prezentácie')}">${names().map((name, i) => `<button type="button" data-slide-to="${i}" aria-label="${i + 1}. ${name}" ${i === slide ? 'aria-current="step"' : ''}><span></span><b>${name}</b></button>`).join('')}</nav><div class="learn-navigation"><button type="button" class="learn-previous" data-previous ${slide === 0 ? 'disabled' : ''} aria-label="${l('Previous slide', 'Predchádzajúca snímka')}">←</button><button type="button" class="learn-next" ${isLast ? 'data-restart' : 'data-next'}>${isLast ? l('Start again', 'Začať znova') : l('Next', 'Ďalej')} <span aria-hidden="true">${isLast ? '↺' : '→'}</span></button></div></footer>
      <div class="learn-bottom-note"><span>${l('← → to explore · F for fullscreen · Esc to return', '← → listovanie · F celá obrazovka · Esc návrat')}</span><span>${l('Independent learning guide · Pokémon artwork © Pokémon / Nintendo / Creatures / GAME FREAK', 'Nezávislý sprievodca · Ilustrácie Pokémon © Pokémon / Nintendo / Creatures / GAME FREAK')}</span></div>
      <p class="sr-only" role="status">${l('Slide', 'Snímka')} ${slide + 1} / ${total}: ${names()[slide]}</p>
    </div>`;
  }

  function goTo(index) {
    const next = Math.max(0, Math.min(names().length - 1, index));
    if (next === slide) return;
    stopSimulationClock();
    cancelSimulationAnimations();
    slide = next;
    zone = slide === 4 ? 'deck' : slide === 6 ? 'prizes' : 'active';
    if (slide === 3) evolutionStep = 0;
    if (slide === 5) { turn = 0; zone = 'deck'; energyAttached = false; }
    render({ animate: true });
    dialog.querySelector('#learn-title').focus({ preventScroll: true });
    dialog.querySelector('.learn-slide').scrollTop = 0;
    scheduleSimulation();
  }

  // Update just the interactive content to keep the activated button focused.
  function updateDetail(focusAttribute, focusValue, parentSelector = '', renderOptions = {}) {
    const scrollTop = dialog.querySelector('.learn-slide').scrollTop;
    render(renderOptions);
    dialog.querySelector('.learn-slide').scrollTop = scrollTop;
    dialog.querySelector(`${parentSelector}[${focusAttribute}="${focusValue}"]`)?.focus({ preventScroll: true });
  }

  dialog.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-close')) dialog.close();
    else if (button.hasAttribute('data-language')) onLanguageChange(getLanguage() === 'en' ? 'sk' : 'en');
    else if (button.hasAttribute('data-fullscreen')) void onFullscreen();
    else if (button.hasAttribute('data-share')) onShare();
    else if (button.hasAttribute('data-next')) goTo(slide + 1);
    else if (button.hasAttribute('data-previous')) goTo(slide - 1);
    else if (button.hasAttribute('data-restart')) goTo(0);
    else if (button.hasAttribute('data-slide-to')) goTo(Number(button.dataset.slideTo));
    else if (button.hasAttribute('data-zone')) {
      zone = button.dataset.zone;
      if (slide === 5) {
        const matchingTurn = turns().findIndex((entry) => entry[2] === zone);
        turn = matchingTurn;
      }
      updateDetail('data-zone', zone);
    } else if (button.hasAttribute('data-part')) { part = Number(button.dataset.part); updateDetail('data-part', part, button.classList.contains('learn-hotspot') ? '.learn-hero-card ' : '.learn-part-buttons '); }
    else if (button.hasAttribute('data-type')) { cardType = Number(button.dataset.type); updateDetail('data-type', cardType); }
    else if (button.hasAttribute('data-evolve')) { evolutionStep = (evolutionStep + 1) % evolutionSteps().length; updateDetail('data-evolve', '', '', { animateEvolution: evolutionStep > 0 }); }
    else if (button.hasAttribute('data-sim-replay')) restartSimulation();
    else if (button.hasAttribute('data-sim-toggle')) {
      if (simulationStep === SIMULATION_STEPS.length - 1) { restartSimulation(); return; }
      stopSimulationClock();
      simulationPlaying = !simulationPlaying;
      for (const animation of simulationAnimations) simulationPlaying ? animation.play() : animation.pause();
      updateSimulationControls();
      scheduleSimulation();
    }
    else if (button.hasAttribute('data-turn')) { turn = Number(button.dataset.turn); zone = turns()[turn][2]; updateDetail('data-turn', turn); }
    else if (button.hasAttribute('data-attach')) { energyAttached = true; render(); dialog.querySelector('[data-turn="1"]').focus({ preventScroll: true }); }
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    if (['arrowright', 'pagedown', 'arrowleft', 'pageup', 'home', 'end', 'f'].includes(key)) {
      event.preventDefault();
      event.stopPropagation();
      if (key === 'f') void onFullscreen();
      else if (key === 'home') goTo(0);
      else if (key === 'end') goTo(names().length - 1);
      else goTo(slide + (['arrowright', 'pagedown'].includes(key) ? 1 : -1));
    }
    // Space/Enter keep native button behavior; the timer ignores keys in dialogs.
  });
  dialog.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1 || event.target.closest('button, a')) { touchStart = null; return; }
    touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }, { passive: true });
  dialog.addEventListener('touchend', (event) => {
    if (!touchStart || !event.changedTouches.length) return;
    const dx = event.changedTouches[0].clientX - touchStart.x;
    const dy = event.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.5) goTo(slide + (dx < 0 ? 1 : -1));
  }, { passive: true });
  dialog.addEventListener('close', () => {
    stopSimulationClock();
    cancelSimulationAnimations();
    document.body.classList.remove('learn-presenting');
    onClose();
    onVisibilityChange();
    if (opener?.checkVisibility()) opener.focus({ preventScroll: true });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopSimulationClock();
      for (const animation of simulationAnimations) animation.pause();
    } else if (dialog.open && slide === 7 && (simulationPlaying || simulationStep === SIMULATION_STEPS.length - 1)) {
      for (const animation of simulationAnimations) animation.play();
      scheduleSimulation();
    }
  });

  return {
    get isOpen() { return dialog.open; },
    open() {
      if (dialog.open) return;
      opener = document.activeElement;
      onOpen();
      render();
      dialog.showModal();
      document.body.classList.add('learn-presenting');
      dialog.querySelector('#learn-title').focus({ preventScroll: true });
      onVisibilityChange();
      scheduleSimulation();
    },
    refresh() {
      if (!dialog.open) return;
      stopSimulationClock();
      cancelSimulationAnimations();
      const hadLanguageFocus = document.activeElement?.hasAttribute('data-language');
      render();
      dialog.querySelector(hadLanguageFocus ? '[data-language]' : '#learn-title').focus({ preventScroll: true });
      scheduleSimulation();
    },
    focus() { dialog.querySelector('#learn-title')?.focus({ preventScroll: true }); },
  };
}
