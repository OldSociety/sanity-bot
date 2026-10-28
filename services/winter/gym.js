const SKILLS = [{
  id: 'strength',
  name: 'Strength',
  short: 'STR',
  emoji: '💪🏽'
}, {
  id: 'accuracy',
  name: 'Accuracy',
  short: 'ACC',
  emoji: '🎯'
}, {
  id: 'dodge',
  name: 'Dodge',
  short: 'DGE',
  emoji: '🛡️'
}, {
  id: 'special',
  name: 'Special Damage',
  short: 'SPC',
  emoji: '💥'
}];
const settings = require('../../config/winter/combat.json');
const MAX_LEVEL = settings.gymMaxLevel,
  LIFT_TAUNT = "Those scrawny arms can't lift this!",
  RECIPE_PRICE = 999000;
const normalizeSkill = id => ({
  defense: 'dodge',
  attack: 'special',
  speed: 'special'
})[id] || id;
const totalCost = level => level * (level + 1) / 2;
function buyLevels(state, id, quantity = '1') {
  id = normalizeSkill(id);
  const skill = SKILLS.find(s => s.id === id);
  if (!skill || !state.gymUnlocked[id]) return 'This statistic is not unlocked yet.';
  const level = state.gym[id];
  if (level >= MAX_LEVEL) return `${skill.short} is already MAX.`;
  const count = 1;
  const cost = totalCost(level + count) - totalCost(level);
  if (!count || cost > state.sweat) return `You need more 💦 to train ${skill.short}.`;
  state.sweat -= cost;
  state.gym[id] += count;
  let message = `${skill.emoji} ${skill.name} is now ${state.gym[id] === MAX_LEVEL ? 'MAX' : `level ${state.gym[id]}`}.`;
  return message;
}
function liftWeight(state, s = settings) {
  const stage = state.weightStage || 0;
  if (stage >= s.weightSteps.length) return 'You already lifted every weight.';
  if (state.gym.strength < s.weightStrength[stage]) return LIFT_TAUNT;
  state.weightStage = stage + 1;
  const next = SKILLS[stage + 1];
  if (next) state.gymUnlocked[next.id] = 1;
  if (!stage) {
    state.queueCapacity = s.queueExpandedCapacity;
    state.ironMaterial = 1;
  }
  if (state.weightStage === s.weightSteps.length) {
    state.secretRecipeFound = 1;
    state.hendrixUnlocked = 1;
  }
  return `You lifted ${s.weightSteps[stage]} lb!${next ? ` ${next.emoji} ${next.name} unlocked!` : ' Winter Hendrix and his badge unlocked!'}${!stage ? ' You found Iron! Take it to /snow shop.' : ''}`;
}
module.exports = {
  SKILLS,
  MAX_LEVEL,
  LIFT_TAUNT,
  RECIPE_PRICE,
  normalizeSkill,
  totalCost,
  buyLevels,
  liftWeight
};
