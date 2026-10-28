// All material evolutions are explicit shop transactions. Add later shovel
// definitions here when their materials, costs and rates have been approved.
const TRADES = Object.freeze([Object.freeze({
  id: 'iron', name: 'Iron Shovel', requiredTier: 2,
  material: 'ironMaterial', owned: 'ironShovelOwned', costKey: 'ironSnowCost'
})]);
function tradeShovel(player, state, id, settings) {
  const trade = TRADES.find(item => item.id === id);
  if (!trade) throw Error('Unknown shovel trade.');
  if (state[trade.owned]) return 'You already own this shovel.';
  if (player.tier !== trade.requiredTier || !state[trade.material]) return 'Bring the required shovel and material to the shop first.';
  if (player.snow < settings[trade.costKey]) return 'You need more ❄️ for this trade.';
  player.snow -= settings[trade.costKey];
  state[trade.material] -= 1;
  state[trade.owned] = 1;
  return `New Shovel Unlocked! ${trade.name} 🪏`;
}
module.exports = { TRADES, tradeShovel };
