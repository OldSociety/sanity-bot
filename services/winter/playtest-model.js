// Development Chapter 0/1 engine. No Discord, database, wall clock or live data.
const { createHash } = require('node:crypto');
const rules = require('../../config/winter/chapters-2026-10-29.json');
const settings = require('../../config/winter/development-playtest.json');
const bookmarks = require('../../config/winter/playtest-bookmarks.json');
const emporium = require('../../config/winter/development-emporium.json');
const s4 = require('../../config/winter/development-s4.json');
const { addedHp, passiveRate } = require('./early-progression');
const { hpAtDefeats, damageAtDefeats } = require('./snowman-scaling');
const { idleStarted } = require('./playtest-discovery');
const { IDS, DIRTY_RECIPE, emojiFor, shuffleIngredients } = require('./recipes');
const HOUR = 3600000;
const fingerprint = createHash('sha256').update(JSON.stringify({ rules, settings, bookmarks, emporium, s4 })).digest('hex');
// Exact pre-November-1 rules/settings/bookmarks identity. Never accept arbitrary
// unknown saves or rewrite a historical bookmark as if it used the new balance.
const previousFingerprint = 'ba42c4ce39e3a310ad73a44fea4f6e1ef8c414ab4d7881ddf91f328908a2f8cc';
const openingFingerprint = '4e22df0938d4135ff66717cb7d4711d48b5c08bc381128a2869d77fcad792033';
const reducedFingerprint = 'ec5ec7db74902b44b55f927bd7119cce1d22e046b0ee352ca37e263c207200bf';
const ironPriceFingerprint = 'fbba4470c06a66485aae6b27a0de727ade811c3e3c9819b6f2da0c2db79308b3';
const earlyJacketFingerprint = '531372e46323c1cedf3f7be49806dbe4dee31eedcfccf38f5eaf35b000e02166';
const s3PriceFingerprint = '39c6325bee20248f5bcaf72223eb49f03f3764d1bdf30c024b7cdffc8d242ad4';
const previousBalanceHash = '79a292d802104b28667dc6ba33f044548c33401f7612a2ff179cf0d114467250';
const beforeS3Fingerprint = '1b6f0e5d681f4277dbb8731ed42f6aaba804ccaa4c027833b6201aa0ff4ea5a5';
const beforeEmporiumFingerprint = '99ffa9b58070290f1488882f2bff9d1ad8eeff893a817742bfe295b4ea312810';
const beforeSoupFingerprint = '07d173bc78330c4c2d833359a9027485ca355e2116aa406ff9b0ea58072fb433';
const beforeS4Fingerprint = '3d97382e1f1b109b135d33778827e03ca88d4c8ced6020c96e4a1d06f2a326aa';
const beforeIdolFingerprint = '35b555e4291edbb5a576645172afb3c4983e15c7811236d9e700073aa9793301';
function upgradeOpeningBalance(s) {
  if (s.fingerprint === fingerprint) return false;
  if (![previousFingerprint, openingFingerprint, reducedFingerprint, ironPriceFingerprint, earlyJacketFingerprint, s3PriceFingerprint, beforeS3Fingerprint, beforeEmporiumFingerprint, beforeSoupFingerprint, beforeS4Fingerprint, beforeIdolFingerprint].includes(s.fingerprint)) throw Error('Invalid time or incompatible saved rules.');
  const record = (id, to, beforeHp) => {
    s.balanceUpgrades = [...(s.balanceUpgrades || []), {
      id, at: s.now, from: s.fingerprint, to,
      target: s.target, beforeEnemyHp: beforeHp, afterEnemyHp: s.enemyHp,
    }];
    s.fingerprint = to;
  };
  if (s.fingerprint === previousFingerprint) {
    const beforeHp = s.enemyHp;
    if (s.target === 2) s.enemyHp = Math.min(beforeHp, Math.max(1, s.enemyHp - 25));
    record('s2-opening-2026-11-01', openingFingerprint, beforeHp);
  }
  if (s.fingerprint === openingFingerprint) {
    const beforeHp = s.enemyHp;
    if (s.target === 1 || s.target === 2) {
      const oldMaxHp = (s.target === 1 ? 80 : 155) + addedHp(s.tiers[s.target].wins);
      // Preserve damage already dealt; conversion cannot grant a victory.
      s.enemyHp = Math.min(beforeHp, Math.max(1, enemy(s).hp - Math.max(0, oldMaxHp - s.enemyHp)));
    }
    record('s1-s2-reduction-2026-11-01', reducedFingerprint, beforeHp);
  }
  if (s.fingerprint === reducedFingerprint) record('iron-price-2026-11-02', ironPriceFingerprint, s.enemyHp);
  if (s.fingerprint === ironPriceFingerprint) record('early-jacket-2026-11-02', earlyJacketFingerprint, s.enemyHp);
  if (s.fingerprint === earlyJacketFingerprint) record('s3-price-2026-11-02', s3PriceFingerprint, s.enemyHp);
  record(s.fingerprint === beforeIdolFingerprint ? 'golden-idol-2026-11-03' : s.fingerprint === beforeS4Fingerprint ? 's4-diagnostic-2026-11-02' : s.fingerprint === beforeSoupFingerprint ? 'soup-kitchen-2026-11-02' : s.fingerprint === beforeEmporiumFingerprint ? 'emporium-items-2026-11-02' : s.fingerprint === beforeS3Fingerprint ? 's3-diagnostic-2026-11-02' : 'defeat-threshold-2026-11-02', fingerprint, s.enemyHp);
  return true;
}
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
  if (bookmark === 's3') {
    const s = fresh('chapter1', seed);
    const tier = () => ({ wins: 0, losses: 0, attacks: 0, hits: 0, enemyAttacks: 0, enemyHits: 0, red: 0, regular: 0, ice: 0 });
    Object.assign(s, { s3Diagnostic: true, chapter: 2, tier: 3, strength: 25, gymEntered: true, gymUnlocked: true,
      ironMaterial: true, gymLiftRevealed: true, jacketOwned: true, emporiumIntroduced: true,
      target: 3, owned: { 1: true, 2: true, 3: true }, tiers: { 1: tier(), 2: tier(), 3: tier() }, playerHp: 100,
      active: false, buttonRng: (seed ^ 0x9e3779b9) >>> 0 || 1 });
    s.tiers[1].wins = s.tiers[2].wins = 100;
    s.enemyHp = enemy(s).hp; s.milestones = {};
    validate(s); return s;
  }
  if (bookmark === 'iron') {
    const saved = bookmarks.iron;
    const currentBalanceHash = createHash('sha256').update(JSON.stringify(rules)).digest('hex');
    if (![currentBalanceHash, previousBalanceHash].includes(saved.balanceHash)) throw Error('Iron bookmark requires regeneration for these balance inputs.');
    const s = structuredClone(saved.state), origin = s.now;
    s.fingerprint = saved.balanceHash === currentBalanceHash ? fingerprint : previousFingerprint;
    s.version = settings.version; s.now = 0;
    upgradeOpeningBalance(s);
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
    playerHp: 50, enemyHp: hpAtDefeats(rules.snowmen[0], 0), nextPlayerAt: 3000, nextEnemyAt: 10000, penalized: false,
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
function rate(s) { return [1, 6, rules.stoneRate, rules.ironRate, rules.goldenRate][s.tier]; }
function enemy(s) { const row = rules.snowmen[s.target - 1]; return { hp: hpAtDefeats(row, s.tiers[s.target].wins), damage: damageAtDefeats(row, s.tiers[s.target].wins), sweat: row.sweat }; }
function accrue(s, at) {
  const elapsed = at - s.now;
  const snow = elapsed * rate(s) + s.snowRemainder;
  change(s, 'snow', Math.floor(snow / 1000), 'gathering'); s.snowRemainder = snow % 1000;
  const sweat = elapsed * (s.liveRules && !s.gymUnlocked ? 0 : passiveRate(s.strength, rules)) + s.sweatRemainder;
  change(s, 'sweat', Math.floor(sweat / HOUR), 'passive'); s.sweatRemainder = sweat % HOUR; s.now = at;
}
function maxHp(s) { return rules.playerHp + (s.jacketOwned ? emporium.jacketBonusHp : 0) + (s.reinforcedJacketOwned ? emporium.reinforcedJacketBonusHp : 0); }
function reset(s) { s.playerHp = maxHp(s); s.enemyHp = enemy(s).hp; s.nextEnemyAt = s.now + rules.enemyIntervalMs; }
function resolveFight(s) {
  const record = s.tiers[s.target];
  // Resolve outgoing damage first: simultaneous knockouts belong to the player.
  if (s.enemyHp < rules.defeatBelowHp) {
    if (s.lastPlayerAttack) s.lastPlayerAttack.victory = true;
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
    reset(s); return true;
  }
  if (s.playerHp < rules.defeatBelowHp) {
    if (s.lastEnemyAttack) s.lastEnemyAttack.defeat = true;
    record.losses++; s.penalized = true; if (!s.liveRules) s.gymUnlocked = true; milestone(s, 'firstLoss'); reset(s); return true;
  }
  return false;
}
function startCombat(s) {
  if (s.active) return;
  if (s.liveRules) { delete s.lastPlayerAttack; delete s.lastEnemyAttack; }
  s.active = true; s.idleStarted = true;
  s.nextPlayerAt = Math.max(s.nextPlayerAt, Math.ceil((s.now + 1) / rules.playerIntervalMs) * rules.playerIntervalMs);
  s.nextEnemyAt = s.now + rules.enemyIntervalMs;
}
function settle(s, at) {
  if (!Number.isSafeInteger(at) || at < s.now) throw Error('Invalid time or incompatible saved rules.');
  upgradeOpeningBalance(s);
  prepareLesson(s);
  if (s.liveRules && s.equipped !== 'regular' && !ammoAvailable(s, s.equipped)) s.equipped = 'regular';
  if (idleStarted(s)) s.idleStarted = true;
  // Resolve a previously saved fractional remainder before another attack.
  if (s.active && s.owned[1] && (s.chapter < 2 || s.s3Diagnostic)) resolveFight(s);
  // Four-hour chunks bound each processing segment, never the recoverable absence.
  while (s.now < at) {
    const end = Math.min(at, s.now + settings.chunkMs);
    if (s.active && s.owned[1] && (s.chapter < 2 || s.s3Diagnostic)) while (Math.min(s.nextPlayerAt, s.nextEnemyAt) <= end) {
      accrue(s, Math.min(s.nextPlayerAt, s.nextEnemyAt));
      const record = s.tiers[s.target];
      if (s.nextPlayerAt <= s.nextEnemyAt) {
        s.nextPlayerAt += rules.playerIntervalMs;
        let type = s.equipped;
        if (type !== 'regular' && !ammoAvailable(s, type)) type = 'regular';
        const ammoCost = type === 'red' && s.fireFlowerOwned ? emporium.fireFlowerAmmo : 1;
        if (type === 'regular' && !s.wallet.regular && s.wallet.snow < rules.regularSnowCost) {
          if (s.liveRules) s.lastPlayerAttack = { at: s.now, target: s.target, type, outcome: 'waiting', damage: 0 };
          continue;
        }
        if (type === 'regular' && !s.wallet.regular) change(s, 'snow', -rules.regularSnowCost, 'regular-attack');
        else change(s, type, -ammoCost, 'attack');
        if (s.liveRules && type !== 'regular' && !ammoAvailable(s, type)) s.equipped = 'regular';
        record.attacks++; record[type] += ammoCost;
        if (s.s3Diagnostic && s.target >= rules.buttonMinimumTier) {
          let x = s.buttonRng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; s.buttonRng = x >>> 0;
          if (s.buttonRng / 4294967296 < rules.buttonChance) { change(s, 'buttons', 1, 'S3-throw'); milestone(s, 'firstButton'); }
        }
        const feedback = s.liveRules ? { at: s.now, target: s.target, type, ...(type === 'red' && s.fireFlowerOwned ? { fire: true } : {}), outcome: 'miss', damage: 0 } : null;
        if (feedback) s.lastPlayerAttack = feedback;
        const accuracy = s.penalized ? rules.defeatedAccuracy : rules.playerAccuracy + s.accuracy * rules.accuracyPerLevel;
        if (rng(s) < accuracy) {
          record.hits++;
          const immune = s.s3Diagnostic && s.target === 4 && !(type === 'red' && s.fireFlowerOwned);
          const damage = immune ? 0 : type === 'regular' ? rules.regularDamage * (1 + rules.strengthPerLevel * s.strength) : type === 'red' ? rules.redDamage * (s.fireFlowerOwned ? emporium.fireFlowerMultiplier : 1) : rules.iceDamage;
          if (feedback) { feedback.outcome = 'hit'; feedback.damage = Math.min(s.enemyHp, damage); if (immune) feedback.immune = true; }
          s.enemyHp = Math.max(0, s.enemyHp - damage);
          resolveFight(s);
          if (!s.active) break;
        }
      } else {
        s.nextEnemyAt += rules.enemyIntervalMs; record.enemyAttacks++;
        const feedback = s.liveRules ? { at: s.now, target: s.target, outcome: 'miss', damage: 0 } : null;
        if (feedback) s.lastEnemyAttack = feedback;
        if (rng(s) < rules.enemyAccuracy) {
          const damage = enemy(s).damage * (1 - Math.min(100, Math.max(0, s.defense || 0)) * 0.005);
          if (feedback) { feedback.outcome = 'hit'; feedback.damage = Math.min(s.playerHp, damage); }
          record.enemyHits++; s.playerHp = Math.max(0, s.playerHp - damage);
          resolveFight(s);
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
  if (!s.gymEntered || !['strength', 'accuracy', 'defense'].includes(skill)) throw Error('Visit the Gym first.');
  if (skill === 'accuracy' && s.strength < 25) throw Error('Accuracy opens at STR25.');
  if (skill === 'defense' && !s.lift50Completed) throw Error('Lift 50 lbs to unlock Endurance.');
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
  return Boolean((type === 'red' ? s.redRecipe : type === 'ice' ? s.iceRecipe : false) && s.wallet[type] >= (type === 'red' && s.fireFlowerOwned ? emporium.fireFlowerAmmo : 1));
}
function requireThat(condition, message) { if (!condition) throw Error(message); }
function action(s, name, q, { shopCurrency = 'snow', diagnostic = false, wallNow = Date.now() } = {}) {
  if (name === 'gym') name = 'train';
  const liveShop = shopCurrency === 'diamonds';
  if (liveShop) s.liveRules = true;
  const shopCost = snow => liveShop ? snow / 1000 : snow;
  if (name === 'hidden') {
    requireThat(s.tier >= 3, 'You’re not ready for that yet. Collect the Iron Shovel first.');
    return DIRTY_RECIPE.map(emojiFor).join('');
  }
  if (name.startsWith('garden-')) { requireThat(diagnostic, 'The Pond is available in diagnostic runs.'); const message = require('./playtest-garden').act(s, name, q); validate(s); return message; }
  if (s.chapter0Pending) requireThat(['end-chapter0', 'status', 'help', 'shop', 'throw'].includes(name), 'Finish the Stone Shovel celebration with End of Chapter 0 to continue.');
  if (s.liveRules && s.tutorialStage === 'gym' && !s.gymEntered) requireThat(['train', 'status', 'help', 'throw'].includes(name), 'Visit Hendrix at the Gym to continue.');
  if (s.liveRules && s.tutorialStage === 'stone') requireThat(['shop', 'status', 'help', 'train', 'throw', 'diamonds', 'diamonds-convert', 'buy-old-stone'].includes(name), 'Ask Requia about the Old Skipping Stone to continue.');
  if (s.gymEntered && s.strength < rules.gymTutorialStrength) {
    requireThat(['train', 'train-strength', 'status', 'help'].includes(name), 'Complete Hendrix’s Strength lessons to reach Level 3 first.');
    if (name === 'train-strength') requireThat(q === undefined || String(q) === '1', 'Upgrade Strength once per lesson.');
  }
  if (s.chapter === 2 && !s.s3Diagnostic) {
    requireThat(['status', 'help', 'throw', 'shop', 'kitchen', 'train', 'emporium', 'diamonds'].includes(name), 'Chapter 1 is complete. This test has ended.');
    return 'Chapter 1 is complete: S3 purchased. The next chapter is not enabled in this playtest.';
  }
  if (s.liveRules && name === 'throw' && s.tier >= 3 && !s.emporiumIntroduced && !s.jacketOwned) {
    s.emporiumIntroduced = true; s.jacketIntroPending = true; milestone(s, 'emporiumIntro');
    validate(s); return null;
  }
  if (s.jacketIntroPending) requireThat(['emporium', 'buy-jacket'].includes(name), 'Meet Azule and collect your free jacket to continue.');
  if (name === 'shop-help') { requireThat(!s.dummyHp && !s.wooden, 'Break the dummy first, or you already have the Wooden shovel.'); s.wooden = true; s.tier = 1; if (s.liveRules) s.woodenGiftPending = true; }
  else if (name === 'shop') {
    if (s.liveRules) {
      s.woodenGiftPending = false; s.diamondGiftPending = false; s.spicyUnlockPending = false;
      if (s.tutorialStage === 'stone') s.stoneShopVisited = true;
    }
  }
  else if (name === 'beg') { requireThat(s.wooden && !s.diamondGift, 'Your first diamond has already been claimed, or ask Requia for help first.'); s.diamondGift = true; change(s, 'diamonds', 1, 'tutorial-gift'); if (s.liveRules) s.diamondGiftPending = true; }
  else if (name === 'buy-snowman') { requireThat(s.wooden && !s.roughOwned, 'Ask Requia for help first, or you already own the Rough Snowman.'); change(s, 'diamonds', -1, 'rough-purchase'); s.roughOwned = true; if (s.liveRules) s.roughIntroPending = true; }
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
  } else if (name === 'kitchen') { if (s.liveRules && !s.redRecipe && s.roughThrows >= 3) s.kitchenVisited = true; }
  else if (name === 'pepper') { requireThat(s.roughOwned && s.roughThrows >= 3 && !s.redRecipe && s.wallet.peppers < 3, 'Throw three snowballs at Rough first, or this recipe is ready.'); change(s, 'peppers', 1, 'kitchen'); }
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
      requireThat(s.wallet.peppers === 3, 'Add three peppers first.'); change(s, 'peppers', -3, 'recipe'); s.redRecipe = true; milestone(s, 'spicyRecipe'); if (s.liveRules) s.spicyUnlockPending = true;
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
  } else if (name === 'buy-s4') {
    requireThat(s.s3Diagnostic && s.owned[3] && (s.tiers[3]?.wins || 0) >= s4.requiredS3Wins && !s.owned[4], 'Snowman 4 requires 100 S3 victories and must not already be owned.');
    change(s, 'diamonds', -s4.priceDiamonds, 'S4-purchase'); s.owned[4] = true;
    s.tiers[4] ||= { wins: 0, losses: 0, attacks: 0, hits: 0, enemyAttacks: 0, enemyHits: 0, red: 0, regular: 0, ice: 0 };
    milestone(s, 'purchaseS4'); return 'Snowman 4 unlocked. Fireballs can damage it.';
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
  } else if (name === 'throw' || name === 'select-s1' || name === 'select-s2' || (name === 'select-s3' || name === 'select-s4') && s.s3Diagnostic) {
    if (s.liveRules) s.roughIntroPending = false;
    if (s.owned[1]) {
      if (name.startsWith('select-')) { const t = Number(name.slice(-1)); requireThat(s.owned[t], 'Purchase this snowman first.'); if (t !== s.target) { s.target = t; reset(s); delete s.lastPlayerAttack; delete s.lastEnemyAttack; } }
      // Refreshing Throw restores accuracy prospectively and never grants extra attacks.
      if (!s.liveRules || !s.tutorialStage) startCombat(s);
      s.penalized = false;
    }
  } else if (name === 'train') { enterGym(s); if (s.strength >= 3) { s.gymLiftRevealed = true; s.gymVisits = (s.gymVisits || 0) + 1; } }
  else if (['train-strength', 'train-accuracy', 'train-defense'].includes(name)) train(s, name.slice(6));
  else if (name === 'buy-jacket') {
    requireThat(s.emporiumIntroduced && s.jacketIntroPending && !s.jacketOwned, 'Meet Azule first, or you already own the jacket.');
    s.jacketOwned = true; s.jacketIntroPending = false; s.playerHp += emporium.jacketBonusHp; milestone(s, 'jacket');
  }
  else if (name === 'buy-fire-flower') {
    requireThat(s.jacketOwned && !s.fireFlowerOwned, 'Collect your jacket first, or you already own the Fire Flower.');
    change(s, 'buttons', -emporium.fireFlowerButtons, 'fire-flower'); s.fireFlowerOwned = true; milestone(s, 'fireFlower');
    if (s.liveRules && s.equipped === 'red' && !ammoAvailable(s, 'red')) s.equipped = 'regular';
  }
  else if (name === 'buy-reinforced-jacket') {
    requireThat(s.s3Diagnostic && s.fireFlowerOwned && !s.reinforcedJacketOwned, 'The reinforced jacket is unavailable or already owned.');
    change(s, 'buttons', -emporium.reinforcedJacketButtons, 'reinforced-jacket'); s.reinforcedJacketOwned = true; milestone(s, 'reinforcedJacket');
    return "Congratulations, now you won't take as many hits. Just watch the face. 100 HP -> 150 HP";
  }
  else if (name === 'buy-soup-kitchen') {
    requireThat(s.s3Diagnostic && s.reinforcedJacketOwned && !s.soupKitchenOwned, 'The Soup Kitchen fund is unavailable or already supported.');
    change(s, 'buttons', -emporium.soupKitchenButtons, 'soup-kitchen'); s.soupKitchenOwned = true; milestone(s, 'soupKitchen');
    return 'Excellent. With your support Kylax was able to start a donation fund for the needy. Head over there and spare what you can.';
  }
  else if (name === 'buy-golden-idol') {
    requireThat(s.s3Diagnostic && s.soupKitchenOwned && s.tier === 3 && !s.goldenIdolOwned, 'The Golden Idol is unavailable or already owned.');
    change(s, 'buttons', -emporium.goldenIdolButtons, 'golden-idol'); s.goldenIdolOwned = true; milestone(s, 'goldenIdol');
    return "I didn't even realize that was there. I wonder what its for?";
  }
  else if (name === 'buy-golden-shovel') {
    requireThat(s.s3Diagnostic && s.goldenIdolOwned && s.tier === 3, 'The Golden Shovel is unavailable or already owned. Bring the Golden Idol to Requia.');
    s.goldenIdolOwned = false; s.tier = 4; milestone(s, 'goldenShovel');
    return `Golden Shovel purchased. Snow production is now ${rules.goldenRate} per second.`;
  }
  else if (name === 'lift') {
    requireThat(s.gymEntered && s.strength >= 3 && !s.lift50Completed, 'Complete your Gym lessons first, or you already lifted this weight.');
    if (s.strength < (s.ironMaterial ? 50 : 25)) return "Those scrawny arms can't lift this!";
    if (!s.ironMaterial) { s.ironMaterial = true; milestone(s, 'ironMaterial'); }
    else { s.lift50Completed = true; milestone(s, 'lift50'); return 'You lifted 50 lbs! Endurance training unlocked.'; }
  }
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
  if (s.foodDonatedTenths !== undefined && (!Number.isSafeInteger(s.foodDonatedTenths) || s.foodDonatedTenths < 0)) throw Error('Invalid donated food weight.');
  if (s.garden?.heldTenths !== undefined && (!Number.isSafeInteger(s.garden.heldTenths) || s.garden.heldTenths < 0)) throw Error('Invalid Pond weight.');
  if (s.active && (s.nextPlayerAt <= s.now || s.nextEnemyAt <= s.now)) throw Error('Combat checkpoint is overdue.');
  return true;
}
module.exports = { fresh, settle, action, validate, change, rate, enemy, maxHp, ammoAvailable, fingerprint, rules, settings, emporium, s4, upgradeOpeningBalance };
