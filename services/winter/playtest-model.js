// Development Chapter 0/1 engine. No Discord, database, wall clock or live data.
const { createHash } = require('node:crypto');
const rules = require('../../config/winter/chapters-2026-10-29.json');
const settings = require('../../config/winter/development-playtest.json');
const bookmarks = require('../../config/winter/playtest-bookmarks.json');
const { addedHp, passiveRate } = require('./early-progression');
const { idleStarted } = require('./playtest-discovery');
const { IDS, DIRTY_RECIPE, shuffleIngredients } = require('./recipes');
const HOUR = 3600000;
const fingerprint = createHash('sha256').update(JSON.stringify({ rules, settings, bookmarks })).digest('hex');
function change(s, resource, amount, source) {
  if (!Number.isSafeInteger(amount)) throw Error('Unsafe resource amount.');
  if (s.wallet[resource] + amount < 0 || !Number.isSafeInteger(s.wallet[resource] + amount)) throw Error(`Not enough ${resource}.`);
  if (resource === 'sweat' && amount > 0 && s.gymLessonReserve !== undefined && s.strength < 3) {
    if (!Number.isSafeInteger(s.gymLessonReserve + amount)) throw Error('Unsafe reserved Sweat amount.');
    s.gymLessonReserve += amount;
  } else s.wallet[resource] += amount;
  const direction = amount >= 0 ? 'gained' : 'spent';
  const ledger = s.ledger[direction]; ledger[resource] = (ledger[resource] || 0) + Math.abs(amount);
  const key = `${source}:${resource}:${direction}`; s.ledger.sources[key] = (s.ledger.sources[key] || 0) + Math.abs(amount);
}
function milestone(s, name) { if (s.milestones[name] === undefined) s.milestones[name] = s.now; }
function fresh(bookmark = 'chapter0', seed = 1) {
  if (!settings.bookmarks[bookmark]) throw Error('Unknown bookmark.');
  if (bookmark === 'iron') {
    const saved = bookmarks.iron;
    if (saved.balanceHash !== createHash('sha256').update(JSON.stringify(rules)).digest('hex')) throw Error('Iron bookmark requires regeneration for these balance inputs.');
    const s = structuredClone(saved.state), origin = s.now;
    s.fingerprint = fingerprint; s.version = settings.version; s.now = 0;
    s.nextPlayerAt -= origin; s.nextEnemyAt -= origin;
    s.bookmarkHistory = s.milestones;
    s.milestones = Object.fromEntries(Object.keys(s.milestones).map(key => [key, 0]));
    // A bookmarked run starts a new random stream while retaining the exact
    // resources and mid-fight checkpoint from its declared reference sample.
    s.rng = seed >>> 0 || 1;
    validate(s); return s;
  }
  const s = { version: settings.version, fingerprint, now: 0, chapter: 0, tier: 0,
    wallet: { snow: 0, diamonds: 0, regular: 0, red: 0, ice: 0, sweat: 0, buttons: 0, peppers: 0 },
    ledger: { gained: {}, spent: {}, sources: {} }, snowRemainder: 0, sweatRemainder: 0,
    dummyHp: 5, roughHp: 50, roughOwned: false, roughThrows: 0, wooden: false, diamondGift: false,
    redRecipe: false, oldStone: false, iceRecipe: false, gymEntered: false, gymUnlocked: false,
    strength: 0, accuracy: 0, defense: 0, special: 0, ironMaterial: false,
    equipped: 'regular', target: 1, owned: { 1: false, 2: false, 3: false }, active: false,
    playerHp: 50, enemyHp: 80, nextPlayerAt: 3000, nextEnemyAt: 10000, penalized: false,
    rng: seed >>> 0 || 1, milestones: {},
    tiers: Object.fromEntries([1, 2].map(t => [t, { wins: 0, losses: 0, attacks: 0, hits: 0, enemyAttacks: 0, enemyHits: 0, red: 0, regular: 0, ice: 0 }])) };
  if (bookmark === 'chapter0') change(s, 'snow', 10, 'starter');
  else {
    Object.assign(s, { chapter: 1, tier: 2, dummyHp: 0, roughHp: 0, roughOwned: true, roughThrows: 3, wooden: true, diamondGift: true, redRecipe: true, oldStone: true });
    milestone(s, 'stone');
    if (bookmark === 'gym') {
      s.owned[1] = true; s.gymUnlocked = true; enterGym(s);
      train(s, 'strength'); train(s, 'strength');
    }
  }
  return s;
}
function rng(s) { let x = s.rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; s.rng = x >>> 0; return s.rng / 4294967296; }
function rate(s) { return [1, 6, rules.stoneRate, rules.ironRate][s.tier]; }
function enemy(s) { const row = rules.snowmen[s.target - 1]; return { hp: row.hp + addedHp(s.tiers[s.target].wins), damage: row.damage + Math.floor(s.tiers[s.target].wins / 25), sweat: row.sweat }; }
function accrue(s, at) {
  const elapsed = at - s.now;
  const snow = elapsed * rate(s) + s.snowRemainder;
  change(s, 'snow', Math.floor(snow / 1000), 'gathering'); s.snowRemainder = snow % 1000;
  const sweat = elapsed * (s.liveRules && !s.gymUnlocked ? 0 : passiveRate(s.strength, rules)) + s.sweatRemainder;
  change(s, 'sweat', Math.floor(sweat / HOUR), 'passive'); s.sweatRemainder = sweat % HOUR; s.now = at;
}
function reset(s) { s.playerHp = 50; s.enemyHp = enemy(s).hp; s.nextEnemyAt = s.now + rules.enemyIntervalMs; }
function startCombat(s) {
  if (s.active) return;
  s.active = true; s.idleStarted = true;
  s.nextPlayerAt = Math.max(s.nextPlayerAt, Math.ceil((s.now + 1) / rules.playerIntervalMs) * rules.playerIntervalMs);
  s.nextEnemyAt = s.now + rules.enemyIntervalMs;
}
function settle(s, at) {
  if (!Number.isSafeInteger(at) || at < s.now || s.fingerprint !== fingerprint) throw Error('Invalid time or incompatible saved rules.');
  prepareLesson(s);
  if (s.liveRules && s.equipped !== 'regular' && !s.wallet[s.equipped]) s.equipped = 'regular';
  if (idleStarted(s)) s.idleStarted = true;
  // Four-hour chunks bound each processing segment, never the recoverable absence.
  while (s.now < at) {
    const end = Math.min(at, s.now + settings.chunkMs);
    if (s.active && s.owned[1] && s.chapter < 2) while (Math.min(s.nextPlayerAt, s.nextEnemyAt) <= end) {
      accrue(s, Math.min(s.nextPlayerAt, s.nextEnemyAt));
      const record = s.tiers[s.target];
      if (s.nextPlayerAt <= s.nextEnemyAt) {
        s.nextPlayerAt += rules.playerIntervalMs;
        let type = s.equipped;
        if (type !== 'regular' && !s.wallet[type]) type = 'regular';
        if (type === 'regular' && !s.wallet.regular && s.wallet.snow < rules.regularSnowCost) continue;
        if (type === 'regular' && !s.wallet.regular) change(s, 'snow', -rules.regularSnowCost, 'regular-attack');
        else change(s, type, -1, 'attack');
        if (s.liveRules && type !== 'regular' && !s.wallet[type]) s.equipped = 'regular';
        record.attacks++; record[type]++;
        const accuracy = s.penalized ? rules.defeatedAccuracy : rules.playerAccuracy + s.accuracy * rules.accuracyPerLevel;
        if (rng(s) < accuracy) {
          record.hits++;
          const damage = type === 'regular' ? rules.regularDamage * (1 + rules.strengthPerLevel * s.strength) : type === 'red' ? rules.redDamage : rules.iceDamage;
          s.enemyHp = Math.max(0, s.enemyHp - damage);
          if (s.enemyHp === 0) {
            const reward = enemy(s).sweat, eligible = !s.liveRules || s.gymUnlocked;
            const firstGymWin = s.liveRules && s.target === 1 && (!s.gymUnlocked || s.tutorialFlow === 2 && record.wins === 0 && !s.gymEntered);
            record.wins++;
            if (firstGymWin && !s.gymStarterFromVictory) { change(s, 'sweat', 5, 'combat'); s.gymStarterFromVictory = true; }
            else if (eligible) change(s, 'sweat', reward, 'combat');
            milestone(s, `firstWinS${s.target}`); if (record.wins === 100) milestone(s, `clearS${s.target}`);
            if (s.liveRules && s.target === 1 && (!s.gymUnlocked || s.tutorialFlow === 2 && record.wins === 1 && !s.gymEntered)) {
              s.gymUnlocked = true;
              if (s.tutorialFlow === 2) { s.tutorialStage = 'gym'; s.active = false; }
            }
            reset(s);
            if (!s.active) break;
          }
        }
      } else {
        s.nextEnemyAt += rules.enemyIntervalMs; record.enemyAttacks++;
        if (rng(s) < rules.enemyAccuracy) {
          record.enemyHits++; s.playerHp = Math.max(0, s.playerHp - enemy(s).damage);
          if (!s.playerHp) { record.losses++; s.penalized = true; if (!s.liveRules) s.gymUnlocked = true; milestone(s, 'firstLoss'); reset(s); }
        }
      }
    }
    accrue(s, end);
  }
  validate(s); return s;
}
function enterGym(s) {
  if (!s.gymUnlocked) throw Error('The Gym opens after your first S1 victory.');
  if (!s.gymEntered) { s.gymEntered = true; s.strength = 1; if (!s.gymStarterFromVictory) change(s, 'sweat', rules.gymStarterSweat, 'gym-gift'); milestone(s, 'gym'); }
  prepareLesson(s);
}
function prepareLesson(s) {
  if (s.gymEntered && s.strength < 3 && s.gymLessonReserve === undefined) {
    const budget = s.strength === 1 ? 5 : 3;
    s.gymLessonReserve = Math.max(0, s.wallet.sweat - budget);
    s.wallet.sweat -= s.gymLessonReserve;
  }
}
function train(s, skill) {
  if (!s.gymEntered || !['strength', 'accuracy'].includes(skill)) throw Error('Visit the Gym first.');
  if (skill === 'accuracy' && s.strength < 25) throw Error('Accuracy opens at STR25.');
  if (s[skill] >= rules.statCap) throw Error('This stat is at its test cap.');
  const cost = s.strength + s.accuracy + s.defense + s.special + 1;
  change(s, 'sweat', -cost, 'training'); s[skill]++;
  if (s.strength >= 3 && s.gymLessonReserve !== undefined) { s.wallet.sweat += s.gymLessonReserve; delete s.gymLessonReserve; }
  if (s.strength === 3) milestone(s, 'strength3');
  if (s.liveRules && s.tutorialFlow === 2 && s.strength >= 3 && !s.oldStone) s.tutorialStage = 'stone';
  if (s.strength >= 25) milestone(s, 'strength25');
}
function amount(s, q, resource, cost) {
  if (!['1', '10', '100', 'max'].includes(String(q || '1'))) throw Error('Invalid quantity.');
  const n = q === 'max' ? Math.floor(s.wallet[resource] / cost) : Number(q || 1);
  if (!n) throw Error('Not enough resources.'); return n;
}
function ammoAvailable(s, type) {
  if (type === 'regular') return s.wallet.regular > 0 || s.wallet.snow >= rules.regularSnowCost;
  return Boolean((type === 'red' ? s.redRecipe : type === 'ice' ? s.iceRecipe : false) && s.wallet[type] > 0);
}
function requireThat(condition, message) { if (!condition) throw Error(message); }
function action(s, name, q, { shopCurrency = 'snow' } = {}) {
  const liveShop = shopCurrency === 'diamonds';
  if (liveShop) s.liveRules = true;
  const shopCost = snow => liveShop ? snow / 1000 : snow;
  if (s.chapter0Pending) requireThat(['end-chapter0', 'status', 'help', 'shop', 'throw'].includes(name), 'Finish the Stone Shovel celebration with End of Chapter 0 to continue.');
  if (s.liveRules && s.tutorialStage === 'gym' && !s.gymEntered) requireThat(['train', 'status', 'help', 'throw'].includes(name), 'Visit Hendrix at the Gym to continue.');
  if (s.liveRules && s.tutorialStage === 'stone') requireThat(['shop', 'status', 'help', 'train', 'throw', 'diamonds', 'diamonds-convert', 'buy-old-stone'].includes(name), 'Ask Requia about the Old Skipping Stone to continue.');
  if (s.gymEntered && s.strength < rules.gymTutorialStrength) {
    requireThat(['train', 'train-strength', 'status', 'help'].includes(name), 'Complete Hendrix’s Strength lessons to reach Level 3 first.');
    if (name === 'train-strength') requireThat(q === undefined || String(q) === '1', 'Upgrade Strength once per lesson.');
  }
  if (s.chapter === 2) {
    requireThat(['status', 'help', 'throw', 'shop', 'kitchen', 'train', 'emporium', 'diamonds'].includes(name), 'Chapter 1 is complete. This test has ended.');
    return 'Chapter 1 is complete: S3 purchased. The next chapter is not enabled in this playtest.';
  }
  if (name === 'shop-help') { requireThat(!s.dummyHp && !s.wooden, 'Break the dummy first, or you already have the Wooden shovel.'); s.wooden = true; s.tier = 1; }
  else if (name === 'beg') { requireThat(s.wooden && !s.diamondGift, 'Your first diamond has already been claimed, or ask Requia for help first.'); s.diamondGift = true; change(s, 'diamonds', 1, 'tutorial-gift'); }
  else if (name === 'buy-snowman') { requireThat(s.wooden && !s.roughOwned, 'Ask Requia for help first, or you already own the Rough Snowman.'); change(s, 'diamonds', -1, 'rough-purchase'); s.roughOwned = true; }
  else if (name === 'craft' || name === 'diamonds-convert') {
    if (s.liveRules && name === 'craft') requireThat(s.dummyHp > 0 || s.roughOwned && !s.redRecipe && s.roughThrows < 3, 'Regular crafting is only needed for the dummy and three Rough practice throws.');
    const resource = name === 'craft' ? 'regular' : 'diamonds', cost = name === 'craft' ? 10 : 1000;
    requireThat(name === 'craft' || s.wooden, 'Ask Requia for help first.');
    const n = amount(s, q, 'snow', cost); change(s, 'snow', -n * cost, 'conversion'); change(s, resource, n, 'conversion');
  } else if (name === 'attack' || name === 'attack-spicy') {
    requireThat(!s.owned[1], 'Use Throw to continue the idle fight.');
    requireThat(s.dummyHp > 0 || s.roughOwned && s.roughHp > 0, 'Buy a practice target at the shop.');
    requireThat(s.dummyHp > 0 || s.roughThrows < 3 || s.redRecipe, 'Visit the Kitchen after three practice hits.');
    const spicy = name === 'attack-spicy'; requireThat(!spicy || s.redRecipe && !s.dummyHp, 'Discover Spicy Snowballs first.');
    if (s.liveRules && !s.dummyHp) requireThat(spicy || !s.redRecipe && s.roughThrows < 3, 'Use Spicy snowballs after the three Rough practice throws.');
    change(s, spicy ? 'red' : 'regular', -1, 'tutorial-attack');
    if (s.dummyHp) s.dummyHp = Math.max(0, s.dummyHp - 1);
    else { s.roughHp = Math.max(0, s.roughHp - (spicy ? 10 : 1)); s.roughThrows++; }
  } else if (name === 'pepper') { requireThat(s.roughOwned && s.roughThrows >= 3 && !s.redRecipe && s.wallet.peppers < 3, 'Throw three snowballs at Rough first, or this recipe is ready.'); change(s, 'peppers', 1, 'kitchen'); }
  else if (name === 'ingredient') {
    requireThat(s.redRecipe && IDS.includes(q), 'Choose a valid Kitchen ingredient after discovering Spicy.');
    s.recipeDraft ||= { ingredients: [], ingredientOrder: [...IDS] };
    requireThat(s.recipeDraft.ingredients.length < 7, 'A recipe can contain at most seven ingredients.');
    s.recipeDraft.ingredients.push(q);
    // UI shuffling has a separate saved random stream from combat rolls.
    s.recipeRng ||= (s.rng ^ 0x9e3779b9) >>> 0 || 1;
    s.recipeDraft.ingredientOrder = shuffleIngredients(s.recipeDraft.ingredientOrder, limit => {
      let n = s.recipeRng; n ^= n << 13; n ^= n >>> 17; n ^= n << 5; s.recipeRng = n >>> 0;
      return s.recipeRng % limit;
    });
  }
  else if (name === 'recipe-cancel') { if (s.wallet.peppers) change(s, 'peppers', -s.wallet.peppers, 'recipe-cancel'); if (s.recipeDraft) s.recipeDraft.ingredients = []; }
  else if (name === 'mix') {
    if (!s.redRecipe) {
      requireThat(s.wallet.peppers === 3, 'Add three peppers first.'); change(s, 'peppers', -3, 'recipe'); s.redRecipe = true; milestone(s, 'spicyRecipe');
    } else {
      const ingredients = s.recipeDraft?.ingredients || [];
      requireThat(ingredients.length >= 3 && ingredients.length <= 7, 'Recipes need three to seven ingredients.');
      const dirty = ingredients.join(',') === DIRTY_RECIPE.join(',');
      s.recipeDraft.ingredients = [];
      if (dirty && s.owned[1] && !s.dirtyRecipeUnlocked) { s.dirtyRecipeUnlocked = true; milestone(s, 'dirtyRecipe'); return 'You discovered the 🟤 Dirty Snowball recipe.'; }
      return dirty && s.dirtyRecipeUnlocked ? 'You already know this recipe: 🟤 Dirty Snowball.' : ingredients.length === 3 && ingredients.every(i => i === 'pepper') ? 'You already know this recipe: 🔴 Spicy Snowball.' : 'This combination did not unlock a recipe. Try another combination.';
    }
  }
  else if (name === 'buy-old-stone') {
    requireThat(s.redRecipe && !s.oldStone, 'Discover Spicy Snowballs first, or you already own Old Stone.');
    if (s.liveRules) requireThat(s.gymEntered && s.strength >= 3, 'Complete Hendrix’s Gym lessons first.');
    change(s, 'diamonds', -(s.liveRules ? 1 : 10), 'old-stone'); s.oldStone = true; s.tier = 2; s.chapter = 1; milestone(s, 'stone');
    if (s.liveRules) { s.tutorialStage = null; if (s.owned[1]) startCombat(s); }
  } else if (name === 'buy-sturdy') {
    requireThat(!s.owned[1] && s.roughOwned && !s.roughHp, 'Defeat the Rough Snowman first, or you already own Sturdy.');
    change(s, 'diamonds', -1, 'S1-purchase'); s.owned[1] = true; milestone(s, 'purchaseS1'); if (!s.liveRules) startCombat(s);
  } else if (name === 'end-chapter0') {
    requireThat(s.chapter0Pending && s.oldStone, 'This chapter transition is already finished.');
    s.chapter0Pending = false; s.chapter = 1; s.tutorialStage = null; milestone(s, 'chapter0');
    if (s.owned[1]) startCombat(s);
    validate(s);
    return 'Chapter 0 complete. Use `/snow shop` to stock up, or `/snow throw` to return to the fight.';
  } else if (name === 'buy-s2' || name === 'buy-s3') {
    const t = name === 'buy-s2' ? 2 : 3;
    requireThat(!s.owned[t] && s.owned[t - 1] && s.tiers[t - 1].wins >= 100, 'Requires 100 victories against the preceding snowman.');
    change(s, shopCurrency, -shopCost(rules.snowmen[t - 1].snowPrice), `S${t}-purchase`); s.owned[t] = true; milestone(s, `purchaseS${t}`);
    if (t === 3) { s.chapter = 2; s.active = false; milestone(s, 'chapter1'); }
  } else if (name === 'buy-ice-recipe') {
    requireThat(!liveShop || s.chapter > 1, 'Recipes become available after Chapter 1.');
    requireThat(s.redRecipe && !s.iceRecipe, 'Discover Spicy first, or you already know Ice.');
    change(s, shopCurrency, -shopCost(rules.iceRecipeSnowCost), 'ice-recipe'); s.iceRecipe = true; milestone(s, 'iceRecipe');
  } else if (name === 'buy-red-diamonds') {
    requireThat(s.redRecipe, 'Discover Spicy Snowballs first.');
    const n = amount(s, q, 'diamonds', 1); change(s, 'diamonds', -n, 'ammunition'); change(s, 'red', n, 'ammunition');
  } else if (name === 'buy-spicy' || name === 'buy-ice') {
    const ice = name === 'buy-ice', type = ice ? 'ice' : 'red', cost = ice ? rules.iceSnowCost : rules.redSnowCost;
    requireThat(ice ? s.iceRecipe : s.redRecipe, 'Discover this recipe first.');
    const n = amount(s, q, shopCurrency, shopCost(cost)); change(s, shopCurrency, -n * shopCost(cost), 'ammunition'); change(s, type, n, 'ammunition');
  } else if (name.startsWith('equip-')) {
    const type = name.slice(6); requireThat(['regular', 'red', 'ice'].includes(type) && (type === 'regular' || (type === 'red' ? s.redRecipe : s.iceRecipe)), 'This ammunition is not unlocked.');
    requireThat(ammoAvailable(s, type), 'No ammunition of that type is available. Restock it first.'); s.equipped = type;
  } else if (name === 'throw' || name === 'select-s1' || name === 'select-s2') {
    if (s.owned[1]) {
      if (name.startsWith('select-')) { const t = name === 'select-s1' ? 1 : 2; requireThat(s.owned[t], 'Purchase this snowman first.'); if (t !== s.target) { s.target = t; reset(s); } }
      // Refreshing Throw restores accuracy prospectively and never grants extra attacks.
      if (!s.liveRules || !s.tutorialStage) startCombat(s);
      s.penalized = false;
    }
  } else if (name === 'train') { enterGym(s); if (s.strength >= 3) s.gymLiftRevealed = true; }
  else if (name === 'train-strength' || name === 'train-accuracy') train(s, name.slice(6));
  else if (name === 'lift') { requireThat(s.gymEntered && s.strength >= 3 && !s.ironMaterial, 'Complete your Gym lessons first, or you already lifted this weight.'); if (s.strength < 25) return "Those scrawny arms can't lift this!"; s.ironMaterial = true; milestone(s, 'ironMaterial'); }
  else if (name === 'iron') { requireThat(s.oldStone && s.ironMaterial && s.strength >= 25 && s.tier === 2, 'Requires Stone, STR25 and the Gym lift material.'); change(s, shopCurrency, -shopCost(rules.ironSnowCost), 'iron'); s.tier = 3; milestone(s, 'iron'); }
  else requireThat(['status', 'help', 'shop', 'kitchen', 'emporium', 'diamonds'].includes(name), 'This control is unavailable in the Chapter 1 playtest.');
  validate(s); return null;
}
function validate(s) {
  for (const [resource, value] of Object.entries(s.wallet)) {
    const total = value + (resource === 'sweat' ? s.gymLessonReserve || 0 : 0);
    if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(total) || total !== (s.ledger.gained[resource] || 0) - (s.ledger.spent[resource] || 0)) throw Error(`Resource ledger mismatch: ${resource}`);
  }
  if (s.gymLessonReserve !== undefined && (!Number.isSafeInteger(s.gymLessonReserve) || s.gymLessonReserve < 0)) throw Error('Invalid reserved lesson Sweat.');
  if (s.active && (s.nextPlayerAt <= s.now || s.nextEnemyAt <= s.now)) throw Error('Combat checkpoint is overdue.');
  return true;
}
module.exports = { fresh, settle, action, validate, change, rate, enemy, ammoAvailable, fingerprint, rules, settings };
