// A prepared opening for teaching, independent of the tournament timer.
export const SIMULATION_STEP_MS = 5000;
export const SIMULATION_CARDS = {
  rowlet: { name: 'Rowlet', file: 'rowlet.png', hp: 80, kind: 'pokemon' },
  dartrix: { name: 'Dartrix', file: 'dartrix.png', hp: 100, kind: 'pokemon' },
  decidueye: { name: 'Decidueye ex', file: 'decidueye-ex.png', hp: 320, kind: 'pokemon' },
  staryu: { name: 'Staryu', file: 'staryu.png', hp: 70, kind: 'pokemon' },
  pikachu: { name: 'Pikachu', file: 'pikachu.png', hp: 70, kind: 'pokemon' },
  grass: { name: 'Basic Grass Energy', file: 'evolution-energy.png', kind: 'energy' },
  water: { name: 'Basic Water Energy', file: 'water-energy.png', kind: 'energy' },
  switch: { name: 'Switch', file: 'item.png', kind: 'item' },
  boss: { name: 'Boss’s Orders', file: 'supporter.png', kind: 'supporter' },
};

export const SIMULATION_PHASES = [
  ['Setup', 'Príprava'], ['You · turn 1', 'Ty · ťah 1'],
  ['Opponent · turn 1', 'Súper · ťah 1'], ['You · turn 2', 'Ty · ťah 2'],
  ['Opponent · turn 2', 'Súper · ťah 2'], ['You · turn 3', 'Ty · ťah 3'],
  ['Opponent · turn 3', 'Súper · ťah 3'], ['You · turn 4', 'Ty · ťah 4'],
];

export const SIMULATION_STEPS = [
  { id: 'intro', phase: 0, title: ['Let’s play a few turns', 'Zahrajme si niekoľko ťahov'] },
  { id: 'opening', phase: 0, action: 'opening-hands', title: ['Draw 7 cards each', 'Potiahnuť po 7 kariet'] },
  { id: 'basics', phase: 0, action: 'place-basics', title: ['Place Basic Pokémon', 'Položiť základných Pokémonov'] },
  { id: 'prizes', phase: 0, action: 'prizes', title: ['Set 6 Prizes & reveal', 'Odložiť 6 odmien a otočiť karty'] },
  { id: 'you-draw-1', phase: 1, action: 'draw', player: 'you', title: ['Draw your first card', 'Potiahnuť prvú kartu'] },
  { id: 'you-item', phase: 1, action: 'play-trainer', player: 'you', card: 'switch', title: ['Play Switch · Item', 'Zahrať Switch · Predmet'] },
  { id: 'you-item-effect', phase: 1, action: 'resolve-trainer', player: 'you', card: 'switch', title: ['Switch your Active Pokémon', 'Vymeniť aktívneho Pokémona'] },
  { id: 'you-energy-1', phase: 1, action: 'attach', player: 'you', energy: 'grass', title: ['Attach Grass Energy', 'Pripojiť trávovú Energiu'] },
  { id: 'you-pass-1', phase: 1, action: 'pass', title: ['End your first turn', 'Ukončiť prvý ťah'] },
  { id: 'opponent-draw-1', phase: 2, action: 'draw', player: 'opponent', title: ['Opponent draws', 'Súper potiahne kartu'] },
  { id: 'opponent-energy-1', phase: 2, action: 'attach', player: 'opponent', energy: 'water', title: ['Attach Water Energy', 'Pripojiť vodnú Energiu'] },
  { id: 'opponent-attack-1', phase: 2, action: 'attack', player: 'opponent', damage: 20, title: ['Water Gun · 20 damage', 'Water Gun · 20 poškodenia'] },
  { id: 'you-draw-2', phase: 3, action: 'draw', player: 'you', title: ['Draw for your second turn', 'Potiahnuť kartu v druhom ťahu'] },
  { id: 'you-supporter', phase: 3, action: 'play-trainer', player: 'you', card: 'boss', title: ['Play Boss’s Orders · Supporter', 'Zahrať Boss’s Orders · Podporovateľ'] },
  { id: 'you-supporter-effect', phase: 3, action: 'resolve-trainer', player: 'you', card: 'boss', title: ['Bring up the opposing Rowlet', 'Presunúť súperovho Rowleta dopredu'] },
  { id: 'dartrix', phase: 3, action: 'evolve', player: 'you', card: 'dartrix', title: ['Evolve into Dartrix', 'Vyvinúť na Dartrixa'] },
  { id: 'you-energy-2', phase: 3, action: 'attach', player: 'you', energy: 'grass', title: ['Attach a second Grass Energy', 'Pripojiť druhú trávovú Energiu'] },
  { id: 'you-attack-2', phase: 3, action: 'attack', player: 'you', damage: 20, title: ['Leafage · 20 damage', 'Leafage · 20 poškodenia'] },
  { id: 'opponent-draw-2', phase: 4, action: 'draw', player: 'opponent', title: ['Opponent draws again', 'Súper znova potiahne kartu'] },
  { id: 'opponent-item', phase: 4, action: 'play-trainer', player: 'opponent', card: 'switch', title: ['Opponent plays Switch · Item', 'Súper zahrá Switch · Predmet'] },
  { id: 'opponent-item-effect', phase: 4, action: 'resolve-trainer', player: 'opponent', card: 'switch', title: ['Staryu returns to the Active Spot', 'Staryu sa vráti na aktívne miesto'] },
  { id: 'opponent-attack-2', phase: 4, action: 'attack', player: 'opponent', damage: 20, title: ['Water Gun · 20 more', 'Water Gun · ďalších 20'] },
  { id: 'you-draw-3', phase: 5, action: 'draw', player: 'you', title: ['Draw for your third turn', 'Potiahnuť kartu v treťom ťahu'] },
  { id: 'decidueye', phase: 5, action: 'evolve', player: 'you', card: 'decidueye', title: ['Evolve into Decidueye ex', 'Vyvinúť na Decidueye ex'] },
  { id: 'you-energy-3', phase: 5, action: 'attach', player: 'you', energy: 'grass', title: ['Attach a third Grass Energy', 'Pripojiť tretiu trávovú Energiu'] },
  { id: 'wait-for-energy', phase: 5, action: 'pass', title: ['Wait for enough Energy', 'Počkať na dostatok Energií'] },
  { id: 'opponent-draw-3', phase: 6, action: 'draw', player: 'opponent', title: ['Opponent starts turn three', 'Súper začne tretí ťah'] },
  { id: 'opponent-bench-energy', phase: 6, action: 'attach', player: 'opponent', target: 'bench', energy: 'grass', title: ['Power up Benched Rowlet', 'Pripojiť Energiu Rowletovi na lavičke'] },
  { id: 'opponent-attack-3', phase: 6, action: 'attack', player: 'opponent', damage: 20, title: ['Water Gun · another 20', 'Water Gun · znova 20'] },
  { id: 'you-draw-4', phase: 7, action: 'draw', player: 'you', title: ['Draw for your fourth turn', 'Potiahnuť kartu v štvrtom ťahu'] },
  { id: 'you-energy-4', phase: 7, action: 'attach', player: 'you', energy: 'grass', title: ['Attach the fourth Grass Energy', 'Pripojiť štvrtú trávovú Energiu'] },
  { id: 'crushing-arrow', phase: 7, action: 'attack', player: 'you', damage: 240, discardEnergy: true, title: ['Crushing Arrow · 240 damage', 'Crushing Arrow · 240 poškodenia'] },
  { id: 'knockout', phase: 7, action: 'knockout', title: ['Take a Prize & promote', 'Vziať odmenu a vybrať Pokémona'] },
];

function preparedDeck(player) {
  const opening = player === 'you'
    ? ['pikachu', 'rowlet', 'switch', 'grass', 'dartrix', 'grass', 'decidueye']
    : ['staryu', 'rowlet', 'water', 'switch', 'grass', 'water', 'water'];
  const energy = player === 'you' ? 'grass' : 'water';
  const types = [...opening, ...Array(53).fill(energy)];
  types.splice(13, 4, ...(player === 'you' ? ['boss', 'grass', 'grass', 'grass'] : ['water', 'water', 'grass', 'water']));
  return types.map((type, index) => ({ id: `${player}-${index}`, type }));
}

const pokemon = (card) => ({ cards: [card], energy: [], damage: 0 });
const draw = (player) => player.handCards.push(player.deckCards.shift());
const take = (player, type) => {
  const index = player.handCards.findIndex(card => card.type === type);
  if (index === -1) throw new Error(`Prepared hand is missing ${type}`);
  return player.handCards.splice(index, 1)[0];
};

export function getSimulationState(index) {
  const player = (name) => ({ deckCards: preparedDeck(name), handCards: [], prizeCards: [], discardCards: [], active: null, bench: null });
  const state = { you: player('you'), opponent: player('opponent'), revealed: false, trainer: null };
  for (const step of SIMULATION_STEPS.slice(0, index + 1)) {
    const current = state[step.player];
    switch (step.action) {
      case 'opening-hands':
        for (const side of [state.you, state.opponent]) for (let i = 0; i < 7; i++) draw(side);
        break;
      case 'place-basics':
        state.you.active = pokemon(take(state.you, 'pikachu'));
        state.you.bench = pokemon(take(state.you, 'rowlet'));
        state.opponent.active = pokemon(take(state.opponent, 'staryu'));
        state.opponent.bench = pokemon(take(state.opponent, 'rowlet'));
        break;
      case 'prizes':
        for (const side of [state.you, state.opponent]) side.prizeCards = side.deckCards.splice(0, 6);
        state.revealed = true;
        break;
      case 'draw': draw(current); break;
      case 'attach': current[step.target || 'active'].energy.push(take(current, step.energy)); break;
      case 'evolve': current.active.cards.push(take(current, step.card)); break;
      case 'play-trainer': state.trainer = { card: take(current, step.card), player: step.player }; break;
      case 'resolve-trainer': {
        const target = step.card === 'boss' ? state.opponent : current;
        [target.active, target.bench] = [target.bench, target.active];
        current.discardCards.push(state.trainer.card);
        state.trainer = null;
        break;
      }
      case 'attack': {
        const defender = state[step.player === 'you' ? 'opponent' : 'you'];
        defender.active.damage += step.damage;
        if (step.discardEnergy) defender.discardCards.push(defender.active.energy.pop());
        break;
      }
      case 'knockout':
        state.opponent.discardCards.push(...state.opponent.active.cards, ...state.opponent.active.energy);
        state.opponent.active = state.opponent.bench;
        state.opponent.bench = null;
        state.you.handCards.push(state.you.prizeCards.pop());
        break;
    }
  }
  for (const side of [state.you, state.opponent]) {
    side.deck = side.deckCards.length;
    side.hand = side.handCards.length;
    side.prizes = side.prizeCards.length;
    side.discard = side.discardCards.length;
  }
  return state;
}
