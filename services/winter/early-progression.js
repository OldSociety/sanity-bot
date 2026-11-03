// Candidate domain rules. Intentionally not imported by the Discord runtime.
// JSON state can be persisted by a future transactional adapter; this module
// performs no I/O, database access, wall-clock reads or purchases during absence.
const config = require('../../config/winter/early-progression.json');
const { addedHp, hpAtDefeats, damageAtDefeats } = require('./snowman-scaling');
const HOUR = 3600000;
function integer(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw Error(`Invalid ${name}.`);
  return value;
}
function passiveRate(strength, c = config) {
  const p = c.passive;
  return Math.floor(strength <= p.breakpoint ? strength / p.divisor :
    p.breakpoint / p.divisor * (strength / p.breakpoint) ** p.exponent);
}
function enemy(state, tier = state.target, c = config) {
  const row = c.snowmen.find(e => e.tier === tier);
  if (!row) throw Error('This tier has no approved candidate definition.');
  const wins = state.tiers[tier].wins;
  return { ...row, hp: hpAtDefeats(row, wins), damage: damageAtDefeats(row, wins) };
}
function unlocked(state, tier, c = config) {
  const index = c.snowmen.findIndex(e => e.tier === tier);
  return index >= 0 && (!index || state.tiers[c.snowmen[index - 1].tier].wins >= c.snowmen[index - 1].winsToUnlockNext);
}
function maxHp(state, c = config) { return state.coat ? c.coatHp : c.playerHp; }
function fresh(c = config) {
  const tiers = Object.fromEntries(c.snowmen.map(e => [e.tier, {
    wins: 0, losses: 0, attacks: 0, hits: 0, enemyAttacks: 0, enemyHits: 0,
    regular: 0, red: 0, ice: 0, buttons: 0, milliseconds: 0,
  }]));
  return {
    version: 1, ruleset: c.id, now: 0, origin: 0, active: true, target: 1,
    nextPlayerAt: c.playerIntervalMs, nextEnemyAt: c.enemyIntervalMs,
    playerHp: c.playerHp, enemyHp: hpAtDefeats(c.snowmen[0], 0),
    snow: 0, snowRemainder: 0, diamonds: 0, sweat: 0, sweatRemainder: 0,
    strength: 0, accuracy: 0, ironMaterial: false, iron: false,
    gymStarterClaimed: false, iceRecipe: false, red: 0, ice: 0,
    equipped: 'regular', coat: false, buttons: 0, tiers,
    milestones: {},
    ledger: { snowProduced: 0, regularSnow: 0, redSnow: 0, pressedSnow: 0,
      ironSnow: 0, recipeSnow: 0, diamondsCrafted: 0, iceDiamonds: 0,
      combatSweat: 0, passiveSweat: 0, starterSweat: 0, trainingSweat: 0,
      buttonsEarned: 0, buttonsSpent: 0, skippedAttacks: 0 },
  };
}
function milestone(state, name) { state.milestones[name] ??= state.now; }
function accrue(state, at, c) {
  const elapsed = at - state.now;
  const snow = integer(elapsed * (state.iron ? c.ironRate : c.stoneRate) + state.snowRemainder, 'snow accrual');
  const produced = Math.floor(snow / 1000);
  state.snow = integer(state.snow + produced, 'snow');
  state.ledger.snowProduced += produced;
  state.snowRemainder = snow % 1000;
  const sweat = integer(elapsed * passiveRate(state.strength, c) + state.sweatRemainder, 'Sweat accrual');
  const earned = Math.floor(sweat / HOUR);
  state.sweat = integer(state.sweat + earned, 'Sweat');
  state.ledger.passiveSweat += earned;
  state.sweatRemainder = sweat % HOUR;
  if (state.active) state.tiers[state.target].milliseconds += elapsed;
  state.now = at;
}
function resetFight(state, c) {
  state.playerHp = maxHp(state, c);
  state.enemyHp = enemy(state, state.target, c).hp;
  state.nextEnemyAt = state.now + c.enemyIntervalMs;
  // Do not reset nextPlayerAt on loss. It stays on the global attack grid.
}
function draw(random) {
  const value = random();
  if (!(value >= 0 && value < 1)) throw Error('RNG must return a value in [0, 1).');
  return value;
}
function settle(state, now, random, c = config, maxEvents = 2000000) {
  integer(now, 'timestamp');
  integer(maxEvents, 'event budget');
  if (state.ruleset !== c.id) throw Error('Candidate ruleset mismatch.');
  if (now < state.now) return { complete: true, events: 0 };
  let events = 0;
  while (state.active && Math.min(state.nextPlayerAt, state.nextEnemyAt) <= now) {
    if (events >= maxEvents) return { complete: false, events };
    events++;
    const at = Math.min(state.nextPlayerAt, state.nextEnemyAt);
    accrue(state, at, c);
    const record = state.tiers[state.target];
    if (state.nextPlayerAt <= state.nextEnemyAt) {
      state.nextPlayerAt += c.playerIntervalMs;
      let ammo = state.equipped;
      if (ammo !== 'regular' && state[ammo] === 0) ammo = 'regular';
      if (ammo === 'regular' && state.snow < c.regularSnowCost) {
        state.ledger.skippedAttacks++;
        continue;
      }
      if (ammo === 'regular') {
        state.snow -= c.regularSnowCost;
        state.ledger.regularSnow += c.regularSnowCost;
      } else state[ammo]--;
      record.attacks++;
      record[ammo]++;
      // Misses and losing attempts are eligible; no zero-balance boost.
      if (state.target >= c.buttonMinimumTier && draw(random.buttons) < c.buttonChance) {
        state.buttons++;
        record.buttons++;
        state.ledger.buttonsEarned++;
        milestone(state, 'firstButton');
      }
      if (draw(random.combat) < Math.min(1, c.playerAccuracy + c.accuracyPerLevel * state.accuracy)) {
        record.hits++;
        const damage = ammo === 'regular' ? c.regularDamage * (1 + c.strengthPerLevel * state.strength) :
          ammo === 'red' ? c.redDamage : c.iceDamage;
        state.enemyHp = Math.max(0, state.enemyHp - damage);
        if (state.enemyHp < 1) {
          record.wins++;
          const reward = enemy(state, state.target, c).sweat;
          state.sweat += reward;
          state.ledger.combatSweat += reward;
          milestone(state, `firstWinS${state.target}`);
          if (record.wins === enemy(state, state.target, c).winsToUnlockNext) milestone(state, `clearS${state.target}`);
          resetFight(state, c);
        }
      }
    } else {
      state.nextEnemyAt += c.enemyIntervalMs;
      record.enemyAttacks++;
      if (draw(random.combat) < c.enemyAccuracy) {
        record.enemyHits++;
        state.playerHp = Math.max(0, state.playerHp - enemy(state, state.target, c).damage);
        if (state.playerHp < 1) {
          record.losses++;
          milestone(state, 'firstLoss');
          resetFight(state, c);
        }
      }
    }
  }
  accrue(state, now, c);
  return { complete: true, events };
}
// Apply only at the already-settled timestamp. Runtime callers must settle under
// their writer transaction before applying one command and persisting its receipt.
function purchase(state, action, amount = 1, c = config) {
  integer(amount, 'quantity');
  if (!amount) throw Error('Quantity must be positive.');
  if (action === 'visit') {
    if (!state.gymStarterClaimed && Object.values(state.tiers).some(t => t.losses)) {
      state.gymStarterClaimed = true;
      state.strength = Math.max(state.strength, c.gymStartingStrength ?? 1);
      state.sweat += c.gymStarterSweat;
      state.ledger.starterSweat += c.gymStarterSweat;
    }
    return true;
  }
  if (action === 'strength' || action === 'accuracy') {
    const level = state[action] + 1;
    if (level > c.statCap || state.sweat < level || action === 'accuracy' && state.strength < c.accuracyUnlockStrength) return false;
    state.sweat -= level;
    state.ledger.trainingSweat += level;
    state[action]++;
    if (action === 'strength' && level === c.ironStrength) milestone(state, 'strength25');
    return true;
  }
  if (action === 'lift') {
    if (state.strength < c.ironStrength || state.ironMaterial || state.iron) return false;
    state.ironMaterial = true;
    return true;
  }
  if (action === 'iron') {
    if (state.iron || !state.ironMaterial || state.snow < c.ironSnowCost) return false;
    state.snow -= c.ironSnowCost;
    state.ledger.ironSnow += c.ironSnowCost;
    state.ironMaterial = false;
    state.iron = true;
    milestone(state, 'iron');
    return true;
  }
  if (action === 'ice-recipe') {
    if (state.iceRecipe || state.snow < c.iceRecipeSnowCost) return false;
    state.snow -= c.iceRecipeSnowCost;
    state.ledger.recipeSnow += c.iceRecipeSnowCost;
    state.iceRecipe = true;
    milestone(state, 'iceRecipe');
    return true;
  }
  if (action === 'diamonds' || action === 'red') {
    const cost = integer(amount * (action === 'red' ? c.redSnowCost : c.diamondSnowCost), 'snow cost');
    if (state.snow < cost) return false;
    integer(state[action] + amount, 'inventory');
    state.snow -= cost;
    state[action] += amount;
    state.ledger[action === 'red' ? 'redSnow' : 'pressedSnow'] += cost;
    if (action === 'diamonds') state.ledger.diamondsCrafted += amount;
    return true;
  }
  if (action === 'ice') {
    const cost = integer(amount * c.iceDiamonds, 'diamond cost');
    if (!state.iceRecipe || state.diamonds < cost) return false;
    integer(state.ice + amount, 'inventory');
    state.diamonds -= cost;
    state.ledger.iceDiamonds += cost;
    state.ice += amount;
    return true;
  }
  if (action === 'coat') {
    if (state.coat || state.buttons < c.coatButtons || state.milestones.firstButton === undefined) return false;
    state.buttons -= c.coatButtons;
    state.ledger.buttonsSpent += c.coatButtons;
    state.coat = true;
    // Equipping raises the maximum prospectively. The next battle starts full.
    milestone(state, 'coat');
    return true;
  }
  throw Error('Unknown candidate purchase.');
}
function select(state, tier, c = config) {
  if (!unlocked(state, tier, c)) return false;
  if (state.target !== tier) {
    state.target = tier;
    resetFight(state, c);
    milestone(state, `enteredS${tier}`);
  }
  return true;
}
function equip(state, ammo) {
  if (!['regular', 'red', 'ice'].includes(ammo)) throw Error('Unknown candidate ammunition.');
  if (ammo === 'ice' && !state.iceRecipe) return false;
  state.equipped = ammo;
  return true;
}
function assertLedger(state, c = config) {
  const l = state.ledger;
  const spent = l.regularSnow + l.redSnow + l.pressedSnow + l.ironSnow + l.recipeSnow;
  if (state.snow !== l.snowProduced - spent || state.diamonds !== l.diamondsCrafted - l.iceDiamonds ||
    state.sweat !== l.combatSweat + l.passiveSweat + l.starterSweat - l.trainingSweat ||
    state.buttons !== l.buttonsEarned - l.buttonsSpent) throw Error('Candidate resource ledger mismatch.');
  const rows = Object.values(state.tiers);
  if (state.red !== l.redSnow / c.redSnowCost - rows.reduce((sum, t) => sum + t.red, 0) ||
    state.ice !== l.iceDiamonds / c.iceDiamonds - rows.reduce((sum, t) => sum + t.ice, 0)) throw Error('Candidate ammunition ledger mismatch.');
  if (rows.reduce((sum, t) => sum + t.attacks, 0) > Math.floor((state.now - state.origin) / c.playerIntervalMs)) throw Error('Candidate attack cadence exceeded.');
  for (const value of [state.snow, state.diamonds, state.sweat, state.buttons, state.red, state.ice]) integer(value, 'balance');
  if (!(state.playerHp > 0 && state.playerHp <= maxHp(state, c) && state.enemyHp > 0 && state.enemyHp <= enemy(state, state.target, c).hp)) throw Error('Candidate HP bounds exceeded.');
  return true;
}
module.exports = { config, HOUR, passiveRate, addedHp, enemy, unlocked, fresh, settle, purchase, select, equip, assertLedger };
