// Gate primitive for offline verification. Brown damage/unlock policy remains
// outside the early-progression model. A checkpoint never calls interact().
function fresh() { return { pieces: 0, armed: true, lastFoundAt: null }; }
function interact(gate, at, cooldownMs = 3600000) {
  if (gate.pieces < 9 && (gate.lastFoundAt === null || at - gate.lastFoundAt >= cooldownMs)) gate.armed = true;
}
function throwBrown(gate, at, random, chance = .01) {
  if (!gate.armed || gate.pieces >= 9 || random() >= chance) return false;
  gate.pieces++;
  gate.armed = false;
  gate.lastFoundAt = at;
  return true;
}
module.exports = { fresh, interact, throwBrown };
