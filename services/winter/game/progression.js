// Stage availability follows earned progress, not which diagnostic bookmark ran.
function chapterTwo(state) {
  return state.chapter >= 2 && Boolean(state.owned[3]);
}
function prepareChapterTwo(state) {
  if (!chapterTwo(state)) return;
  state.tiers[3] ||= {
    wins: 0,
    losses: 0,
    attacks: 0,
    hits: 0,
    enemyAttacks: 0,
    enemyHits: 0,
    red: 0,
    regular: 0,
    ice: 0
  };
  state.buttonRng ||= (state.rng ^ 0x9e3779b9) >>> 0 || 1;
}
function nextGoal(state, rules, s4) {
  if (state.chapter === 0 || !state.owned[1]) return null;
  if (!state.owned[2])
    return state.tiers[1].wins < 100
      ? `Snowman 2: ${state.tiers[1].wins}/100 victories against Snowman 1.`
      : 'Snowman 2 is ready to unlock at /snow shop.';
  if (!state.owned[3])
    return state.tiers[2].wins < 100
      ? `Snowman 3: ${state.tiers[2].wins}/100 victories against Snowman 2, then ${
          rules.snowmen[2].snowPrice / rules.diamondSnowCost
        } diamonds at /snow shop.`
      : `Snowman 3 is ready at /snow shop for ${
          rules.snowmen[2].snowPrice / rules.diamondSnowCost
        } diamonds.`;
  if (!state.owned[4])
    return (state.tiers[3]?.wins || 0) < s4.requiredS3Wins
      ? `Snowman 4: ${state.tiers[3]?.wins || 0}/${
          s4.requiredS3Wins
        } victories against Snowman 3, then ${s4.priceDiamonds} diamonds at /snow shop.`
      : `Snowman 4 is ready at /snow shop for ${s4.priceDiamonds} diamonds. Fireballs can damage it.`;
  if (state.tier < 4)
    return 'Keep throwing to earn sapphire Buttons. Visit /snow emporium for the next trade.';
  return null;
}
module.exports = { chapterTwo, prepareChapterTwo, nextGoal };
