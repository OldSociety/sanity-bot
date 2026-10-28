const {
  Transaction
} = require('sequelize');
const {
  serialize
} = require('../spooky/economy');
const {
  IDS,
  DIRTY_RECIPE,
  shuffleIngredients,
  readDraft
} = require('./recipes');
const {
  nextCommand,
  commandReady
} = require('./tutorial');
const {
  SKILLS,
  MAX_LEVEL,
  LIFT_TAUNT,
  buyLevels,
  liftWeight,
  normalizeSkill,
  RECIPE_PRICE
} = require('./gym');
const battleRules = require('./battle');
const slotsRules = require('./slots');
const {tradeShovel}=require('./shovels');
const opponents=require('./opponents');
const {
  compactNumber
} = require('./numbers');
const SHOVELS = Object.freeze([Object.freeze({
  name: 'Bare Hands',
  rate: battleRules.config.bareHandsRate,
  cost: 100
}), Object.freeze({
  name: 'Wooden Shovel',
  rate: battleRules.config.woodenRate,
  cost: 10000
}), Object.freeze({
  name: 'Stone Shovel',
  rate: battleRules.config.stoneRate
}), Object.freeze({
  name: 'Iron Shovel',
  rate: battleRules.config.ironRate
})]);
const COSTS = Object.freeze({
  snowballs: 10,
  diamonds: 1000,
  craft: 10
});
const TARGETS = Object.freeze({
  dummy: 5,
  snowman: 50,
  kitchenHits: 3
});
const MAX = BigInt(Number.MAX_SAFE_INTEGER);
function safe(value) {
  if (value < 0n || value > MAX) throw new Error('This balance exceeds the supported safe integer range. No resources were changed.');
  return Number(value);
}
function timestamp(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid server timestamp');
  return value;
}

// No timers: every read and mutation materializes elapsed production under the
// same SQLite writer lock. Fraction is thousandths of one snow, not milliseconds.
function createEconomy({
  sequelize,
  clock = Date.now,
  eventId = 'winter-2026',
  startsAt = 0,
  endsAt = Number.MAX_SAFE_INTEGER,
  allowRestart = false,
  battleSettings = battleRules.config,
  random = battleRules.drawAccuracy,
  dropRandom = battleRules.drawAccuracy,
  slotsRandom = battleRules.drawAccuracy
}) {
  timestamp(startsAt);
  timestamp(endsAt);
  if (startsAt >= endsAt) throw new Error('Invalid winter window');
  let initialized;
  async function initialize() {
    if (!initialized) initialized = serialize(sequelize, async () => {
      await sequelize.query(`CREATE TABLE IF NOT EXISTS BadgeOwnership (guildId VARCHAR(255) NOT NULL, userId VARCHAR(255) NOT NULL, badgeId VARCHAR(255) NOT NULL, sourceEventId VARCHAR(255) NOT NULL, awardedAt DATETIME NOT NULL, PRIMARY KEY(guildId,userId,badgeId))`);
      await sequelize.query(`CREATE TABLE IF NOT EXISTS WinterPlayers (
        eventId TEXT NOT NULL, guildId TEXT NOT NULL, userId TEXT NOT NULL,
        snow INTEGER NOT NULL DEFAULT 0 CHECK(snow >= 0 AND snow <= 9007199254740991),
        snowballs INTEGER NOT NULL DEFAULT 0 CHECK(snowballs >= 0 AND snowballs <= 9007199254740991),
        diamonds INTEGER NOT NULL DEFAULT 0 CHECK(diamonds >= 0 AND diamonds <= 9007199254740991),
        tier INTEGER NOT NULL DEFAULT 0 CHECK(tier BETWEEN 0 AND 2),
        rock INTEGER NOT NULL DEFAULT 0 CHECK(rock IN (0,1)),
        lastAccrual INTEGER NOT NULL, remainder INTEGER NOT NULL DEFAULT 0 CHECK(remainder BETWEEN 0 AND 999),
        PRIMARY KEY(eventId,guildId,userId))`);
      await sequelize.query(`CREATE TABLE IF NOT EXISTS WinterInteractions (
        interactionId TEXT PRIMARY KEY, eventId TEXT NOT NULL, guildId TEXT NOT NULL,
        userId TEXT NOT NULL, action TEXT NOT NULL, receipt TEXT NOT NULL)`);
      await sequelize.query(`CREATE TABLE IF NOT EXISTS WinterProgress (
        eventId TEXT NOT NULL, guildId TEXT NOT NULL, userId TEXT NOT NULL,
        welcomed INTEGER NOT NULL DEFAULT 0,
        snowballsUnlocked INTEGER NOT NULL DEFAULT 0, diamondsUnlocked INTEGER NOT NULL DEFAULT 0,
        dummyHp INTEGER NOT NULL DEFAULT 5 CHECK(dummyHp BETWEEN 0 AND 5),
        restartToken TEXT,
        PRIMARY KEY(eventId,guildId,userId))`);
      await sequelize.query(`CREATE TABLE IF NOT EXISTS WinterShopProgress (
        eventId TEXT NOT NULL, guildId TEXT NOT NULL, userId TEXT NOT NULL,
        helped INTEGER NOT NULL DEFAULT 0 CHECK(helped IN (0,1)),
        brokenSeen INTEGER NOT NULL DEFAULT 0 CHECK(brokenSeen IN (0,1)),
        snowmanOwned INTEGER NOT NULL DEFAULT 0 CHECK(snowmanOwned IN (0,1)),
        snowmanHp INTEGER NOT NULL DEFAULT 50 CHECK(snowmanHp BETWEEN 0 AND 50),
        PRIMARY KEY(eventId,guildId,userId))`);
      await sequelize.query(`CREATE TABLE IF NOT EXISTS WinterTutorialGifts (
        eventId TEXT NOT NULL, guildId TEXT NOT NULL, userId TEXT NOT NULL,
        diamondGift INTEGER NOT NULL DEFAULT 0 CHECK(diamondGift IN (0,1)),
        PRIMARY KEY(eventId,guildId,userId))`);
      await sequelize.query(`CREATE TABLE IF NOT EXISTS WinterKitchen (
        eventId TEXT NOT NULL, guildId TEXT NOT NULL, userId TEXT NOT NULL,
        peppers INTEGER NOT NULL DEFAULT 0 CHECK(peppers BETWEEN 0 AND 3),
        spicyUnlocked INTEGER NOT NULL DEFAULT 0 CHECK(spicyUnlocked IN (0,1)),
        spicy INTEGER NOT NULL DEFAULT 0 CHECK(spicy BETWEEN 0 AND 9007199254740991),
        oldStone INTEGER NOT NULL DEFAULT 0 CHECK(oldStone IN (0,1)),
        PRIMARY KEY(eventId,guildId,userId))`);
      await sequelize.query(`CREATE TABLE IF NOT EXISTS WinterRecipeDrafts (
        eventId TEXT NOT NULL, guildId TEXT NOT NULL, userId TEXT NOT NULL,
        ingredients TEXT NOT NULL DEFAULT '[]',
        ingredientOrder TEXT NOT NULL DEFAULT '["pepper","cherry","avocado","garlic","eggplant"]',
        PRIMARY KEY(eventId,guildId,userId))`);
      await sequelize.query(`CREATE TABLE IF NOT EXISTS WinterBattles (
        eventId TEXT NOT NULL, guildId TEXT NOT NULL, userId TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 0, nextAt INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL,
        PRIMARY KEY(eventId,guildId,userId))`);
      await sequelize.query('CREATE INDEX IF NOT EXISTS WinterBattles_due ON WinterBattles(active,nextAt)');
      await sequelize.query(`CREATE TABLE IF NOT EXISTS WinterSlotJackpots (
        eventId TEXT NOT NULL, guildId TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount BETWEEN 0 AND 9007199254740991),
        PRIMARY KEY(eventId,guildId))`);
    }).catch(error => {
      initialized = undefined;
      throw error;
    });
    return initialized;
  }
  async function execute({
    guildId,
    userId,
    interactionId,
    action = 'status',
    quantity,
    admin = false
  }) {
    if (action === 'shovel') { action = 'status'; quantity = undefined; }
    for (const value of [guildId, userId, interactionId]) {
      if (typeof value !== 'string' || !value.trim()) throw new Error('Missing winter interaction identity');
    }
    if (!['admin', 'grant-sweat', 'grant-snow', 'grant-ammo', 'test-sturdy', 'test-strength', 'lift20', 'iron', 'buy-mittens', 'buy-fire-flower', 'buy-outfit', 'snow-slots', 'snow-spin', 'train-select', 'train-dodge', 'train-speed', 'train-special', 'emporium', 'slots', 'slots-bet', 'slots-spin', 'slots-collect', 'status', 'snowballs', 'diamonds', 'beg', 'shop', 'shop-help', 'buy-snowman', 'buy-sturdy', 'opponents', 'battle-opponent', 'battle-start', 'battle-special', 'battle-dirty', 'battle-pause', 'battle-tick', 'train', 'train-strength', 'train-accuracy', 'train-defense', 'train-attack', 'lift', 'opponent-hendrix', 'opponent-requia', 'buy-recipe', 'hidden', 'test-kill', 'kitchen', 'pepper', 'ingredient', 'recipe-cancel', 'mix', 'buy-spicy', 'attack-spicy', 'buy-old-stone', 'shovel', 'help', 'throw', 'attack', 'craft', 'restart', 'restart-confirm', 'restart-cancel', 'buy-rock', 'upgrade-0', 'upgrade-1'].includes(action)) throw new Error('Unknown winter action');
    if (action.startsWith('restart') && !allowRestart) throw new Error('Restart is available only for development testing.');
    if (['test-kill', 'test-sturdy', 'test-strength'].includes(action) && !allowRestart) throw new Error('This testing control is available only in development.');
    if (['admin', 'grant-sweat', 'grant-snow', 'grant-ammo'].includes(action) && (!allowRestart || !admin)) throw Error('Development administrators only.');
    if (quantity !== undefined && (action === 'battle-opponent' ? !/^snowman-[1-9]\d*\.[a-f0-9-]{36}$/.test(quantity) : action === 'train-select' ? !['strength', 'accuracy', 'dodge', 'special', 'speed'].includes(quantity) : action.startsWith('train-') ? !['1', '10', 'max'].includes(quantity) : action === 'snow-spin' ? !['1', '10'].includes(quantity) : action === 'slots-bet' ? !slotsRules.STAKES.map(String).includes(quantity) : ['slots-spin', 'slots-collect'].includes(action) ? !slotsRules.validControl(quantity) : action === 'ingredient' ? !IDS.includes(quantity) : ['restart-confirm', 'battle-start', 'battle-special', 'battle-dirty', 'battle-pause'].includes(action) ? !/^[a-f0-9-]{36}$/.test(quantity) : action === 'buy-spicy' ? !['1', '10', '100', 'max'].includes(quantity) : !COSTS[action] || !['1', '10', '100', 'max'].includes(quantity))) throw new Error('Invalid conversion quantity');
    if (action === 'ingredient' && !IDS.includes(quantity)) throw new Error('Invalid recipe ingredient');
    if (action === 'restart-confirm' && !quantity) throw new Error('Restart confirmation required.');
    if (action === 'slots-bet' && !slotsRules.STAKES.map(String).includes(quantity)) throw Error('Invalid slots stake.');
    if (['slots-spin', 'slots-collect'].includes(action) && !slotsRules.validControl(quantity)) throw Error('Invalid slots control.');
    await initialize();
    return serialize(sequelize, () => sequelize.transaction({
      type: Transaction.TYPES.IMMEDIATE
    }, async transaction => {
      const query = (sql, values = {}) => {
        const bind = {};
        const statement = sql.replace(/:(\w+)/g, (_, name) => {
          bind[name] = values[name];
          return `$${name}`;
        });
        return sequelize.query(statement, {
          bind,
          transaction
        });
      };
      const automatic = action === 'battle-tick' && interactionId.startsWith('winter-auto:');
      const identity = {
        eventId,
        guildId,
        userId,
        interactionId: automatic ? 'winter-maintenance:' + eventId + ':' + guildId + ':' + userId : interactionId
      };
      const operation = JSON.stringify(automatic ? [action, quantity ?? null, interactionId] : [action, quantity ?? null]);
      const [previous] = await query('SELECT * FROM WinterInteractions WHERE interactionId=:interactionId', identity);
      if (previous.length) {
        const row = previous[0];
        if (row.eventId !== eventId || row.guildId !== guildId || row.userId !== userId || !automatic && row.action !== operation) throw new Error('Winter interaction identity mismatch');
        if (row.action === operation) return JSON.parse(row.receipt);
      }
      // Clock sampled after acquiring the lock, never from a Discord payload.
      const now = Math.min(endsAt, Math.max(startsAt, timestamp(clock())));
      await query(`INSERT OR IGNORE INTO WinterPlayers (eventId,guildId,userId,lastAccrual,snow)
        VALUES (:eventId,:guildId,:userId,:now,10)`, {
        ...identity,
        now
      });
      const [[player]] = await query('SELECT * FROM WinterPlayers WHERE eventId=:eventId AND guildId=:guildId AND userId=:userId', identity);
      const [[priorProgress]] = await query('SELECT * FROM WinterProgress WHERE eventId=:eventId AND guildId=:guildId AND userId=:userId', identity);
      const [[priorShop]] = await query('SELECT * FROM WinterShopProgress WHERE eventId=:eventId AND guildId=:guildId AND userId=:userId', identity);
      const [[priorKitchen]] = await query('SELECT * FROM WinterKitchen WHERE eventId=:eventId AND guildId=:guildId AND userId=:userId', identity);
      await query(`INSERT OR IGNORE INTO WinterProgress (eventId,guildId,userId,dummyHp) VALUES (:eventId,:guildId,:userId,5)`, identity);
      const [[progress]] = await query('SELECT * FROM WinterProgress WHERE eventId=:eventId AND guildId=:guildId AND userId=:userId', identity);
      await query(`INSERT OR IGNORE INTO WinterShopProgress (eventId,guildId,userId,snowmanHp) VALUES (:eventId,:guildId,:userId,50)`, identity);
      const [[shopProgress]] = await query('SELECT * FROM WinterShopProgress WHERE eventId=:eventId AND guildId=:guildId AND userId=:userId', identity);
      await query(`INSERT OR IGNORE INTO WinterTutorialGifts (eventId,guildId,userId) VALUES (:eventId,:guildId,:userId)`, identity);
      const [[tutorialGifts]] = await query('SELECT * FROM WinterTutorialGifts WHERE eventId=:eventId AND guildId=:guildId AND userId=:userId', identity);
      await query(`INSERT OR IGNORE INTO WinterKitchen (eventId,guildId,userId) VALUES (:eventId,:guildId,:userId)`, identity);
      const [[kitchen]] = await query('SELECT * FROM WinterKitchen WHERE eventId=:eventId AND guildId=:guildId AND userId=:userId', identity);
      await query(`INSERT OR IGNORE INTO WinterRecipeDrafts (eventId,guildId,userId) VALUES (:eventId,:guildId,:userId)`, identity);
      const [[draftRow]] = await query('SELECT * FROM WinterRecipeDrafts WHERE eventId=:eventId AND guildId=:guildId AND userId=:userId', identity);
      const recipeDraft = readDraft(draftRow);
      await query(`INSERT OR IGNORE INTO WinterBattles (eventId,guildId,userId,state) VALUES (:eventId,:guildId,:userId,:state)`, {
        ...identity,
        state: JSON.stringify(battleRules.freshBattle(battleSettings))
      });
      const [[battleRow]] = await query('SELECT * FROM WinterBattles WHERE eventId=:eventId AND guildId=:guildId AND userId=:userId', identity);
      const battle = JSON.parse(battleRow.state);
      for (const field of ['dirtyUnlocked', 'dirty', 'dirtyProgress', 'spicyPurchased', 'hendrixUnlocked', 'requiaUnlocked', 'stunRemaining', 'stunnedAttacks']) battle[field] ??= 0;
      battleRules.migrate(battle, now, battleSettings);
      battle.gymVisited ??= Number(Object.values(battle.gym || {}).some(level=>level>0) || battle.weightStage>0);
      battle.gymStarterClaimed ??= battle.gymVisited;
      battle.zeroButtonThrows ??= 0;
      battle.zeroButtonWindowActive ??= 0;
      battle.clothingOwned ??= battle.outfitOwned ? ['starting', 'first'] : ['starting'];
      battle.equippedClothing ??= battle.outfitOwned ? 'first' : 'starting';
      if (kitchen.spicy > 0) battle.spicyPurchased = 1;
      for (const field of ['buttons', 'buttonsUnlocked', 'buttonIntroPending', 'emporiumUnlocked']) battle[field] ??= 0;
      battle.slots ??= slotsRules.freshSlots();
      // Once per existing profile, retain damage already dealt when reducing caps.
      // The kitchen row is the durable marker; restart never repeats this adjustment.
      if (!priorKitchen) {
        if (priorProgress) progress.dummyHp = Math.max(0, priorProgress.dummyHp - 5);
        if (priorShop) shopProgress.snowmanHp = Math.max(0, priorShop.snowmanHp - 50);
      }
      const kitchenReady = shopProgress.snowmanOwned && shopProgress.snowmanHp <= TARGETS.snowman - TARGETS.kitchenHits;
      // Preserve discoveries for existing profiles, even after their balance is spent.
      progress.snowballsUnlocked ||= Number(player.snowballs > 0);
      progress.diamondsUnlocked ||= Number(player.diamonds > 0 || player.rock > 0 || player.tier === 2);
      const accrueTo = at => {
        const elapsed = BigInt(Math.max(0, Math.floor(at) - player.lastAccrual));
        const produced = elapsed * BigInt(battle.ironShovelOwned ? battleSettings.ironRate : SHOVELS[player.tier].rate) + BigInt(player.remainder);
        player.snow = safe(BigInt(player.snow) + produced / 1000n);
        player.remainder = Number(produced % 1000n);
        player.lastAccrual = Math.max(Math.floor(at), player.lastAccrual);
      };
      player.productionRate = battle.ironShovelOwned ? battleSettings.ironRate : SHOVELS[player.tier].rate;
      battleRules.advanceBattle(player, battle, now, accrueTo, random, battleSettings, dropRandom, allowRestart, kitchen);
      // Earlier purchases stopped at the unlock announcement. Honor those
      // purchases without recharging or retroactively changing accrued snow.
      if (kitchen.oldStone && player.tier < 2) player.tier = 2;
      player.productionRate = battle.ironShovelOwned ? battleSettings.ironRate : SHOVELS[player.tier].rate;
      let message = '';
      let view;
      const tutorial = {
        progress,
        shopProgress,
        kitchen,
        battle
      };
      let continueCommand;
      let slotsJackpot;
      if (!progress.welcomed && !['admin', 'grant-sweat', 'grant-snow', 'grant-ammo'].includes(action)) {
        progress.welcomed = 1;
        view = 'welcome';
      } else if (battle.buttonIntroPending && !['admin', 'grant-sweat', 'grant-snow', 'grant-ammo', 'emporium', 'restart', 'restart-confirm', 'restart-cancel'].includes(action)) {
        view = 'button-found';
      } else if (quantity === undefined && !commandReady(action, tutorial)) {
        view = 'not-ready';
        continueCommand = nextCommand(tutorial);
        message = `You’re not ready for that yet. Try using /snow ${continueCommand} instead.`;
      } else if (['admin', 'grant-sweat', 'grant-snow', 'grant-ammo'].includes(action)) {
        view = 'admin';
        if (action === 'grant-sweat') battle.sweat = safe(BigInt(battle.sweat) + 100n);
        if (action === 'grant-snow') player.snow = safe(BigInt(player.snow) + BigInt(player.productionRate) * 3600n);
        if (action === 'grant-ammo') {
          player.snowballs = safe(BigInt(player.snowballs) + 10n);
          kitchen.spicy = safe(BigInt(kitchen.spicy) + 10n);
          battle.dirty = safe(BigInt(battle.dirty) + 10n);
        }
        message = action === 'admin' ? 'Development testing resources.' : 'Testing resources added.';
      } else if (action === 'iron') {
        view = 'shop';
        message = tradeShovel(player,battle,'iron',battleSettings);
      } else if (['buy-mittens', 'buy-fire-flower'].includes(action)) {
        view = 'emporium';
        const mittens = action === 'buy-mittens';
        const field = mittens ? 'mittensOwned' : 'fireFlowerOwned';
        const cost = mittens ? battleSettings.mittenCost : battleSettings.fireFlowerCost;
        if (battle[field]) message = 'You already own this item.';
        else if (battle.buttons < cost) message = 'You need more 🔘 Buttons.';
        else { battle.buttons -= cost; battle[field] = 1; message = mittens ? 'Mittens equipped.' : 'Fire Flower equipped.'; }
      } else if (action === 'buy-outfit') {
        view = 'emporium';
        if (!battle.emporiumUnlocked) message = 'Discover the Emporium first.';else if (battle.outfitOwned) message = 'You already own this outfit.';else if (battle.buttons < battleSettings.outfitCost) message = 'You need 100🔘 for this outfit.';else {
          battle.buttons -= battleSettings.outfitCost;
          battle.outfitOwned = 1;
          if (!battle.clothingOwned.includes('first')) battle.clothingOwned.push('first');
          battle.equippedClothing = 'first';
          message = 'First Outfit equipped.';
        }
      } else if (['snow-slots', 'snow-spin'].includes(action)) {
        view = 'snow-slots';
        const count = quantity === '10' ? 10 : 1,
          cost = count * battleSettings.snowSlotsCost;
        if (action === 'snow-spin') {
          if (player.snow < cost) message = 'Not enough snow to spin.';else {
            player.snow -= cost;
            let won = 0;
            for (let i = 0; i < count; i++) {
              won += slotsRules.snowSpin(slotsRandom, battleSettings.snowSlotsRewards);
            }
            battle.buttons = safe(BigInt(battle.buttons) + BigInt(won));
            battle.buttonsUnlocked = 1;
            message = `You won ${won}🔘 from ${count} spin${count === 1 ? '' : 's'}.`;
          }
        }
      } else if (action === 'restart') {
        progress.restartToken = require('node:crypto').randomUUID();
        view = 'restart';
      } else if (action === 'restart-cancel') {
        progress.restartToken = null;
        message = 'Restart cancelled.';
        view = 'status';
      } else if (action === 'restart-confirm') {
        if (quantity !== progress.restartToken) {
          message = 'This restart confirmation has expired. Press Restart again.';
          view = 'status';
        } else {
          Object.assign(player, {
            snow: 10,
            snowballs: 0,
            diamonds: 0,
            tier: 0,
            rock: 0,
            lastAccrual: now,
            remainder: 0
          });
          Object.assign(progress, {
            welcomed: 1,
            snowballsUnlocked: 0,
            diamondsUnlocked: 0,
            dummyHp: 5,
            restartToken: null
          });
          Object.assign(shopProgress, {
            helped: 0,
            brokenSeen: 0,
            snowmanOwned: 0,
            snowmanHp: 50
          });
          Object.assign(kitchen, {
            peppers: 0,
            spicyUnlocked: 0,
            spicy: 0,
            oldStone: 0
          });
          recipeDraft.ingredients = [];
          recipeDraft.ingredientOrder = IDS.slice();
          Object.assign(battle, battleRules.freshBattle(battleSettings));
          tutorialGifts.diamondGift = 0;
          view = 'welcome';
        }
      } else if (action === 'buy-sturdy') {
        view = 'shop';
        if (!shopProgress.snowmanOwned || shopProgress.snowmanHp > 0) message = 'Defeat the Rough Snowman first.';else if (battle.sturdyOwned) message = 'You already own the Sturdy Snowman.';else if (player.diamonds < battleSettings.sturdyPriceDiamonds) message = `You need ${battleSettings.sturdyPriceDiamonds} 💎 for the Sturdy Snowman.`;else {
          player.diamonds -= battleSettings.sturdyPriceDiamonds;
          battle.sturdyOwned = 1;
          battle.phase = 'opponents';
          view = 'sturdy-purchased';
        }
      } else if (['opponents', 'battle-opponent', 'battle-start', 'battle-special', 'battle-dirty', 'battle-pause', 'battle-tick'].includes(action)) {
        view = battle.active ? 'fight' : battle.trainIntroPending ? 'battle-defeat' : 'opponents';
        if (action === 'opponents') {
          battle.active=0; battle.phase='paused'; battle.pauseAt=now; view='opponents';
        } else if (action === 'battle-opponent') {
          const [id,token]=quantity.split('.');
          if(token!==battle.fightId) message='These fight controls are out of date. Open /snow throw.';
          else if(!battle.sturdyOwned) message='Purchase a Sturdy Snowman first.';
          else {
            message=opponents.select(battle,id,battleSettings);
            if(!message) {battleRules.startBattle(battle,now,battleSettings);view='fight';}
          }
        } else if (action !== 'battle-tick' && quantity !== battle.fightId) message = 'These fight controls are out of date. Open /snow throw.';else if (!battle.sturdyOwned) message = 'Purchase a Sturdy Snowman first.';else if (action === 'battle-start' && !battle.active && !battle.trainIntroPending) {
          battleRules.startBattle(battle, now, battleSettings);
          view = 'fight';
        } else if (['battle-special', 'battle-dirty'].includes(action) && battle.active) {
          const item = action === 'battle-dirty' ? 'dirty' : 'spicy';
          if (item === 'dirty' && !battle.dirtyUnlocked || item === 'spicy' && !kitchen.spicyUnlocked) message = 'Discover the recipe first.';else message = battleRules.enqueue(battle, item, kitchen);
        } else if (action === 'battle-pause' && battle.active) {
          battle.active = 0;
          battle.phase = 'paused';
          battle.pauseAt = now;
          view = 'opponents';
        }
      } else if (action === 'hidden') {
        view = battle.dirtyUnlocked ? 'kitchen' : 'hidden';
      } else if (action === 'emporium') {
        view = 'emporium';
        battle.buttonIntroPending = 0;
        if (battle.active) {
          battle.active = 0;
          battle.phase = 'paused';
          battle.pauseAt = now;
        }
      } else if (['slots', 'slots-bet', 'slots-spin', 'slots-collect'].includes(action)) {
        view = 'slots';
        if (battle.active) {
          battle.active = 0;
          battle.phase = 'paused';
          battle.pauseAt = now;
        }
        await query('INSERT OR IGNORE INTO WinterSlotJackpots (eventId,guildId,amount) VALUES (:eventId,:guildId,:amount)', {
          ...identity,
          amount: slotsRules.INITIAL_JACKPOT
        });
        const [[pool]] = await query('SELECT amount FROM WinterSlotJackpots WHERE eventId=:eventId AND guildId=:guildId', identity);
        slotsJackpot = pool.amount;
        const game = battle.slots;
        let roll = false;
        if (action === 'slots-bet') {
          if (game.active) message = 'Finish or collect your current game first.';else if (battle.buttons < Number(quantity)) message = 'You do not have enough 🔘 Buttons for that stake.';else {
            battle.buttons -= Number(quantity);
            Object.assign(game, slotsRules.freshSlots(), {
              active: 1,
              stake: Number(quantity)
            });
            slotsJackpot = safe(BigInt(slotsJackpot) + BigInt(game.stake) + BigInt(slotsRules.integer(slotsRandom, 5, 10)));
            roll = true;
          }
        } else if (['slots-spin', 'slots-collect'].includes(action)) {
          if (!game.active || quantity !== slotsRules.control(game)) message = 'These slots controls have changed. Use the latest game controls.';else if (action === 'slots-spin') roll = true;else {
            battle.buttons = safe(BigInt(battle.buttons) + BigInt(game.pot));
            game.message = `You collected ${compactNumber(game.pot)}🔘.`;
            game.pot = 0;
            game.active = 0;
            game.revision = battleRules.add(game.revision, 1);
            game.outcome = 'collect';
          }
        }
        if (roll) {
          const result = slotsRules.spin(game, slotsRandom);
          slotsJackpot = safe(BigInt(slotsJackpot) + BigInt(result.jackpotContribution));
          if (result.payout === 'jackpot') {
            player.diamonds = safe(BigInt(player.diamonds) + BigInt(slotsJackpot));
            game.message = `🌟 You won the jackpot of ${compactNumber(slotsJackpot)}💎!`;
            slotsJackpot = slotsRules.RESET_JACKPOT;
          }
          if (result.snowballs) {
            // Ordinary snowballs are automated from this stage: award useful
            // unlocked specialty inventory, with a legacy-profile fallback.
            const unlocked = [kitchen.spicyUnlocked && 'spicy', battle.dirtyUnlocked && 'dirty'].filter(Boolean);
            const item = unlocked.length ? unlocked[slotsRules.integer(slotsRandom, 0, unlocked.length - 1)] : 'regular';
            if (item === 'spicy') kitchen.spicy = safe(BigInt(kitchen.spicy) + BigInt(result.snowballs));else if (item === 'dirty') battle.dirty = safe(BigInt(battle.dirty) + BigInt(result.snowballs));else player.snow = safe(BigInt(player.snow) + BigInt(result.snowballs * 10));
            game.message = `You received ${result.snowballs}${item === 'spicy' ? '🔴' : item === 'dirty' ? '🟤' : '⚪️ (as snow for automatic throws)'}.`;
          }
        }
        await query('UPDATE WinterSlotJackpots SET amount=:amount WHERE eventId=:eventId AND guildId=:guildId', {
          ...identity,
          amount: slotsJackpot
        });
      } else if (action === 'buy-recipe') {
        view = 'shop';
        if (battle.requiaUnlocked) message = 'You already own this Recipe.';else if (player.diamonds < RECIPE_PRICE) message = `You need ${compactNumber(RECIPE_PRICE)}💎 for this Recipe.`;else {
          player.diamonds -= RECIPE_PRICE;
          battle.requiaUnlocked = 1;
          view = 'requia-unlocked';
        }
      } else if (['opponent-hendrix', 'opponent-requia'].includes(action)) {
        view = action === 'opponent-hendrix' ? 'hendrix' : 'requia';
      } else if (action === 'test-strength') {
        battle.gym.strength = Math.min(MAX_LEVEL,battle.gym.strength+25);
        view=battle.active?'fight':battle.trainUnlocked?'train':'opponents';
        message='Testing: +25 STR.';
      } else if (action === 'test-sturdy') {
        view = 'fight';
        if (battle.active && battle.sturdyOwned) {
          battleRules.won(battle, now, battleSettings, undefined, true);
          message = 'Sturdy defeated for development testing.';
        } else {
          view = 'opponents';
          message = 'Start a Sturdy fight first.';
        }
      } else if (action === 'test-kill') {
        view = 'throw';
        if (progress.dummyHp > 0 || !shopProgress.snowmanOwned || battle.sturdyOwned) message = 'This testing control only defeats the Rough Snowman.';else if (!kitchen.spicyUnlocked) message = 'Discover your first recipe in Kylax’s Kitchen first.';else shopProgress.snowmanHp = 0;
      } else if (['train', 'train-strength', 'train-accuracy', 'train-defense', 'train-attack', 'train-dodge', 'train-speed', 'train-special', 'train-select', 'lift', 'lift20'].includes(action)) {
        view = 'train';
        if (battle.trainUnlocked) {
          if (battle.active) battle.pauseAt = now;
          battle.active = 0;
          battle.phase = 'paused';
          battle.trainIntroPending = 0;
          if (action === 'train-select') {
            if (battle.gymUnlocked[quantity]) battle.trainingSkill = quantity;
          } else if (['lift20', 'lift'].includes(action)) {
            message = liftWeight(battle, battleSettings);
          } else if (action.startsWith('train-')) message = buyLevels(battle, action.slice(6), quantity || '1');
        }
      } else if (action === 'beg') {
        view = 'diamonds';
        if (!shopProgress.helped || progress.dummyHp > 0) message = 'Ask Requia for help after breaking the training dummy first.';else if (tutorialGifts.diamondGift || progress.diamondsUnlocked) message = 'You already have your first diamond. You can make more in the Exchange.';else {
          player.diamonds = safe(BigInt(player.diamonds) + 1n);
          progress.diamondsUnlocked = 1;
          tutorialGifts.diamondGift = 1;
          view = 'diamond-gift';
        }
      } else if (action === 'shop-help') {
        view = 'shop';
        if (progress.dummyHp > 0) message = 'Practice with the training dummy first. Use /snow throw.';else if (shopProgress.helped) message = 'You already received Requia’s help.';else {
          shopProgress.helped = 1;
          // Snow through this timestamp was accrued at the old rate above.
          player.tier = Math.max(player.tier, 1);
          view = 'shovel-gift';
        }
      } else if (action === 'buy-snowman') {
        view = 'shop';
        if (!shopProgress.helped || progress.dummyHp > 0) message = 'Ask Requia for help after breaking the training dummy first.';else if (shopProgress.snowmanOwned) message = 'You already own the Rough Snowman.';else if (player.diamonds < 1) message = 'You need 1 💎 for a Rough Snowman.';else {
          player.diamonds -= 1;
          shopProgress.snowmanOwned = 1;
          shopProgress.snowmanHp = TARGETS.snowman;
          progress.diamondsUnlocked = 1;
          view = 'snowman-purchased';
        }
      } else if (['kitchen', 'pepper', 'mix', 'ingredient', 'recipe-cancel'].includes(action)) {
        view = 'kitchen';
        if (!kitchenReady && !kitchen.spicyUnlocked) {
          message = 'Practice with the Rough Snowman first.';
          view = 'throw';
        } else if (kitchen.spicyUnlocked) {
          if (action === 'ingredient') {
            if (recipeDraft.ingredients.length >= 7) message = 'A recipe can contain at most seven ingredients.';else {
              recipeDraft.ingredients.push(quantity);
              recipeDraft.ingredientOrder = shuffleIngredients(recipeDraft.ingredientOrder);
            }
          } else if (action === 'recipe-cancel') {
            recipeDraft.ingredients = [];
          } else if (action === 'mix') {
            if (recipeDraft.ingredients.length < 3) message = 'Recipes need three to seven ingredients.';else {
              const dirtyRecipe = recipeDraft.ingredients.join(',') === DIRTY_RECIPE.join(',');
              if (dirtyRecipe && battle.sturdyOwned && !battle.dirtyUnlocked) {
                battle.dirtyUnlocked = 1;
                battle.dirtyProgress = 0;
                view = 'dirty-unlocked';
              } else message = dirtyRecipe && battle.dirtyUnlocked ? 'You already know this recipe: 🟤 Dirty Snowball.' : recipeDraft.ingredients.length === 3 && recipeDraft.ingredients.every(i => i === 'pepper') ? 'You already know this recipe: 🔴 Spicy Snowball.' : 'This combination did not unlock a recipe. Try another combination.';
              recipeDraft.ingredients = [];
            }
          }
        } else if (action === 'pepper') {
          if (kitchen.peppers < 3) kitchen.peppers += 1;
        } else if (action === 'mix' && !kitchen.spicyUnlocked) {
          if (kitchen.peppers !== 3) message = 'This recipe needs three ingredients.';else {
            kitchen.spicyUnlocked = 1;
            kitchen.peppers = 0;
            view = 'spicy-unlocked';
          }
        }
      } else if (action === 'buy-spicy') {
        view = 'shop';
        const amount = quantity === 'max' ? Math.floor(player.snow / battleSettings.spicySnowCost) : Number(quantity || 1);
        if (!kitchen.spicyUnlocked) message = 'Discover the recipe in Kylax’s Kitchen first.';else if (!amount || player.snow < amount * battleSettings.spicySnowCost) message = 'You need 100❄️ for a Spicy Snowball.';else {
          kitchen.spicy = safe(BigInt(kitchen.spicy) + BigInt(amount));
          player.snow -= amount * battleSettings.spicySnowCost;
          battle.spicyPurchased = 1;
          message = `Crafted ${compactNumber(amount)} 🔴 Spicy Snowball${amount === 1 ? '' : 's'}.`;
          view = 'spicy-purchased';
        }
      } else if (action === 'buy-old-stone') {
        view = 'shop';
        if (!kitchen.spicyUnlocked) message = 'Discover your first recipe in Kylax’s Kitchen first.';else if (kitchen.oldStone) message = 'You already own the Old Skipping Stone.';else if (player.diamonds < 10) message = 'You need 10 💎 for the Old Skipping Stone.';else {
          player.diamonds -= 10;
          kitchen.oldStone = 1;
          player.tier = 2;
          view = 'stone-unlocked';
        }
      } else if (['attack', 'attack-spicy'].includes(action)) {
        view = 'throw';
        const hp = progress.dummyHp > 0 ? progress.dummyHp : shopProgress.snowmanOwned ? shopProgress.snowmanHp : 0;
        if (battle.sturdyOwned) view = battle.active ? 'fight' : battle.trainIntroPending ? 'battle-defeat' : 'opponents';else if (!hp) message = 'Your practice target is defeated!';else if (kitchenReady && !kitchen.spicyUnlocked) message = 'Visit Kylax’s Kitchen to discover a new recipe.';else if (action === 'attack-spicy') {
          if (!kitchen.spicyUnlocked || progress.dummyHp > 0 || !shopProgress.snowmanOwned) message = 'Discover the recipe and find a snowman first.';else if (!kitchen.spicy) message = 'You need a 🔴 Spicy Snowball from Requia’s Winter Shop.';else {
            kitchen.spicy -= 1;
            shopProgress.snowmanHp = Math.max(0, hp - 10);
            message = 'Your 🔴 Spicy Snowball dealt 10 damage!';
          }
        } else if (!player.snowballs) message = 'You need a snowball. Make one for 10 ❄️ below.';else {
          player.snowballs -= 1;
          if (progress.dummyHp > 0) progress.dummyHp -= 1;else shopProgress.snowmanHp -= 1;
          message = 'You threw a snowball for 1 damage!';
        }
      } else if (COSTS[action] && quantity !== undefined) {
        const resource = action === 'craft' ? 'snowballs' : action;
        if (action === 'craft') view = 'throw';
        const amount = quantity === 'max' ? Number(BigInt(player.snow) / BigInt(COSTS[action])) : Number(quantity);
        const cost = BigInt(amount) * BigInt(COSTS[action]);
        if (resource === 'snowballs' && kitchenReady && !kitchen.spicyUnlocked) {
          message = 'Visit Kylax’s Kitchen to discover a new recipe.';
          view = 'throw';
        } else if (!amount || BigInt(player.snow) < cost) message = 'Not enough snow for this conversion.';else {
          player[resource] = safe(BigInt(player[resource]) + BigInt(amount));
          player.snow = safe(BigInt(player.snow) - cost);
          message = `Created ${compactNumber(amount)} ${resource}.`;
        }
      } else if (action === 'buy-rock') {
        if (player.rock || player.tier === 2) message = 'Sturdy Rock is no longer for sale to you.';else if (player.diamonds < 10) message = 'You need 10 diamonds for a Sturdy Rock.';else {
          player.diamonds -= 10;
          player.rock = 1;
          message = 'Purchased 1 Sturdy Rock for 10 diamonds.';
        }
      } else if (action.startsWith('upgrade-')) {
        if (player.tier !== Number(action.slice(-1))) message = 'Your shovel has changed. Review the current upgrade.';else if (player.snow < SHOVELS[player.tier].cost || player.tier === 1 && !player.rock) message = 'You do not yet meet the upgrade requirements.';else {
          player.snow -= SHOVELS[player.tier].cost;
          if (player.tier === 1) player.rock = 0;
          player.tier += 1;
          message = `Upgraded to ${SHOVELS[player.tier].name}!`;
        }
      }
      if (battle.hendrixUnlocked) await query('INSERT OR IGNORE INTO BadgeOwnership (guildId,userId,badgeId,sourceEventId,awardedAt) VALUES (:guildId,:userId,:badgeId,:sourceEventId,:awardedAt)', {...identity, badgeId:'winter-2026:hen', sourceEventId:eventId, awardedAt:new Date(now).toISOString()});
      await query(`UPDATE WinterPlayers SET snow=:snow,snowballs=:snowballs,diamonds=:diamonds,
        tier=:tier,rock=:rock,lastAccrual=:lastAccrual,remainder=:remainder
        WHERE eventId=:eventId AND guildId=:guildId AND userId=:userId`, player);
      progress.snowballsUnlocked ||= Number(player.snowballs > 0);
      progress.diamondsUnlocked ||= Number(player.diamonds > 0);
      await query(`UPDATE WinterProgress SET welcomed=:welcomed,snowballsUnlocked=:snowballsUnlocked,
        diamondsUnlocked=:diamondsUnlocked,dummyHp=:dummyHp,restartToken=:restartToken
        WHERE eventId=:eventId AND guildId=:guildId AND userId=:userId`, progress);
      if (['throw', 'attack', 'attack-spicy', 'craft', 'kitchen', 'pepper', 'mix', 'ingredient', 'recipe-cancel'].includes(action) && !['welcome', 'not-ready'].includes(view) && progress.dummyHp === 0 && !shopProgress.snowmanOwned) {
        view = shopProgress.brokenSeen ? 'broken-again' : 'broken';
        shopProgress.brokenSeen = 1;
      }
      if ((view === 'throw' || action === 'throw' && !view) && battle.sturdyOwned) view = battle.active ? 'fight' : battle.trainIntroPending ? 'battle-defeat' : 'opponents';
      if ((view === 'throw' || action === 'throw' && !view) && !battle.sturdyOwned && progress.dummyHp === 0 && shopProgress.snowmanOwned && shopProgress.snowmanHp === 0) view = 'melted';
      if (battle.phase === 'defeat' && (action === 'battle-tick' || ['fight', 'battle-defeat'].includes(view))) {
        view = 'train';
        battle.trainIntroPending = 0;
      }
      if(battle.buttons>0){battle.zeroButtonThrows=0;battle.zeroButtonWindowActive=0;}
      if (battle.buttonIntroPending && !action.startsWith('restart') && !['admin', 'grant-sweat', 'grant-snow', 'grant-ammo'].includes(action)) view = 'button-found';
      if (view==='train' && battle.trainUnlocked) {
        battle.gymVisited=1;
        if(!battle.gymStarterClaimed) {
          battle.sweat=safe(BigInt(battle.sweat)+BigInt(battleSettings.gymStarterSweat));
          battle.gymStarterClaimed=1;
          message=[message,'You received '+battleSettings.gymStarterSweat+'💦 to get started.'].filter(Boolean).join('\n\n');
        }
      }
      await query(`UPDATE WinterShopProgress SET helped=:helped,brokenSeen=:brokenSeen,
        snowmanOwned=:snowmanOwned,snowmanHp=:snowmanHp
        WHERE eventId=:eventId AND guildId=:guildId AND userId=:userId`, shopProgress);
      await query(`UPDATE WinterTutorialGifts SET diamondGift=:diamondGift
        WHERE eventId=:eventId AND guildId=:guildId AND userId=:userId`, tutorialGifts);
      await query(`UPDATE WinterKitchen SET peppers=:peppers,spicyUnlocked=:spicyUnlocked,spicy=:spicy,oldStone=:oldStone
        WHERE eventId=:eventId AND guildId=:guildId AND userId=:userId`, kitchen);
      await query(`UPDATE WinterRecipeDrafts SET ingredients=:ingredients,ingredientOrder=:ingredientOrder
        WHERE eventId=:eventId AND guildId=:guildId AND userId=:userId`, {
        ...identity,
        ingredients: JSON.stringify(recipeDraft.ingredients),
        ingredientOrder: JSON.stringify(recipeDraft.ingredientOrder)
      });
      await query(`UPDATE WinterBattles SET active=:active,nextAt=:nextAt,state=:state
        WHERE eventId=:eventId AND guildId=:guildId AND userId=:userId`, {
        ...identity,
        active: battle.active,
        nextAt: battle.active ? Math.min(battle.nextPlayerAt, battle.nextEnemyAt) : 0,
        state: JSON.stringify(battle)
      });
      player.shovelTier = battle.ironShovelOwned ? 3 : player.tier;
      player.productionRate = battle.ironShovelOwned ? battleSettings.ironRate : SHOVELS[player.tier].rate;
      const receipt = {
        player,
        progress,
        shopProgress,
        tutorialGifts,
        kitchen,
        recipeDraft,
        battle,
        now,
        message,
        ...(slotsJackpot !== undefined ? {
          slotsJackpot
        } : {}),
        ...(continueCommand ? {
          continueCommand
        } : {}),
        ...(view ? {
          view
        } : {})
      };
      await query(`INSERT ${automatic ? 'OR REPLACE ' : ''}INTO WinterInteractions VALUES (:interactionId,:eventId,:guildId,:userId,:action,:receipt)`, {
        ...identity,
        action: operation,
        receipt: JSON.stringify(receipt)
      });
      return receipt;
    }));
  }
  async function dueBattles() {
    return serialize(sequelize, async () => {
      const [tables] = await sequelize.query("SELECT name FROM sqlite_master WHERE type='table' AND name='WinterBattles'");
      if (!tables.length) return [];
      const [rows] = await sequelize.query('SELECT guildId,userId,state,nextAt FROM WinterBattles WHERE eventId=$eventId AND active=1 AND nextAt<=$now', {
        bind: {
          eventId,
          now: Math.min(endsAt, timestamp(clock()))
        }
      });
      return rows.map(row => ({
        ...row,
        battle: JSON.parse(row.state)
      }));
    });
  }
  return {
    execute,
    initialize,
    dueBattles
  };
}
module.exports = {
  createEconomy,
  SHOVELS,
  COSTS,
  TARGETS
};
