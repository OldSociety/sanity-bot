// Completed victories belong to the individual tier. Optional statPercent
// scales the entire grown stat, retaining fractional HP and damage.
function addedHp(defeats) {
  if (!Number.isSafeInteger(defeats) || defeats < 0) throw Error('Invalid Snowman defeat count.');
  const q = Math.floor(defeats / 100), r = defeats % 100;
  const extra = q === 0 ? defeats : 100 + 500 * q * (q - 1) + 10 * q * r;
  if (!Number.isSafeInteger(extra)) throw Error('Invalid Snowman HP.');
  return extra;
}
const scaled = (row, value) => value * (row.statPercent ?? 100) / 100;
function hpAtDefeats(row, defeats) { return scaled(row, row.hp + addedHp(defeats)); }
function damageAtDefeats(row, defeats) {
  if (!Number.isSafeInteger(defeats) || defeats < 0) throw Error('Invalid Snowman defeat count.');
  const damage = row.openingDamage !== undefined && defeats < row.openingDefeats
    ? row.openingDamage : row.damage + Math.floor(defeats / 25);
  return scaled(row, damage);
}
module.exports = { addedHp, hpAtDefeats, damageAtDefeats };
