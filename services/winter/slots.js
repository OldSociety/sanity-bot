const {
  randomUUID
} = require('node:crypto');
const {
  add
} = require('./battle');
const STAKES = Object.freeze([1, 10, 25, 100]);
const INITIAL_JACKPOT = 105983;
const RESET_JACKPOT = 100000;
// Original Zalathor stage weights (Red intentionally totals 108), ranges,
// sqrt-stake scaling and first-roll protection are retained.
// Ordinary gains are one quarter of the original multiplier; jackpot is unchanged.
const STAGES = Object.freeze([{
  name: 'Red',
  color: 0xe53935,
  effects: [['gain', 50, 1, 3], ['false_alarm', 16], ['snowball', 8, 1], ['lose', 14, 1, 3], ['advance', 8], ['game_over', 12]]
}, {
  name: 'Blue',
  color: 0x2196f3,
  effects: [['gain', 42, 1, 8], ['false_alarm', 10], ['lose', 25, 1, 18], ['advance', 5], ['nothing', 10], ['game_over', 8]]
}, {
  name: 'Green',
  color: 0x43a047,
  effects: [['gain', 40, 1, 13], ['false_alarm', 8], ['lose', 24, 1, 13], ['advance', 8], ['snowball', 8, 3], ['game_over', 12]]
}, {
  name: 'Silver',
  color: 0xbcc0c0,
  effects: [['gain', 35, 1, 19], ['false_alarm', 5], ['lose', 27, 1, 19], ['advance', 6], ['snowball', 9, 1], ['game_over', 18]]
}, {
  name: 'Gold',
  color: 0xffd700,
  effects: [['gain', 39, 1, 19], ['jackpot', 5], ['lose', 34, 1, 19], ['zalathor', 2], ['game_over', 20]]
}]);
const SYMBOLS = Object.freeze({
  gain: '🎁',
  false_alarm: '🔔',
  snowball: '⛄️',
  lose: '🧊',
  advance: '🎄',
  game_over: '🥶',
  nothing: '❄️',
  jackpot: '🌟',
  zalathor: '🎅'
});
function draw(random) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw Error('Invalid slots random draw.');
  return value;
}
const integer = (random, low, high) => low + Math.floor(draw(random) * (high - low + 1));
function freshSlots() {
  return {
    id: randomUUID(),
    revision: 0,
    active: 0,
    stage: 0,
    stake: 1,
    pot: 0,
    spins: 0,
    outcome: '',
    message: ''
  };
}
function spin(state, random) {
  const first = state.spins === 0;
  const effects = STAGES[state.stage].effects.filter(e => !first || !['advance', 'game_over'].includes(e[0]));
  let roll = draw(random) * effects.reduce((sum, effect) => sum + effect[1], 0);
  let effect = effects.at(-1);
  for (const candidate of effects) {
    roll -= candidate[1];
    if (roll < 0) {
      effect = candidate;
      break;
    }
  }
  const [type,, low, high] = effect;
  state.spins = add(state.spins, 1);
  state.revision = add(state.revision, 1);
  state.outcome = type;
  let payout = 0,
    jackpotContribution = 0,
    snowballs = 0;
  if (type === 'gain') {
    const gain = Math.max(1, Math.round(integer(random, low, high) * 0.375 * Math.sqrt(state.stake)));
    state.pot = add(state.pot, gain);
    state.message = `🎁 You added ${gain} to your pot.`;
  } else if (type === 'lose') {
    const loss = Math.min(state.pot, Math.round(integer(random, low, high) * 1.2 * Math.sqrt(state.stake)));
    state.pot -= loss;
    state.message = `🧊 You lost ${loss} from your pot.`;
  } else if (type === 'advance') {
    state.stage += 1;
    state.message = `🎄 You advanced to the ${STAGES[state.stage].name} Stage!`;
  } else if (type === 'snowball') {
    snowballs = low;
    state.message = '⛄️ Snowballs found!';
  } else if (type === 'game_over') {
    jackpotContribution = Math.floor(state.pot / 2);
    state.message = `🥶 Game over! You lost your pot of ${state.pot}.`;
    state.pot = 0;
    state.active = 0;
  } else if (type === 'jackpot') {
    state.active = 0;
    state.pot = 0;
    payout = 'jackpot';
    state.message = '🌟 Jackpot!';
  } else if (type === 'zalathor') state.message = '🎅 Zalathor appears… then vanishes. Nothing happens.';else state.message = type === 'false_alarm' ? '🔔 So close! You stay on this stage.' : '❄️ Nothing happens.';
  return {
    payout,
    jackpotContribution,
    snowballs
  };
}
const control = state => `${state.id}.${state.revision}`;
const validControl = token => /^[a-f0-9-]{36}\.(0|[1-9]\d*)$/.test(token || '');
function snowSpin(random, table) {
  const total = table.reduce((sum, row) => sum + row.weight, 0);
  if (!total || table.some(row => !Number.isSafeInteger(row.buttons) || row.buttons < 0 || !Number.isFinite(row.weight) || row.weight < 0)) throw Error('Invalid Snow Slots rewards.');
  let roll = draw(random) * total;
  for (const row of table) {
    roll -= row.weight;
    if (roll < 0) return row.buttons;
  }
  return table.at(-1).buttons;
}
module.exports = {
  STAKES,
  STAGES,
  SYMBOLS,
  INITIAL_JACKPOT,
  RESET_JACKPOT,
  freshSlots,
  spin,
  integer,
  control,
  validControl,
  snowSpin
};
