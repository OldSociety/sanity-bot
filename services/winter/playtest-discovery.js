// Player-facing discovery thresholds; diagnostic ledgers remain complete.
function idleStarted(s) {
  return Boolean(s.idleStarted || s.active || s.gymUnlocked || Object.values(s.tiers).some(t => t.attacks > 0));
}
function discovered(s) {
  const gained = s.ledger.gained;
  return { snow: true,
    regular: Boolean(gained.regular || s.wallet.regular || s.oldStone),
    diamonds: Boolean(gained.diamonds || s.wallet.diamonds || s.diamondGift || s.oldStone),
    red: Boolean(s.redRecipe), ice: Boolean(s.iceRecipe), sweat: s.liveRules ? Boolean(s.gymUnlocked) : idleStarted(s),
    buttons: Boolean(gained.buttons || s.wallet.buttons || s.milestones.firstButton !== undefined),
    kitchen: Boolean(s.redRecipe || s.roughOwned && s.roughThrows >= 3) };
}
module.exports = { discovered, idleStarted };
