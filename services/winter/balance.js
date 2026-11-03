// Shared arithmetic, used by the game and offline studies.
const { addedHp } = require('./snowman-scaling');
const HOUR = 3600000;
function passiveRate(strength, rules) {
  const passive = rules.passive;
  return Math.floor(strength <= passive.breakpoint ? strength / passive.divisor :
    passive.breakpoint / passive.divisor * (strength / passive.breakpoint) ** passive.exponent);
}
module.exports = { addedHp, passiveRate, HOUR };
