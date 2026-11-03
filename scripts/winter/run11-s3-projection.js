// Read-only Run 11 checkpoint continuation. Does not touch saved runs or Discord.
const sqlite = require('sqlite3');
const M = require('../../services/winter/playtest-model');
function project(checkpoint, seed, interval, fire = true) {
  const s = structuredClone(checkpoint), start = s.now;
  s.fireFlowerOwned = fire;
  s.rng = seed; s.buttonRng = (seed ^ 0x9e3779b9) >>> 0 || 1;
  const act = (name, q) => M.action(s, name, q, { shopCurrency: 'diamonds' });
  function visit() {
    act('throw');
    while (s.strength < 100 && s.wallet.sweat >= s.strength + s.accuracy + s.defense + s.special + 1) act('train-strength');
    if (s.wallet.snow >= 1000) act('diamonds-convert', 'max');
    if (s.wallet.diamonds) act('buy-spicy', 'max');
    if (M.ammoAvailable(s, 'red')) act('equip-red');
  }
  visit();
  for (let t = start + interval; t <= start + 72 * 3600000 && s.tiers[3].wins < 100; t += interval) { M.settle(s, t); if (s.tiers[3].wins < 100) visit(); }
  M.validate(s);
  return { hours: s.milestones.clearS3 === undefined ? null : (s.milestones.clearS3 - start) / 3600000, wins: s.tiers[3].wins, strength: s.strength, buttons: s.wallet.buttons };
}
async function main() {
  const db = new sqlite.Database('config/dev.sqlite', sqlite.OPEN_READONLY);
  const row = await new Promise((resolve, reject) => db.get('SELECT state FROM WinterPlaytestRuns WHERE id=11', (e, r) => e ? reject(e) : resolve(r)));
  await new Promise((resolve, reject) => db.close(e => e ? reject(e) : resolve()));
  const state = JSON.parse(row.state);
  for (const fire of [true, false]) for (const minutes of [15, 60]) {
    const outcomes = Array.from({ length: 20 }, (_, i) => project(state, 912001 + i, minutes * 60000, fire));
    const completed = outcomes.filter(x => x.hours !== null).sort((a,b) => a.hours - b.hours);
    const wins = outcomes.map(x => x.wins).sort((a,b) => a-b);
    console.log(JSON.stringify({ fire, minutes, completed: completed.length, minHours: completed[0]?.hours, medianHours: completed.length === 20 ? (completed[9].hours + completed[10].hours)/2 : null, maxHours: completed.at(-1)?.hours, winsAtEnd: { min: wins[0], median: (wins[9]+wins[10])/2, max: wins.at(-1) }, outcomes }));
  }
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { project };
