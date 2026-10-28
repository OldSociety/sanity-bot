const {
  randomUUID,
  randomInt
} = require('node:crypto');
const config = Object.freeze(require('../../config/winter/combat.json'));
const opponents = require('./opponents');
function add(value, amount) {
  const result = BigInt(value) + BigInt(amount);
  if (result < 0n || result > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('Winter balance exceeds the safe integer range.');
  return Number(result);
}
function derived(state, s = config) {
  const g = state.gym || {};
  return {
    maxHp: state.outfitOwned ? s.outfitMaxHp : state.mittensOwned ? s.mittenMaxHp : s.playerMaxHp,
    multiplier: 1 + (g.strength || 0) * s.strengthPerLevel,
    specialMultiplier: 1 + (g.special || 0) * s.specialPerLevel,
    accuracy: Math.min(1, s.playerAccuracy + (g.accuracy || 0) * s.accuracyPerLevel),
    dodge: Math.min(s.maxDodge, (g.dodge || 0) * s.dodgePerLevel),
    interval: s.playerIntervalMs
  };
}
function freshBattle(s = config) {
  return {
    modelVersion: 5,
    snowmanId: opponents.FIRST,
    snowmanWins: {},
    fightId: randomUUID(),
    sturdyOwned: 0,
    idleStarted: 0,
    defeated: 0,
    sweat: 0,
    sweatUnlocked: 0,
    playerHp: s.playerMaxHp,
    enemyHp: s.sturdyBaseHp,
    enemyMaxHp: s.sturdyBaseHp,
    active: 0,
    phase: 'locked',
    pauseAt: 0,
    nextPlayerAt: 0,
    nextEnemyAt: 0,
    specialReadyAt: 0,
    trainUnlocked: 0,
    gymVisited: 0,
    gymStarterClaimed: 0,
    zeroButtonThrows: 0,
    zeroButtonWindowActive: 0,
    trainIntroPending: 0,
    losses: 0,
    throws: 0,
    hits: 0,
    enemyAttacks: 0,
    enemyHits: 0,
    dirtyUnlocked: 0,
    dirty: 0,
    dirtyProgress: 0,
    spicyPurchased: 0,
    gym: {
      strength: 0,
      accuracy: 0,
      dodge: 0,
      special: 0
    },
    gymUnlocked: {
      strength: 1,
      accuracy: 0,
      dodge: 0,
      special: 0
    },
    trainingSkill: 'strength',
    weight20: 0,
    ironMaterial: 0,
    ironShovelOwned: 0,
    queueCapacity: s.queueInitialCapacity,
    queue: [],
    outfitOwned: 0,
    mittensOwned: 0,
    fireFlowerOwned: 0,
    weightStage: 0,
    clothingOwned: ['starting'],
    equippedClothing: 'starting',
    hendrixUnlocked: 0,
    requiaUnlocked: 0,
    nextChallengerUnlocked: 0,
    secretRecipeFound: 0,
    stunRemaining: 0,
    stunnedAttacks: 0,
    buttons: 0,
    buttonsUnlocked: 0,
    buttonIntroPending: 0,
    emporiumUnlocked: 0,
    slots: null,
    lastEvent: '',
    revision: 0
  };
}
function migrate(state, now, s = config) {
  if (state.modelVersion === 5) return false;
  if (state.modelVersion === 4) {
    state.snowmanId = opponents.FIRST;
    state.snowmanWins = { [opponents.FIRST]: state.defeated };
    state.modelVersion = 5;
    return true;
  }
  if (state.modelVersion === 3) {
    state.legacySpeed = state.gym.speed || 0;
    state.gym.special ??= state.legacySpeed;
    state.gymUnlocked.special ??= state.gymUnlocked.speed || 0;
    delete state.gym.speed;
    delete state.gymUnlocked.speed;
    if (state.trainingSkill === 'speed') state.trainingSkill = 'special';
    state.nextPlayerAt = now + s.playerIntervalMs;
    state.modelVersion = 4;
    migrate(state, now, s);
    return true;
  }
  if (state.modelVersion === 2) {
    state.mittensOwned ??= 0;
    state.fireFlowerOwned ??= 0;
    state.weightStage ??= 0;
    state.gymUnlocked = { strength: 1, accuracy: Number(state.weightStage >= 1), dodge: Number(state.weightStage >= 2), speed: Number(state.weightStage >= 3) };
    state.playerHp = Math.min(state.playerHp, derived(state, s).maxHp);
    const damage = Math.max(0, state.enemyMaxHp - state.enemyHp);
    state.enemyMaxHp = s.sturdyBaseHp + state.defeated;
    state.enemyHp = Math.max(1, state.enemyMaxHp - damage);
    state.modelVersion = 3;
    migrate(state, now, s);
    return true;
  }
  const g = state.gym || {},
    hp = state.playerHp,
    max = state.enemyMaxHp;
  const defaults = freshBattle(s);
  for (const [k, v] of Object.entries(defaults)) if (state[k] === undefined) state[k] = v;
  state.legacyGym = {
    ...g
  };
  state.gym = {
    strength: g.strength || 0,
    accuracy: g.accuracy || 0,
    dodge: g.dodge ?? g.defense ?? 0,
    speed: g.speed ?? g.attack ?? 0
  };
  state.gymUnlocked = {
    strength: 1,
    accuracy: 1,
    dodge: 1,
    speed: 1
  };
  state.playerHp = hp > 0 ? Math.max(1, derived(state, s).maxHp - Math.max(0, 10 - hp)) : 0;
  state.enemyMaxHp = s.sturdyBaseHp;
  state.enemyHp = Math.max(1, s.sturdyBaseHp - Math.max(0, (max || 100) - (state.enemyHp || 0)));
  state.nextChallengerUnlocked ||= Number(state.defeated >= s.challengerVictories);
  state.queue = [];
  if (state.active) {
    state.active = 0;
    state.phase = 'paused';
    state.pauseAt = now;
    state.nextPlayerAt = now + derived(state, s).interval;
    state.nextEnemyAt = now + s.enemyIntervalMs;
  }
  state.modelVersion = 2;
  migrate(state, now, s);
  return true;
}
const hasStarted = state => Boolean(state.sturdyOwned && (state.idleStarted || state.nextPlayerAt > 0));
function creditThrow(state) {
  if (!hasStarted(state)) return;
  state.throws = add(state.throws, 1);
  if (!state.buttons) {
    if (!state.zeroButtonWindowActive) state.zeroButtonThrows = 0;
    state.zeroButtonWindowActive = 1;
    state.zeroButtonThrows = add(state.zeroButtonThrows || 0, 1);
  } else {
    state.zeroButtonWindowActive = 0;
    state.zeroButtonThrows = 0;
  }
  if (state.dirtyUnlocked && ++state.dirtyProgress >= 5) {
    state.dirty = add(state.dirty, 1);
    state.dirtyProgress = 0;
  }
}
function buttonDrop(state, at, random, s, test = false) {
  if (!state.buttons && (state.zeroButtonThrows || 0) < s.buttonDropMinimumThrows) return;
  const chance = state.buttons === 0 ? s.emptyButtonDropChance : s.buttonDropChance;
  if (!random || !test && random() >= chance) return;
  state.buttons = add(state.buttons || 0, 1);
  state.zeroButtonWindowActive = 0;
  state.zeroButtonThrows = 0;
  if (!state.buttonsUnlocked) {
    state.buttonsUnlocked = 1;
    state.emporiumUnlocked = 1;
    state.buttonIntroPending = 1;
    state.active = 0;
    state.phase = 'paused';
    state.pauseAt = at;
  }
}
function won(state, at, s = config, dropRandom, testing = false) {
  const unlockedBefore = new Set(opponents.available(state,s).map(enemy=>enemy.id));
  const enemy = opponents.current(state,s);
  state.snowmanWins ??= {};
  state.snowmanWins[enemy.id] = add(opponents.wins(state,enemy.id),1);
  state.defeated = add(state.defeated, 1);
  state.sweat = add(state.sweat, enemy.sweat);
  state.sweatUnlocked = 1;
  state.nextChallengerUnlocked ||= Number(state.defeated >= s.challengerVictories);
  state.enemyMaxHp = enemy.baseHp + opponents.wins(state,enemy.id);
  state.enemyHp = state.enemyMaxHp;
  state.stunRemaining = 0;
  state.playerHp = derived(state, s).maxHp;
  state.nextPlayerAt = at + derived(state, s).interval;
  state.nextEnemyAt = at + enemy.intervalMs;
  state.lastEvent = `Snowman defeated! +${enemy.sweat}💦. Both fighters start the next fight at full health.`;
  const newOpponents = opponents.available(state,s).filter(enemy=>!unlockedBefore.has(enemy.id));
  if(newOpponents.length) state.lastEvent += ' New opponent unlocked: '+newOpponents.map(enemy=>enemy.name).join(', ')+'.';
}
function throwAtEnemy(state, at, damage, random, s = config, dropRandom, testing = false, special = false) {
  creditThrow(state);
  const stats = derived(state, s),
    hit = random() < stats.accuracy;
  if (hit) {
    state.hits = add(state.hits, 1);
    const amount = damage * (special ? stats.specialMultiplier : stats.multiplier);
    state.enemyHp = Math.max(0, state.enemyHp - amount);
    state.lastEvent = `Your snowball hit for ${Math.floor(amount)} damage.`;
    if (!state.enemyHp) won(state, at, s, dropRandom);
    buttonDrop(state, at, dropRandom, s);
    if (testing && !state.buttonsUnlocked && state.throws >= s.testButtonAfterThrows) buttonDrop(state, at, () => 0, s, true);
  } else state.lastEvent = 'Your snowball missed.';
  state.revision = add(state.revision, 1);
  return hit;
}
function throwDirty(state, random, s = config, dropRandom, at = 0, testing = false) {
  creditThrow(state);
  const hit = random() < derived(state, s).accuracy;
  if (hit) {
    state.hits = add(state.hits, 1);
    let turns = 1;
    if (random() < s.dirtyStunSecondChance) {
      turns = 2;
      if (random() < s.dirtyStunThirdChance) turns = 3;
    }
    state.stunRemaining = turns;
    state.lastEvent = `Your Dirty Snowball stunned the snowman for ${turns} turns!`;
    buttonDrop(state, at, dropRandom, s);
    if (testing && !state.buttonsUnlocked && state.throws >= s.testButtonAfterThrows) buttonDrop(state, at, () => 0, s, true);
  } else state.lastEvent = 'Your Dirty Snowball missed.';
  state.revision = add(state.revision, 1);
  return hit;
}
function enqueue(state, item, kitchen) {
  if (!state.active) return 'Start a fight first.';
  if (item === 'dirty' && state.stunRemaining > 0) return 'The snowman is already stunned.';
  if (state.queue.length >= state.queueCapacity) return 'Your special queue is full.';
  const stock = item === 'spicy' ? kitchen.spicy : state.dirty,
    reserved = state.queue.filter(q => q === item).length;
  if (stock < (reserved + 1) * (item === 'spicy' && state.fireFlowerOwned ? config.fireFlowerAmmo : 1)) return 'You need more ammunition.';
  state.queue.push(item);
  return `${item === 'spicy' ? '🔴' : '🟤'} queued.`;
}
function advanceBattle(player, state, now, accrueTo, random, s = config, dropRandom, testing = false, kitchen = {
  spicy: 0
}) {
  let events = 0;
  while (state.active && Math.min(state.nextPlayerAt, state.nextEnemyAt) <= now && events++ < s.maxEventsPerSettlement) {
    const at = Math.min(state.nextPlayerAt, state.nextEnemyAt),
      stats = derived(state, s);
    accrueTo(at);
    if (state.nextPlayerAt <= state.nextEnemyAt) {
      state.nextPlayerAt = at + stats.interval;
      const item = state.queue[0];
      if (item && at >= state.specialReadyAt && !(item === 'dirty' && state.stunRemaining > 0) && (item === 'spicy' ? kitchen.spicy >= (state.fireFlowerOwned ? s.fireFlowerAmmo : 1) : state.dirty > 0)) {
        state.queue.shift();
        if (item === 'spicy' && kitchen.spicy >= (state.fireFlowerOwned ? s.fireFlowerAmmo : 1)) {
          kitchen.spicy -= state.fireFlowerOwned ? s.fireFlowerAmmo : 1;
          state.specialReadyAt = at + s.specialCooldownMs;
          throwAtEnemy(state, at, s.specialDamage * (state.fireFlowerOwned ? s.fireFlowerMultiplier : 1), random, s, dropRandom, testing, true);
        } else if (item === 'dirty' && state.dirty > 0) {
          state.dirty--;
          state.specialReadyAt = at + s.specialCooldownMs;
          throwDirty(state, random, s, dropRandom, at, testing);
        }
      } else if (player.snow >= s.regularSnowCost) {
        player.snow -= s.regularSnowCost;
        throwAtEnemy(state, at, s.regularDamage, random, s, dropRandom, testing);
      } else {
        state.lastEvent = 'Waiting for enough ❄️ to throw.';
        state.nextPlayerAt = at + Math.max(1, Math.ceil(((s.regularSnowCost - player.snow) * 1000 - (player.remainder || 0)) / (player.productionRate || 1)));
      }
    } else {
      const enemy = opponents.current(state,s);
      state.nextEnemyAt = at + enemy.intervalMs;
      if (state.stunRemaining > 0) {
        state.stunRemaining--;
        state.stunnedAttacks++;
        state.lastEvent = 'The snowman is stunned and skips its attack.';
        continue;
      }
      state.enemyAttacks = add(state.enemyAttacks, 1);
      if (random() < s.enemyAccuracy * (1 - stats.dodge)) {
        state.enemyHits = add(state.enemyHits, 1);
        state.playerHp = Math.max(0, state.playerHp - enemy.damage);
        state.lastEvent = `The snowman hit you for ${enemy.damage} damage.`;
        if (!state.playerHp) {
          state.active = 0;
          state.phase = 'defeat';
          state.losses = add(state.losses, 1);
          state.trainUnlocked = 1;
          state.trainIntroPending = 1;
          state.queue = [];
        }
      } else state.lastEvent = 'You dodged the snowman’s attack.';
    }
  }
  if (state.active && Math.min(state.nextPlayerAt, state.nextEnemyAt) <= now) {
    state.active = 0;
    state.phase = 'paused';
    state.pauseAt = Math.min(state.nextPlayerAt, state.nextEnemyAt);
    state.lastEvent = 'Choose Snowman to continue.';
  }
  accrueTo(now);
}
function startBattle(state, now, s = config) {
  const stats = derived(state, s);
  state.fightId = randomUUID();
  state.idleStarted = 1;
  state.sweatUnlocked = 1;
  state.active = 1;
  state.phase = 'fighting';
  state.playerHp = stats.maxHp;
  const enemy = opponents.current(state,s);
  state.enemyMaxHp = enemy.baseHp + opponents.wins(state,enemy.id);
  state.enemyHp = state.enemyMaxHp;
  state.stunRemaining = 0;
  state.queue = [];
  state.nextPlayerAt = now + stats.interval;
  state.nextEnemyAt = now + enemy.intervalMs;
  state.specialReadyAt = Math.max(now, state.specialReadyAt);
  state.lastEvent = '';
}
const drawAccuracy = () => randomInt(0x1000000) / 0x1000000;
module.exports = {
  config,
  add,
  derived,
  freshBattle,
  migrate,
  hasStarted,
  creditThrow,
  won,
  throwAtEnemy,
  throwDirty,
  enqueue,
  advanceBattle,
  startBattle,
  drawAccuracy
};
