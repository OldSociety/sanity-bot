const path = require('node:path');
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require('discord.js');
const {
  SHOVELS,
  COSTS,
  TARGETS
} = require('./economy');
const {
  IDS,
  DIRTY_RECIPE,
  emojiFor
} = require('./recipes');
const {
  confirmationButtons
} = require('../confirmation-controls');
const {
  config: battleConfig,
  hasStarted,
  derived
} = require('./battle');
const {
  compactNumber: format
} = require('./numbers');
const {
  SKILLS,
  MAX_LEVEL,
  LIFT_TAUNT,
  RECIPE_PRICE,
  totalCost
} = require('./gym');
const {
  dialogue
} = require('../character-dialogue');
const slotsRules = require('./slots');
const {TRADES}=require('./shovels');
const snowmen=require('./opponents');
function screen({
  player: p,
  progress = {},
  shopProgress = {},
  tutorialGifts = {},
  kitchen = {},
  recipeDraft = {},
  battle = {},
  message,
  continueCommand,
  slotsJackpot
}, view = 'status', {
  development = false,
  now = Date.now()
} = {}) {
  if (['shovel', 'snowballs'].includes(view)) view = 'status';
  const kitchenReady = shopProgress.snowmanOwned && shopProgress.snowmanHp <= TARGETS.snowman - TARGETS.kitchenHits && !kitchen.spicyUnlocked;
  const tier = p.shovelTier ?? (battle.ironShovelOwned ? 3 : p.tier);
  const shovel = SHOVELS[tier];
  const next = tier >= 3 ? 'Maximum shovel unlocked' : tier === 2 ? 'Iron: 1m❄️ + Iron material' : SHOVELS[tier + 1].name;
  const stats = derived(battle);
  const number = n => format(Math.floor(n));
  const available = [`${format(p.snow)}❄️`];
  const idleStarted = hasStarted(battle);
  if (!idleStarted && (progress.snowballsUnlocked || p.snowballs)) available.push(`${format(p.snowballs)}⚪️`);
  if (kitchen.spicyUnlocked) available.push(`${format(kitchen.spicy || 0)}🔴`);
  if (battle.dirtyUnlocked) available.push(`${format(battle.dirty || 0)}🟤`);
  if (progress.diamondsUnlocked || p.diamonds) available.push(`${format(p.diamonds)}💎`);
  if (idleStarted) available.push(`${format(battle.sweat)}💦`);
  if (battle.buttonsUnlocked) available.push(`${format(battle.buttons || 0)}🔘`);
  const embed = new EmbedBuilder().setColor(0xadd8e6).setTitle({
    admin: 'Winter testing controls',
    'snow-slots': 'Snow Slots 🎰',
    'button-found': 'Look at that!',
    emporium: 'Azule’s Emporium',
    slots: 'Zalathor’s Winter Slots 🎰',
    welcome: 'Welcome to Winter Wars ❄️',
    status: 'Winter Wars · Snow',
    snowballs: 'Snowball Factory',
    diamonds: '💎 Exchange',
    'diamond-gift': '💎 Exchange',
    shop: 'Requia’s Winter Shop',
    shovel: 'Shovels',
    throw: shopProgress.snowmanOwned && progress.dummyHp === 0 ? 'Rough Snowman ⛄️' : 'Training Dummy',
    help: 'Winter Wars · Help',
    restart: 'Restart your development profile?',
    broken: 'Oh No!',
    'broken-again': 'Oh No!',
    'shovel-gift': 'Congratulations!',
    'snowman-purchased': 'Rough Snowman purchased! ⛄️',
    kitchen: 'Kylax’s Kitchen 🌶️',
    'spicy-unlocked': 'New Snowball Unlocked!',
    'spicy-purchased': 'Spicy Snowballs 🔴',
    'hidden': 'New Recipe!',
    'dirty-unlocked': 'Dirty Snowball Unlocked!',
    'not-ready': 'Not ready yet',
    'stone-unlocked': 'New Shovel Unlocked!',
    melted: 'Not again!',
    'sturdy-purchased': 'New Opponent Unlocked!',
    'hendrix-unlocked': 'New Opponent Unlocked!',
    'requia-unlocked': 'New Opponent Unlocked!',
    hendrix: 'Hendrix 💪🏽',
    requia: 'Requia 💎',
    opponents: 'Choose your opponent',
    fight: 'Snowman ⛄️',
    'battle-defeat': 'Oh No!',
    train: 'Hendrix’s Gym 💪🏽'
  }[view]).setFooter({
    text: `Available: ${available.join(' · ')}`
  });
  const button = (action, label, disabled = false, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(`snow:${p.userId}:${action}`).setLabel(label).setStyle(style).setDisabled(disabled);
  const row = (...buttons) => new ActionRowBuilder().addComponents(...buttons);
  const components = [],
    files = [];
  const thumbnail = name => {
    embed.setThumbnail(`attachment://winter-${name}.png`);
    files.push(new AttachmentBuilder(path.join(__dirname, `../../assets/winter/${name}.png`), {
      name: `winter-${name}.png`
    }));
  };
  const badge = (folder, file, name) => {
    embed.setThumbnail(`attachment://${name}.png`);
    files.push(new AttachmentBuilder(path.join(__dirname, '../../assets/badges', folder, file), {
      name: `${name}.png`
    }));
  };
  const quantities = (action, cost, crafting = false) => {
    const capacity = Math.floor(p.snow / cost);
    if (!capacity) return;
    const values = ['1', '10', '100'].filter(q => Number(q) <= capacity);
    values.push('max');
    components.push(row(...values.map(q => button(`${action}:${q}`, crafting ? q === 'max' ? 'Make Max ⚪️' : `Make ×${q} ⚪️` : q === 'max' ? 'Max' : `×${q}`))));
  };
  if (view === 'admin') {
    embed.setDescription(message || 'Development testing resources.');
    components.push(row(button('grant-sweat', '+100💦'), button('grant-snow', '+1 hour ❄️'), button('grant-ammo', '+10 each snowball')));
  } else if (view === 'snow-slots') {
    embed.setDescription([message, '10k❄️ per spin. Win 🔘 Buttons.'].filter(Boolean).join('\n\n'));
    components.push(row(button('snow-spin:1', 'Spin · 10k❄️', p.snow < 10000), button('snow-spin:10', '×10 · 100k❄️', p.snow < 100000), button('emporium', 'Emporium')));
  } else if (view === 'button-found') {
    embed.setDescription(dialogue('Look at that! You hit the Snowman so hard one of its buttons popped out. Now where can you spend that?'));
    components.push(row(button('emporium', 'Emporium', false, ButtonStyle.Success)));
  } else if (view === 'emporium') {
    badge('Classic', 'AZULIS_BADGE.png', 'winter-emporium-badge');
    embed.setDescription([message, dialogue('Welcome! What do you have there? A button. Well, there’s not much I can do with a single button, but if you get more I can get you out of those drab clothes and into something with a bit more glam.')].filter(Boolean).join('\n\n'));
    embed.addFields(
      { name: 'Mittens 🧤', value: battle.mittensOwned ? 'Owned' : '10🔘', inline: true },
      { name: 'Fire Flower 🌺', value: battle.fireFlowerOwned ? 'Owned' : '50🔘', inline: true },
      { name: 'First Outfit', value: battle.outfitOwned ? 'Owned' : '100🔘', inline: true });
    const wares = [];
    if (!battle.mittensOwned) wares.push(button('buy-mittens', 'Mittens 🧤 · 10🔘', battle.buttons < battleConfig.mittenCost));
    if (!battle.fireFlowerOwned) wares.push(button('buy-fire-flower', 'Fire Flower 🌺 · 50🔘', battle.buttons < battleConfig.fireFlowerCost));
    if (wares.length) components.push(row(...wares));
    if (!battle.outfitOwned) components.push(row(button('buy-outfit', 'First Outfit · 100🔘', battle.buttons < 100)));
    components.push(row(button('slots', 'Slots'), button('throw', 'Throw')));
  } else if (view === 'slots') {
    const game = battle.slots;
    const stage = slotsRules.STAGES[game?.stage || 0];
    embed.setColor(stage.color);
    embed.setDescription([message, game?.message, !game?.active ? dialogue('Welcome to my game of chance. It’s not fair, but give it a spin anyway.') : null, 'Advance through Red, Blue, Green, Silver and Gold. Each roll risks your Button pot. Collect whenever you like; snowball prizes are yours to keep.'].filter(Boolean).join('\n\n')).addFields({
      name: 'Stage',
      value: stage.name,
      inline: true
    }, {
      name: 'Pot',
      value: `${format(game?.pot || 0)}🔘`,
      inline: true
    }, {
      name: 'Jackpot',
      value: `${format(slotsJackpot ?? slotsRules.INITIAL_JACKPOT)}💎`,
      inline: true
    });
    if (game?.active) components.push(row(button(`slots-spin:${slotsRules.control(game)}`, 'Spin 🎰', false, ButtonStyle.Primary), button(`slots-collect:${slotsRules.control(game)}`, `Collect ${format(game.pot)}🔘`, false, ButtonStyle.Success)));else components.push(row(...slotsRules.STAKES.map(stake => button(`slots-bet:${stake}`, `${format(stake)}🔘`, (battle.buttons || 0) < stake, stake === 100 ? ButtonStyle.Danger : ButtonStyle.Primary))));
    components.push(row(button('emporium', 'Emporium')));
  } else if (view === 'not-ready') {
    embed.setDescription(`You’re not ready for that yet. Try using \`/snow ${continueCommand}\` instead.`);
    components.push(row(button(continueCommand, 'Continue', false, ButtonStyle.Success)));
  } else if (view === 'hidden') {
    embed.setDescription(DIRTY_RECIPE.map(emojiFor).join(''));
  } else if (view === 'dirty-unlocked') {
    embed.setDescription(dialogue('Wow that’s gross.'));
    components.push(row(button('throw', 'Throw')));
  } else if (view === 'spicy-purchased') {
    embed.setDescription(message);
    components.push(row(button('throw', 'Throw')));
  } else if (view === 'welcome') {
    embed.setDescription('Prepare to go toe to toe in the crazy snowball fight ever seen. Every second you play, you’ll collect ❄️ Snow that you can use against your enemies. Each snowball costs 10 ❄️.\n\nTo get started use `/snow throw`. Use the `/snow help` command if you get stuck.');
    components.push(row(button('throw', 'Throw'), button('help', 'Help')));
  } else if (view === 'restart') {
    embed.setDescription('Restart your Winter Wars development profile from the beginning?\n\nYou will have **10 ❄️**, Bare Hands, no snowballs or diamonds, and a fresh dummy. Your currency discoveries and shop progress will also reset.');
    components.push(row(...confirmationButtons(`snow:${p.userId}:restart-confirm:${progress.restartToken}`, `snow:${p.userId}:restart-cancel`)));
  } else if (['broken', 'broken-again'].includes(view)) {
    embed.setDescription(dialogue(view === 'broken' ? 'You broke it! What were you thinking?! You better use `/snow shop` to replace it.' : 'I told you, you broke it! You’ve got to replace it in the `/snow shop`.'));
    thumbnail('broken-dummy');
    components.push(row(button('shop', 'Requia’s Winter Shop')));
  } else if (view === 'melted') {
    embed.setDescription(dialogue('Not again! You know what to do.'));
    thumbnail('melted-snowman');
    components.push(row(button('shop', 'Shop')));
  } else if (['sturdy-purchased', 'opponents'].includes(view)) {
    if (view === 'sturdy-purchased') embed.setTitle('New Opponent Unlocked!');
    embed.setDescription([message, dialogue('Alright, now we’re talking. This snowman is no pushover. Be careful because he fights back!')].filter(Boolean).join('\n\n'));
    const opponents = snowmen.available(battle,battleConfig).map((enemy,index)=>button(`battle-opponent:${enemy.id}.${battle.fightId}`, index ? enemy.name+' ⛄️' : '⛄️',false,ButtonStyle.Success));
    if (battle.hendrixUnlocked) opponents.push(button('opponent-hendrix', 'Hendrix 💪🏽'));
    if (battle.requiaUnlocked) opponents.push(button('opponent-requia', 'Requia 💎'));
    for(let i=0;i<opponents.length;i+=5) components.push(row(...opponents.slice(i,i+5)));
    if (battle.emporiumUnlocked) components.push(row(button('emporium', 'Emporium')));
  } else if (['hendrix-unlocked', 'requia-unlocked'].includes(view)) {
    embed.setTitle('New Opponent Unlocked!').setDescription(view === 'hendrix-unlocked' ? 'You lifted 100lbs! Hendrix is ready to face you. 💪🏽' : 'You unlocked Requia! 💎');
    components.push(row(button('throw', 'Opponents')));
  } else if (['hendrix', 'requia'].includes(view)) {
    const name = view === 'hendrix' ? 'Hendrix' : 'Requia';
    embed.setTitle(view === 'hendrix' ? 'Hendrix 💪🏽' : 'Requia 💎').setDescription(`${name} is sizing you up. Come back soon.`);
    components.push(row(button('throw', 'Opponents')));
  } else if (view === 'fight') {
    const health = (hp, max, color = '🟩') => {
      const filled = Math.ceil(10 * hp / max);
      return `**${number(hp)}/${number(max)} HP**\n${color.repeat(filled)}${'⬛'.repeat(10 - filled)}`;
    };
    embed.setDescription([message, battle.lastEvent].filter(Boolean).join('\n\n') || 'You’re automatically throwing snowballs. Each throw uses 10 ❄️.').addFields({
      name: snowmen.current(battle,battleConfig).name,
      value: `${health(battle.enemyHp, battle.enemyMaxHp, '🟥')}\n⛄️ Defeated: ${format(snowmen.wins(battle))}${battle.stunRemaining ? `\n💫 Stunned: ${battle.stunRemaining}` : ''}`
    }, {
      name: 'You',
      value: health(battle.playerHp, stats.maxHp)
    });
    embed.addFields({
      name: 'Combat',
      value: number(battleConfig.regularDamage * stats.multiplier) + ' regular · ' + number(battleConfig.specialDamage * stats.specialMultiplier * (battle.fireFlowerOwned ? battleConfig.fireFlowerMultiplier : 1)) + ' special · ' + number(stats.accuracy * 100) + '% hit · ' + number(stats.dodge * 100) + '% dodge'
    }, {
      name: 'Special queue ' + (battle.queue?.length || 0) + '/' + (battle.queueCapacity || 1),
      value: battle.queue?.length ? battle.queue.map(q => q === 'spicy' ? (battle.fireFlowerOwned ? '🔥' : '🔴') : '🟤').join(' ') : 'Empty'
    });
    thumbnail('snowman');
    const attacks = [];
    if (kitchen.spicyUnlocked) attacks.push(button(`battle-special:${battle.fightId}`, battle.fireFlowerOwned ? '🔥' : '🔴', kitchen.spicy < (battle.fireFlowerOwned ? battleConfig.fireFlowerAmmo : 1) || (battle.queue?.length || 0) >= (battle.queueCapacity || 1) || kitchen.spicy < ((battle.queue || []).filter(q => q === 'spicy').length + 1) * (battle.fireFlowerOwned ? battleConfig.fireFlowerAmmo : 1), ButtonStyle.Primary));
    if (battle.dirtyUnlocked) attacks.push(button(`battle-dirty:${battle.fightId}`, '🟤', !battle.dirty || battle.stunRemaining > 0 || (battle.queue?.length || 0) >= (battle.queueCapacity || 1) || battle.dirty <= (battle.queue || []).filter(q => q === 'dirty').length, ButtonStyle.Primary));
    attacks.push(button(`battle-pause:${battle.fightId}`, 'Cancel', false, ButtonStyle.Danger));
    components.push(row(...attacks));
    components.push(row(button('train', 'Gym'), button('throw', 'Refresh'), ...(snowmen.available(battle,battleConfig).length>1 ? [button('opponents','Opponents')] : [])));
    if (development) components.push(row(button('test-sturdy', 'Defeat opponent · Test', false, ButtonStyle.Danger),button('test-strength','+25 STR · Test')));
  } else if (view === 'battle-defeat') {
    embed.setDescription('You lost. It’s time to hit the gym and get stronger. Use `/snow train`.');
    components.push(row(button('train', 'Train', false, ButtonStyle.Success)));
  } else if (view === 'train') {
    badge('Classic', 'HENDRIX_BADGE.png', 'winter-gym-badge');
    const [firstLine,...extraLines] = (message || '').split('\n\n');
    const taunt = firstLine === LIFT_TAUNT || firstLine === 'You need more strength to lift this.';
    embed.setDescription([taunt ? dialogue(firstLine) : dialogue('It’s time to train. No complaints!'), taunt ? extraLines.join('\n\n') : message].filter(Boolean).join('\n\n'));
    const gym = battle.gym || {},
      skills = SKILLS.filter(skill => battle.gymUnlocked?.[skill.id]);
    embed.addFields(...skills.map(skill => ({
      name: skill.emoji + ' ' + skill.short,
      value: gym[skill.id] >= MAX_LEVEL ? 'MAX' : 'Level ' + gym[skill.id] + ' · Cost: ' + (gym[skill.id] + 1) + '💦',
      inline: true
    })));
    embed.addFields({
      name: 'Combat stats',
      value: number(stats.maxHp) + ' HP · ' + number(battleConfig.regularDamage * stats.multiplier) + ' damage · ' + number(stats.accuracy * 100) + '% hit · ' + number(stats.dodge * 100) + '% dodge'
    });
    if (skills.length) components.push(row(...skills.map(skill => button('train-' + skill.id + ':1', skill.emoji + ' ' + skill.short + ' · Cost: ' + (gym[skill.id] >= MAX_LEVEL ? 'MAX' : (gym[skill.id] + 1) + '💦'), gym[skill.id] >= MAX_LEVEL || battle.sweat < gym[skill.id] + 1))));
    if(development) components.push(row(button('test-strength','+25 STR · Test')));
    if ((battle.weightStage || 0) < battleConfig.weightSteps.length) components.push(row(button('lift', '🏋️ ' + battleConfig.weightSteps[battle.weightStage || 0] + ' lb', false, ButtonStyle.Secondary)));
  } else if (view === 'kitchen') {
    badge('Winter', 'WINTER_KYLAX_BADGE.png', 'winter-kitchen-badge');
    if (kitchen.spicyUnlocked) {
      const ingredients = recipeDraft.ingredients || [];
      const ingredientOrder = recipeDraft.ingredientOrder || IDS;
      embed.setDescription([dialogue('Welcome back.'), message].filter(Boolean).join('\n\n')).addFields({
        name: 'Recipes',
        value: ['1. 🌶️🌶️🌶️', ...Array.from({
          length: 9
        }, (_, i) => `${i + 2}. ${i === 0 && battle.dirtyUnlocked ? DIRTY_RECIPE.map(emojiFor).join('') : '❔❔❔❔❔❔❔'}`)].join('\n')
      }, {
        name: 'Enter Recipe:',
        value: ingredients.map(emojiFor).join('') + '❔'.repeat(7 - ingredients.length)
      });
      components.push(row(...ingredientOrder.map(id => button(`ingredient:${id}`, emojiFor(id), ingredients.length >= 7))));
      const controls = [];
      if (ingredients.length >= 3) controls.push(button('mix', 'Mix', false, ButtonStyle.Success));
      controls.push(button('recipe-cancel', 'Cancel', false, ButtonStyle.Danger));
      components.push(row(...controls));
    } else {
      embed.setDescription([message, dialogue('Hey there! First time? Don’t worry, cooking is easy and I’m here to help. First things first. My kitchen is a great place to unlock all sorts of goodies, but you need recipes. Each recipe requires 3 to 7 **Ingredients**. Below you’ll see a number of buttons. Enter your recipe by clicking the right ones then hitting **Mix**. If the recipe is correct, you’ll unlock something new!\n\nTo get you started, I’ll give you your first recipe. 🤫 Don’t tell anyone: 🌶️🌶️🌶️')].filter(Boolean).join('\n\n')).addFields({
        name: 'Recipes',
        value: `${'🌶️'.repeat(kitchen.peppers || 0)}${'❔'.repeat(7 - (kitchen.peppers || 0))}`
      });
      components.push(row((kitchen.peppers || 0) < 3 ? button('pepper', '🌶️') : button('mix', 'Mix', false, ButtonStyle.Success)));
    }
  } else if (view === 'spicy-unlocked') {
    embed.setDescription('You’ve unlocked the 🔴 Spicy Snowball. Snowmen everywhere beware!');
    components.push(row(button('shop', 'Back to Shop')));
  } else if (view === 'stone-unlocked') {
    embed.setDescription('You received the Stone Shovel 🪏. You’re now collecting 36❄️/second.');
    components.push(row(button('shop', 'Back to Shop')));
  } else if (view === 'shop') {
    badge('Classic', 'REQUIA_BADGE.png', 'winter-shop-badge');
    embed.setColor(0x00ff00);
    if (!shopProgress.helped) {
      embed.setDescription([message, dialogue('Welcome to my shop. Here you will find all the things you’ll need to win your war.'), dialogue(progress.dummyHp === 0 ? 'It looks like you broke the training dummy, maybe we can do something about it.' : 'Try out the training dummy with `/snow throw`, then come see me if you need a hand.')].filter(Boolean).join('\n\n'));
      if (progress.dummyHp === 0) components.push(row(button('shop-help', 'Please help me 🙏🏽', false, ButtonStyle.Success)));else components.push(row(button('throw', 'Throw')));
    } else {
      embed.setDescription([message, dialogue(progress.diamondsUnlocked || p.diamonds ? !shopProgress.snowmanOwned ? 'Now you’re ready to replace that training dummy with something a bit tougher.' : 'Welcome back! Check out my wares below:' : 'You’re back! I’m happy to continue helping you out, but you’ll need to turn that snow into diamonds. Check out the 💎 Exchange below.')].filter(Boolean).join('\n\n'));
      if (progress.diamondsUnlocked || p.diamonds) {
        if (!shopProgress.snowmanOwned) {
          embed.addFields({
            name: '`Rough Snowman` ⛄️',
            value: '**1💎**',
            inline: true
          });
          components.push(row(button('buy-snowman', 'Rough ⛄️ · 1💎', p.diamonds < 1, ButtonStyle.Primary)));
        } else if (shopProgress.snowmanHp === 0) {
          embed.addFields({
            name: '`Sturdy Snowman` ⛄️',
            value: battle.sturdyOwned ? 'Owned' : `**${format(battleConfig.sturdyPriceDiamonds)}💎**`,
            inline: true
          });
          if (!battle.sturdyOwned) components.push(row(button('buy-sturdy', `Sturdy ⛄️ · ${format(battleConfig.sturdyPriceDiamonds)}💎`, p.diamonds < battleConfig.sturdyPriceDiamonds, ButtonStyle.Primary)));
        }
        if (kitchen.spicyUnlocked) {
          embed.addFields({
            name: '🔴 `Spicy Snowballs`',
            value: '**' + format(battleConfig.spicySnowCost) + '❄️**',
            inline: true
          }, {
            name: '`Old Skipping Stone`',
            value: kitchen.oldStone ? 'Owned' : '**10💎**',
            inline: true
          });
          const capacity = Math.floor(p.snow / battleConfig.spicySnowCost);
          components.push(row(...['1', '10', '100', 'max'].filter(q => q === 'max' || Number(q) <= capacity).map(q => button('buy-spicy:' + q, q === 'max' ? 'Spicy 🔴 Max' : 'Spicy 🔴 ×' + q + ' · ' + format(Number(q) * battleConfig.spicySnowCost) + '❄️', !capacity, ButtonStyle.Primary))));
          const wares = [];
          if (!kitchen.oldStone) wares.push(button('buy-old-stone', 'Old Skipping Stone · 10💎', p.diamonds < 10, ButtonStyle.Primary));
          if (battle.sturdyOwned) {
            embed.addFields({
              name: '`Recipe`',
              value: battle.requiaUnlocked ? 'Owned' : `**${format(RECIPE_PRICE)}💎**`,
              inline: true
            });
            if (!battle.requiaUnlocked) wares.push(button('buy-recipe', `Recipe · ${format(RECIPE_PRICE)}💎`, p.diamonds < RECIPE_PRICE, ButtonStyle.Primary));
          }
          if (wares.length) components.push(row(...wares));
        }
      }
      const trades=TRADES.filter(t=>battle[t.material] && !battle[t.owned]);
      for (const trade of trades) embed.addFields({name:'`'+trade.name+'`',value:'Iron material + '+format(battleConfig[trade.costKey])+'❄️',inline:true});
      if(trades.length) components.push(row(...trades.map(t=>button(t.id,t.name+' · '+format(battleConfig[t.costKey])+'❄️',p.tier!==t.requiredTier || p.snow<battleConfig[t.costKey]))));
      const shopNav = [button('diamonds', '💎 Exchange')];
      if (kitchenReady || kitchen.spicyUnlocked) {
        const navigation = [...shopNav, button('kitchen', 'Kitchen 🌶️')];
        if (kitchen.spicyUnlocked && shopProgress.snowmanOwned && (shopProgress.snowmanHp > 0 || battle.sturdyOwned)) navigation.push(button('throw', 'Throw'));
        if (battle.emporiumUnlocked) navigation.push(button('emporium', 'Emporium'));
        components.push(row(...navigation));
      } else if (shopProgress.snowmanOwned && shopProgress.snowmanHp > 0) components.push(row(...shopNav, button('throw', 'Throw')));else components.push(row(...shopNav));
    }
  } else if (view === 'shovel-gift') {
    embed.setColor(0x00ff00).setDescription(dialogue(p.tier === 1 ? 'I can’t fix the dummy, but maybe we can make something useful out of it instead.\n\nYou’ve unlocked the **Wooden Shovel** 🪏.\n\nYou’re now collecting snow at **6❄️/second**. There are plenty more shovels out there to help you collect snow for your wars. Good luck!' : `You already have a ${shovel.name}, collecting ${shovel.rate}❄️/second. Keep your stronger shovel! Good luck!`));
    components.push(row(button('shop', 'Back to Shop')));
  } else if (view === 'snowman-purchased') {
    embed.setColor(0x00ff00).setDescription('You found a new way to practice! Use `/snow throw` to continue on your winter journey.');
    thumbnail('snowman');
    components.push(row(button('shop', 'Back to Shop'), button('throw', 'Throw')));
  } else if (view === 'throw') {
    const snowman = shopProgress.snowmanOwned && progress.dummyHp === 0;
    const maximum = snowman ? TARGETS.snowman : TARGETS.dummy;
    const hp = Math.min(maximum, snowman ? shopProgress.snowmanHp : progress.dummyHp ?? TARGETS.dummy);
    const segments = snowman ? 10 : TARGETS.dummy;
    const filled = Math.ceil(hp / maximum * segments);
    embed.setDescription(snowman && kitchenReady ? dialogue('This is going to take forever. Let’s go to the Kitchen and create something a bit more impactful.') : [message, hp ? 'Practice your aim! Each throw uses 1 ⚪️ and deals 1 damage.' : 'You defeated the Rough Snowman!', `**${hp}/${maximum} HP**\n${'🟩'.repeat(filled)}${'⬛'.repeat(segments - filled)}`].filter(Boolean).join('\n\n'));
    thumbnail(snowman ? 'snowman' : 'dummy');
    if (kitchenReady) components.push(row(button('kitchen', 'Kitchen 🌶️'), button('shop', 'Shop')));else {
      const attacks = [button('attack', 'Throw · 1 ⚪️', !p.snowballs || !hp, ButtonStyle.Primary)];
      if (snowman && kitchen.spicyUnlocked) attacks.push(button('attack-spicy', 'Throw · 1 🔴', !kitchen.spicy || !hp, ButtonStyle.Danger));
      if (development && snowman && kitchen.spicyUnlocked && hp) attacks.push(button('test-kill', 'Defeat Rough · Test', false, ButtonStyle.Danger));
      components.push(row(...attacks));
      quantities('craft', 10, true);
      components.push(row(button('throw', 'Refresh'), button('shop', 'Shop'), button('help', 'Help')));
    }
  } else if (view === 'help') {
    embed.setDescription('Collect ❄️ Snow automatically, including while offline.\n\nUse `/snow throw` to visit your practice target. **10 ❄️ → 1 ⚪️**, dealing **1 damage**. The dummy has **5 HP**.\n\nAfter it breaks, visit Requia’s Winter Shop for a free wooden shovel (**6❄️/second**). Beg in the 💎 Exchange for your first diamond, then buy a **Rough Snowman for 1 💎** (**50 HP**). After three hits, visit Kylax’s Kitchen to discover **🌶️🌶️🌶️**.\n\nUnlocked 🔴 Spicy Snowballs cost **100❄️ each** and deal **10 damage**. Exchange **1k ❄️ → 1 💎** for more supplies.\n\nDiscovered resources stay in your footer even at zero.');
    components.push(row(button('throw', 'Throw'), button('shop', 'Shop')));
  } else if (['diamonds', 'diamond-gift', 'snowballs'].includes(view)) {
    const exchange = view !== 'snowballs';
    const action = exchange ? 'diamonds' : 'snowballs';
    const canBeg = exchange && shopProgress.helped && !progress.diamondsUnlocked && !p.diamonds && !tutorialGifts.diamondGift;
    embed.setDescription([canBeg ? dialogue('Need a hand making your first diamond? Ask me for a little help.') : view === 'diamond-gift' ? dialogue('Fine! I’ll show you how it’s done. See it’s easy! But from now on you’re paying full price. I have a business to run.') : message, `${format(COSTS[action])} ❄️ → 1 ${exchange ? '💎' : '⚪️'}`].filter(Boolean).join('\n\n'));
    if (view === 'diamond-gift') components.push(row(button('shop', 'Back to Shop')));else if (canBeg) components.push(row(button('beg', 'Beg', false, ButtonStyle.Success)));
    quantities(action, COSTS[action]);
    const navigation = [button(action, 'Refresh')];
    if (view !== 'diamond-gift') navigation.unshift(button('shop', 'Back to Shop'));
    if (!exchange) navigation.push(button('throw', 'Throw'));
    components.push(row(...navigation));
  } else {
    embed.setDescription(message || 'Snow collects automatically, including while you are offline.').addFields({
      name: 'Equipment',
      value: `${shovel.name}\n${shovel.rate} snow/second`,
      inline: true
    });
    const navigation = [button('diamonds', '💎 Exchange'), button('shop', 'Shop')];
    if (battle.emporiumUnlocked) navigation.push(button('emporium', 'Emporium'),button('slots','Slots'));
    components.push(row(...navigation));
    components.push(row(button('throw', 'Throw'), button('help', 'Help')));
  }
  // The shop is introduced only after the training dummy has been broken.
  const visibleComponents = components.map(component => {
    const buttons = component.components.filter(b => {
      const action = b.data.custom_id.split(':')[2];
      if (action==='train' && !battle.gymVisited) return false;
      if (['help', 'shovel', 'snowballs'].includes(action)) return false;
      if (progress.dummyHp !== 0 && action === 'shop') return false;
      if (kitchenReady && ['throw', 'snowballs', 'attack', 'attack-spicy', 'craft'].includes(action)) return false;
      return true;
    });
    return buttons.length ? row(...buttons) : null;
  }).filter(Boolean);
  // Always the final testing button, including on confirmation screens.
  if (development) visibleComponents.push(row(button('restart', 'Restart', false, ButtonStyle.Danger)));
  return {
    content: '',
    embeds: [embed],
    components: visibleComponents,
    files,
    attachments: [],
    allowedMentions: {
      parse: []
    }
  };
}
module.exports = {
  screen
};
