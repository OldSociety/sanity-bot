function nextCommand({
  progress,
  shopProgress,
  kitchen,
  battle
}) {
  if (battle.buttonIntroPending) return 'emporium';
  if (progress.dummyHp > 0) return 'throw';
  if (!shopProgress.helped) return 'shop';
  if (!progress.diamondsUnlocked) return 'diamonds';
  if (!shopProgress.snowmanOwned) return 'shop';
  if (!kitchen.spicyUnlocked) return shopProgress.snowmanHp <= 47 ? 'kitchen' : 'throw';
  if (!battle.sturdyOwned) return shopProgress.snowmanHp > 0 ? kitchen.spicy ? 'throw' : 'shop' : 'shop';
  return battle.trainIntroPending ? 'train' : 'throw';
}
function commandReady(action, {
  progress,
  shopProgress,
  kitchen,
  battle
}) {
  if (['snow-slots', 'snow-spin', 'buy-outfit', 'buy-mittens', 'buy-fire-flower', 'emporium', 'slots', 'slots-bet', 'slots-spin', 'slots-collect'].includes(action)) return Boolean(battle.emporiumUnlocked);
  if (['opponents','battle-opponent'].includes(action)) return Boolean(battle.sturdyOwned);
  if (action === 'shop') return progress.dummyHp === 0;
  if (['diamonds', 'shovel'].includes(action)) return Boolean(shopProgress.helped);
  if (action === 'kitchen') return Boolean(kitchen.spicyUnlocked || shopProgress.snowmanOwned && shopProgress.snowmanHp <= 47);
  if (['lift20', 'train-select', 'train-dodge', 'train-speed', 'train-special', 'train', 'train-strength', 'train-accuracy', 'train-defense', 'train-attack', 'lift'].includes(action)) return Boolean(battle.trainUnlocked);
  if (action === 'opponent-hendrix') return Boolean(battle.hendrixUnlocked);
  if (action === 'opponent-requia') return Boolean(battle.requiaUnlocked);
  if (action === 'buy-recipe') return Boolean(battle.sturdyOwned);
  if (action === 'hidden') return Boolean(battle.sturdyOwned);
  return true;
}
module.exports = {
  nextCommand,
  commandReady
};
