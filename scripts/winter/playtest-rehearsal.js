// Source-only command-policy rehearsal. Never opens a database or Discord.
const fs = require('node:fs');
const path = require('node:path');
const M = require('../../services/winter/game/game');
const directory = path.resolve(__dirname, '../../artifacts/winter-live-chapter1-2026-10-29');
function rehearse(seed, hours) {
  const s = M.fresh('gym', seed), step = hours * 3600000;
  M.action(s, 'throw');
  let previousProduction = 0, commands = 1, ironState;
  const act = (name, q) => { M.action(s, name, q); commands++; };
  for (let at = step; at <= 31 * 86400000; at += step) {
    M.settle(s, at); act('throw');
    while (s.strength < 100 && s.wallet.sweat >= s.strength + s.accuracy + 1) act('train-strength');
    if (s.strength >= 25 && !s.ironMaterial) act('lift');
    if (s.ironMaterial && s.tier === 2 && s.wallet.snow >= M.rules.ironSnowCost) { act('iron'); ironState = structuredClone(s); }
    if (s.tiers[1].wins >= 100 && !s.owned[2]) { act('buy-s2'); act('select-s2'); }
    if (s.owned[2] && s.tiers[2].wins >= 100 && s.wallet.snow >= M.rules.snowmen[2].snowPrice) { act('buy-s3'); break; }
    if (!s.iceRecipe && s.wallet.snow >= 10000000) act('buy-ice-recipe');
    const type = s.iceRecipe ? 'ice' : 'red', cost = type === 'ice' ? 2000 : 1000;
    const production = s.ledger.sources['gathering:snow:gained'] || 0;
    const budget = Math.min(Math.max(0, s.wallet.snow - Math.ceil(step / 3000) * 10), (production - previousProduction) / 2);
    let qty = Math.floor(budget / cost);
    // Use the actual offered finite batch controls; never fabricate supply.
    while (qty >= 100) { act(type === 'ice' ? 'buy-ice' : 'buy-spicy', '100'); qty -= 100; }
    while (qty >= 10) { act(type === 'ice' ? 'buy-ice' : 'buy-spicy', '10'); qty -= 10; }
    while (qty >= 1) { act(type === 'ice' ? 'buy-ice' : 'buy-spicy', '1'); qty--; }
    if (M.ammoAvailable(s, type)) act(`equip-${type}`);
    previousProduction = production;
  }
  M.validate(s);
  return { seed, visitHours: hours, complete: s.chapter === 2, hours: s.now / 3600000, commands,
    milestonesHours: Object.fromEntries(Object.entries(s.milestones).map(([k, v]) => [k, v / 3600000])),
    final: s, ironState };
}
function main() {
  fs.mkdirSync(directory, { recursive: true });
  const results = [1, 4].flatMap(hours => Array.from({ length: 8 }, (_, i) => rehearse(314159 + i, hours)));
  fs.writeFileSync(path.join(directory, 'command-rehearsals.json'), JSON.stringify({ fingerprint: M.fingerprint,
    assumptions: 'Post-Gym STR3 bookmark; hourly/four-hourly visits, STR-only shared-cost training, restore Throw each visit, buy Iron then available Ice, finite batches from half interval snow production. A tested policy, not optimal play or tutorial-inclusive prediction.', results }, null, 2));
  console.log(JSON.stringify(results.map(r => ({ seed: r.seed, visitHours: r.visitHours, complete: r.complete, ironHours: r.milestonesHours.iron, iceHours: r.milestonesHours.iceRecipe, chapter1Hours: r.milestonesHours.chapter1, commands: r.commands })), null, 2));
}
if (require.main === module) main();
module.exports = { rehearse };
