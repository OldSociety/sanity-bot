// Offline policy study: uses the live development model, no database or bot.
const fs = require('node:fs');
const path = require('node:path');
const M = require('../../services/winter/playtest-model');

function run(seed, visitMinutes, openingSnow) {
  const s = M.fresh('iron', seed);
  s.liveRules = true;
  if (openingSnow === 0) M.change(s, 'snow', -s.wallet.snow, 'study-opening-adjustment');
  const initial = { snow: s.wallet.snow, s2Wins: s.tiers[2].wins };
  const act = (name, q) => M.action(s, name, q, { shopCurrency: 'diamonds' });
  act('throw'); act('buy-jacket'); act('throw');
  let stoppedSpicyAt;
  const visit = () => {
    act('throw');
    while (s.accuracy < 100 && s.wallet.sweat >= s.strength + s.accuracy + s.defense + s.special + 1) act('train-accuracy');
    if (s.tiers[2].wins < 100) {
      if (s.wallet.snow >= 1000) act('diamonds-convert', 'max');
      if (s.wallet.diamonds) act('buy-spicy', 'max');
      if (s.wallet.red) act('equip-red');
    } else {
      stoppedSpicyAt ??= s.now;
      if (s.wallet.snow >= 1000) act('diamonds-convert', 'max');
      if (s.wallet.diamonds >= M.rules.snowmen[2].snowPrice / 1000) act('buy-s3');
    }
  };
  visit();
  const step = visitMinutes * 60000;
  for (let at = step; at <= 48 * 3600000 && s.chapter < 2; at += step) { M.settle(s, at); visit(); }
  M.validate(s);
  return { seed, visitMinutes, initial, complete: s.chapter === 2, hours: s.now / 3600000,
    clearHours: s.milestones.clearS2 / 3600000, stopSpicyHours: stoppedSpicyAt / 3600000,
    spicyBought: s.ledger.sources['ammunition:diamonds:spent'] || 0,
    accuracy: s.accuracy, endSnow: s.wallet.snow, endDiamonds: s.wallet.diamonds };
}
function main() {
  const results = [610300, 0].flatMap(snow => [15, 60, 240].flatMap(minutes =>
    Array.from({ length: 40 }, (_, i) => run(314159 + i, minutes, snow))));
  const groups = [];
  for (const snow of [610300, 0]) for (const minutes of [15, 60, 240]) {
    const rs = results.filter(r => r.initial.snow === snow && r.visitMinutes === minutes);
    const summary = key => { const a = rs.map(r => r[key]).sort((a, b) => a - b); return { min: a[0], median: (a[19] + a[20]) / 2, max: a[39] }; };
    groups.push({ snow, minutes, completed: rs.filter(r => r.complete).length, hours: summary('hours'), clearHours: summary('clearHours'), spicyBought: summary('spicyBought') });
  }
  const out = { fingerprint: M.fingerprint, assumptions: 'Iron bookmark (STR25, 12 S2 wins), two opening snow balances; instant visits at fixed intervals including time zero; claim free jacket, refresh Throw and train affordable Accuracy on visits; before observed 100 S2 wins convert all snow to diamonds and buy maximum Spicy, equip it; afterwards save for 3000-diamond S3. Continuous combat and regular fallback follow live model. No Fire Flower or Ice; no user database, activation or live messages.', groups, results };
  const dir = path.resolve(__dirname, '../../artifacts/winter-iron-s3-policy-2026-11-02'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify(groups, null, 2));
}
if (require.main === module) main();
module.exports = { run };
