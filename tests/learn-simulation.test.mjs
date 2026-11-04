import test from 'node:test';
import assert from 'node:assert/strict';
import { SIMULATION_CARDS, SIMULATION_STEPS, getSimulationState } from '../site/learn-simulation.js';

const frame = (id) => getSimulationState(SIMULATION_STEPS.findIndex(step => step.id === id));

test('every animation frame accounts for all 60 distinct cards on both sides', () => {
  for (let index = 0; index < SIMULATION_STEPS.length; index++) {
    const state = getSimulationState(index);
    for (const name of ['you', 'opponent']) {
      const player = state[name];
      const cards = [...player.deckCards, ...player.handCards, ...player.prizeCards, ...player.discardCards,
        ...[player.active, player.bench].filter(Boolean).flatMap(pokemon => [...pokemon.cards, ...pokemon.energy]),
        ...(state.trainer?.player === name ? [state.trainer.card] : [])];
      assert.equal(cards.length, 60, `${name}, ${SIMULATION_STEPS[index].id}`);
      assert.equal(new Set(cards.map(card => card.id)).size, 60);
      assert.ok(cards.every(card => card.id.startsWith(`${name}-`) && SIMULATION_CARDS[card.type]));
    }
  }
});

test('Items and Supporters leave the hand, apply the printed switch effects, and enter discard', () => {
  const initialItem = frame('you-draw-1').you.handCards.find(card => card.type === 'switch');
  const playingItem = frame('you-item');
  assert.deepEqual(playingItem.trainer.card, initialItem);
  assert.ok(!playingItem.you.handCards.some(card => card.id === initialItem.id));
  const switched = frame('you-item-effect');
  assert.equal(switched.you.active.cards.at(-1).type, 'rowlet');
  assert.equal(switched.you.bench.cards.at(-1).type, 'pikachu');
  assert.deepEqual(switched.you.discardCards, [initialItem]);
  const boss = frame('you-supporter-effect');
  assert.equal(boss.opponent.active.cards.at(-1).type, 'rowlet');
  assert.equal(boss.opponent.bench.cards.at(-1).type, 'staryu');
  assert.equal(boss.opponent.bench.energy[0].type, 'water');
  assert.deepEqual(boss.you.discardCards.map(card => card.type), ['switch', 'boss']);
  const response = frame('opponent-item-effect');
  assert.equal(response.opponent.active.cards.at(-1).type, 'staryu');
  assert.equal(response.opponent.active.energy.length, 1);
  assert.equal(response.opponent.bench.damage, 20);
  assert.equal(response.opponent.discardCards[0].type, 'switch');
});

test('the scripted turns respect Energy, evolution, Supporter and attack restrictions', () => {
  const attachments = new Set();
  const supporters = new Set();
  const evolutions = new Set();
  for (const [index, step] of SIMULATION_STEPS.entries()) {
    const state = getSimulationState(index);
    const key = `${step.player}-${step.phase}`;
    if (step.action === 'attach') {
      assert.ok(!attachments.has(key), 'Only one normal Energy attachment per turn');
      attachments.add(key);
    }
    if (step.action === 'play-trainer' && step.card === 'boss') {
      assert.notEqual(step.phase, 1, 'No Supporter on the starting player’s first turn');
      assert.ok(!supporters.has(key));
      supporters.add(key);
    }
    if (step.action === 'evolve') {
      assert.ok(step.phase > 2, 'Neither player evolves on their first turn');
      assert.ok(!evolutions.has(key), 'The same Pokémon evolves once per turn');
      evolutions.add(key);
    }
    if (step.action === 'attack') {
      assert.notEqual(step.phase, 1);
      const attacker = state[step.player].active;
      const type = attacker.cards.at(-1).type;
      assert.ok(attacker.energy.some(card => card.type === (type === 'staryu' ? 'water' : 'grass')));
      if (type === 'decidueye') assert.ok(attacker.energy.length >= 4);
    }
  }
  assert.equal(frame('wait-for-energy').opponent.hand, 5, 'Sniper’s Eye is inactive');
  assert.equal(frame('knockout').you.prizes, 5);
  assert.equal(frame('knockout').opponent.active.damage, 20);
});
