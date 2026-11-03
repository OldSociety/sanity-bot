const { discovered, idleStarted } = require('./playtest-discovery');
const navigation = new Set(['status', 'help', 'throw', 'shop', 'diamonds', 'kitchen', 'gym', 'train', 'emporium', 'slots', 'hidden']);
const stage = (id, page, actions, view = null) => ({ id, page, actions: new Set(actions), view });

// Derive the required step from saved progress, never from a Discord message
// or an in-memory collector. Resource pages stay available where needed.
function step(s) {
  if (s.liveRules && s.jacketIntroPending) return stage('jacket-introduction', 'emporium', ['emporium', 'buy-jacket']);
  if (!s.liveRules || s.tutorialFlow !== 2 || s.chapter !== 0 && !s.chapter0Pending) return null;
  const known = discovered(s);
  if (s.chapter0Pending) return stage('stone-celebration', 'shop', ['end-chapter0'], 'stone-unlocked');
  if (s.gymEntered && s.strength < 3) return stage('gym-lessons', 'train', ['train', 'train-strength']);
  if (s.gymUnlocked && !s.gymEntered) return stage('gym-invitation', 'throw', ['train'], 'battle-defeat');
  if (s.gymEntered && s.strength >= 3 && !s.oldStone) return s.stoneShopVisited
    ? stage('stone-shop', 'shop', ['shop', 'diamonds', 'diamonds-convert', 'buy-old-stone'])
    : stage('gym-complete', 'train', ['shop']);
  if (s.dummyHp > 0) return !s.uiWelcomed
    ? stage('welcome', 'status', ['throw', 'status', 'help'])
    : stage('dummy', 'throw', ['throw', 'craft', 'attack']);
  if (!s.wooden) return stage('broken-dummy', 'throw', ['throw', 'shop', 'shop-help']);
  if (s.woodenGiftPending) return stage('wooden-gift', 'shop', ['shop'], 'shovel-gift');
  if (s.diamondGiftPending) return stage('diamond-gift', 'diamonds', ['shop'], 'diamond-gift');
  if (!known.diamonds && !s.roughOwned) return stage('first-diamond', 'diamonds', ['shop', 'diamonds', 'beg', 'diamonds-convert']);
  if (!s.roughOwned) return stage('rough-shop', 'shop', ['shop', 'buy-snowman', 'diamonds', 'diamonds-convert']);
  if (s.roughIntroPending) return stage('rough-introduction', 'throw', ['throw'], 'snowman-purchased');
  if (!s.redRecipe && s.roughThrows < 3) return stage('rough-practice', 'throw', ['throw', 'craft', 'attack']);
  if (!s.redRecipe) return s.kitchenVisited || s.wallet.peppers > 0
    ? stage('first-recipe', 'kitchen', ['kitchen', 'pepper', 'mix', 'recipe-cancel'])
    : stage('rough-slow', 'throw', ['throw', 'kitchen']);
  if (s.spicyUnlockPending) return stage('spicy-unlock', 'shop', ['shop'], 'spicy-unlocked');
  if (!s.spicyShopGiftClaimed) return stage('spicy-gift', 'shop', ['shop'], 'spicy-unlocked');
  if (s.roughHp > 0) return stage('rough-spicy', 'throw', ['throw', 'attack-spicy', 'shop', 'buy-spicy', 'buy-red-diamonds', 'diamonds', 'diamonds-convert']);
  if (!s.owned[1]) return stage('sturdy-shop', 'throw', ['throw', 'shop', 'buy-sturdy', 'diamonds', 'diamonds-convert']);
  if (!idleStarted(s)) return stage('sturdy-introduction', 'throw', ['throw'], 'sturdy-purchased');
  return stage('first-s1', 'throw', ['throw', 'shop', 'buy-spicy', 'buy-red-diamonds', 'diamonds', 'diamonds-convert', 'equip-regular', 'equip-red']);
}
module.exports = { step, navigation };
