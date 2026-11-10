const { chapterTwo, nextGoal } = require('./progression');
// NPC dialogue, portraits and page layout for the current game. This module only
// projects state and controls; it never executes the legacy economy or combat.
const { screen: originalScreen } = require('../presentation');
const { config } = require('../battle');
const { dialogue } = require('../../character-dialogue');
const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const path = require('node:path');
const { nnorahc } = require('./characters');
const { discovered } = require('./discoveries');
const M = require('./game');
const { timingText } = require('./response-times');
const { compactNumber } = require('../numbers');
const { gymLine, unavailable } = require('./dialogue');
const brown = require('./brown-snowballs');
const controlLayout = require('./snowman-selection');
const { IDS, DIRTY_RECIPE, emojiFor } = require('../recipes');
const actionOf = (b) => b.data.custom_id.split(':')[4];
function restore(receipt, userId, output, location) {
  const s = receipt.state,
    known = discovered(s),
    action = receipt.action;
  const id = (name, quantity = '1') =>
    `snow:${userId}:pt:${receipt.run?.run ?? 'normal'}:${name}:${quantity}`;
  const button = (name, label, style = ButtonStyle.Secondary) =>
    new ButtonBuilder().setCustomId(id(name)).setLabel(label).setStyle(style);
  const row = (...buttons) => new ActionRowBuilder().addComponents(buttons);
  // Preserve the diagnostic/admin renderer and its confirmation protections.
  if (['admin', 'restart'].includes(location)) return formatCommands(output);
  const closed = Boolean(receipt.run && receipt.run.status !== 'active');
  const lesson = s.gymEntered && s.strength < 3 && location !== 'garden';
  let view = lesson ? 'train' : location;
  if (location === 'status' && !s.wooden && s.dummyHp > 0) view = 'welcome';
  let continueCommand;
  const next = () =>
    s.dummyHp > 0
      ? 'throw'
      : !s.wooden
      ? 'shop'
      : !known.diamonds
      ? 'diamonds'
      : !s.roughOwned
      ? 'shop'
      : !s.redRecipe && known.kitchen
      ? 'kitchen'
      : !s.redRecipe || s.roughHp > 0
      ? 'throw'
      : 'shop';
  if (
    !lesson &&
    ((location === 'shop' && s.dummyHp > 0) ||
      (location === 'diamonds' && !s.wooden) ||
      (location === 'kitchen' && !known.kitchen) ||
      (location === 'train' && !s.gymUnlocked) ||
      (location === 'emporium' && !s.emporiumIntroduced && !s.jacketOwned))
  ) {
    view = 'not-ready';
    continueCommand = next();
  }
  if (!lesson && receipt.outcome !== 'rejected' && receipt.outcome !== 'denied') {
    if (receipt.presentationView) view = receipt.presentationView;
    else if (action === 'shop-help' && s.wooden) view = 'shovel-gift';
    else if (action === 'beg' && s.diamondGift) view = 'diamond-gift';
    else if (action === 'buy-snowman' && s.roughOwned) view = 'snowman-purchased';
    else if (action === 'mix' && s.redRecipe && !s.recipeDraft) view = 'spicy-unlocked';
    else if (action === 'buy-old-stone' && s.oldStone) view = 'stone-unlocked';
    else if (['buy-spicy', 'buy-red-diamonds'].includes(action)) view = 'shop';
    else if (action === 'buy-sturdy' && s.owned[1]) view = 'sturdy-purchased';
  }
  if (!lesson && location === 'throw' && !s.owned[1]) {
    if (!s.dummyHp && !s.roughOwned) view = 'broken';
    else if (s.roughOwned && !s.roughHp) view = 'melted';
  }
  if (receipt.tutorialView) view = receipt.tutorialView;
  if (s.liveRules && s.tutorialStage === 'gym' && !s.gymEntered) view = 'battle-defeat';
  if (s.chapter0Pending && receipt.run?.status === 'active') view = 'stone-unlocked';
  if (unavailable(s, action)) {
    view = 'not-ready';
    continueCommand = next();
  }
  const projection = {
    player: {
      userId,
      tier: s.tier,
      shovelTier: s.tier,
      snow: s.wallet.snow,
      snowballs: s.wallet.regular,
      diamonds: s.wallet.diamonds
    },
    progress: {
      dummyHp: s.dummyHp,
      snowballsUnlocked: known.regular,
      diamondsUnlocked: known.diamonds
    },
    shopProgress: { helped: s.wooden, snowmanOwned: s.roughOwned, snowmanHp: s.roughHp },
    tutorialGifts: { diamondGift: s.diamondGift },
    kitchen: {
      spicyUnlocked: s.redRecipe,
      spicy: s.wallet.red,
      peppers: s.wallet.peppers,
      oldStone: s.oldStone
    },
    recipeDraft: s.recipeDraft || { ingredients: [], ingredientOrder: [...IDS] },
    battle: {
      gym: { strength: s.strength, accuracy: s.accuracy },
      gymUnlocked: { strength: s.gymEntered, accuracy: s.strength >= 25 },
      gymVisited: s.gymEntered || s.gymUnlocked,
      gymTutorialActive: lesson,
      sturdyOwned: s.owned[1],
      sweat: s.wallet.sweat,
      idleStarted: known.sweat,
      ironMaterial: s.ironMaterial,
      ironShovelOwned: s.tier === 3,
      buttonsUnlocked: known.buttons,
      buttons: s.wallet.buttons
    },
    message:
      receipt.message ||
      (view === 'spicy-purchased'
        ? 'You purchased 🔴 Spicy Snowballs. Use `/snow throw` to continue.'
        : null),
    continueCommand
  };
  const original = originalScreen(
    projection,
    view === 'snowmen'
      ? 'opponents'
      : view === 'garden'
      ? 'kitchen'
      : view === 'unavailable'
      ? 'not-ready'
      : view === 'throw' && s.owned[1]
      ? 'status'
      : view,
    {
      battleConfig: {
        ...config,
        spicySnowCost: M.rules.redSnowCost,
        ironSnowCost: M.rules.ironSnowCost
      },
      development: false
    }
  );
  // Translate only supported actions. No legacy fight queue, testing shortcut,
  // secret recipe or unimplemented purchase can leak into the live adapter.
  const allowed = new Set([
    'throw',
    'shop',
    'help',
    'diamonds',
    'kitchen',
    'train',
    'craft',
    'attack',
    'attack-spicy',
    'shop-help',
    'beg',
    'buy-snowman',
    'buy-sturdy',
    'buy-old-stone',
    'buy-spicy',
    'pepper',
    'mix',
    'ingredient',
    'recipe-cancel',
    'iron'
  ]);
  original.components = original.components
    .map((r) =>
      row(
        ...r.components
          .filter((b) => {
            const [, , name] = b.data.custom_id.split(':');
            return allowed.has(name);
          })
          .map((b) => {
            const [, , name, q] = b.data.custom_id.split(':');
            b.setCustomId(id(name === 'diamonds' && q ? 'diamonds-convert' : name, q || '1'));
            return b;
          })
      )
    )
    .filter((r) => r.components.length);
  const embed = original.embeds[0];
  if (view === 'snowmen') {
    embed
      .setTitle('Choose a Snowman')
      .setDescription(output.embeds[0].data.description)
      .setFields();
    original.components = output.components;
  }
  if (view === 'hidden') {
    embed.setTitle('Hidden messages').setDescription(brown.messages(s));
    original.components = [];
  }
  if (view === 'emporium') {
    original.files = [
      new AttachmentBuilder(
        path.join(__dirname, '../../../assets/badges/Winter/WINTER_AZULIS_BADGE.png'),
        { name: 'winter-emporium-badge.png' }
      )
    ];
    embed.setThumbnail('attachment://winter-emporium-badge.png');
    embed.setTitle('Azule’s Emporium').setFields();
    original.components = [];
    if (s.jacketIntroPending) {
      embed.setDescription(
        dialogue(
          "Hey there. Before you go making a fool of yourself, we should meet. I'm Azule and I sell specialty clothing you wont find anywhere else. Please tell me you haven't been out in the snow without a jacket. Here, let me see what I can do."
        )
      );
      original.components = [row(button('buy-jacket', 'Jacket · Free', ButtonStyle.Success))];
    } else if (
      action === 'buy-jacket' &&
      s.jacketOwned &&
      !['rejected', 'denied'].includes(receipt.outcome)
    ) {
      embed.setDescription(
        dialogue(
          "There, that's much better. If you're going to keep up the fight, you're going to need better clothing, but I can't work for free. I'll make you a trade, hunt down some sapphire buttons. They're pretty rare, so I'll be happy to make that deal with you. See you soon!"
        )
      );
      original.components = [row(button('throw', 'Throw', ButtonStyle.Success))];
    } else {
      const boughtFlower =
        action === 'buy-fire-flower' &&
        s.fireFlowerOwned &&
        !['rejected', 'denied'].includes(receipt.outcome);
      embed.setDescription(
        boughtFlower
          ? dialogue(
              `That Fire Flower turns your Spicy snowballs into fireballs. Each throw uses ${M.emporium.fireFlowerAmmo} Spicy snowballs and deals ${M.emporium.fireFlowerMultiplier} times the damage. Choose it in your fight when you’re ready, and keep your supplies stocked!`
            )
          : action === 'buy-soup-kitchen' &&
            s.soupKitchenOwned &&
            !['rejected', 'denied'].includes(receipt.outcome)
          ? dialogue(receipt.message)
          : receipt.message ||
            dialogue('Welcome back. Found any sapphire buttons? Let’s see what we can trade.')
      );
      if (
        ['buy-reinforced-jacket', 'buy-golden-idol'].includes(action) &&
        !['rejected', 'denied'].includes(receipt.outcome)
      )
        embed.setDescription(dialogue(receipt.message));
      if (!s.fireFlowerOwned) {
        embed.addFields({ name: 'Fire Flower 🌺', value: `${M.emporium.fireFlowerButtons}🔘` });
        original.components.push(
          row(
            button(
              'buy-fire-flower',
              `Fire Flower 🌺 · ${M.emporium.fireFlowerButtons}🔘`,
              ButtonStyle.Primary
            ).setDisabled(s.wallet.buttons < M.emporium.fireFlowerButtons)
          )
        );
      } else if (chapterTwo(s) && !s.reinforcedJacketOwned) {
        embed.addFields({
          name: 'Reinforced Jacket',
          value: `${M.emporium.reinforcedJacketButtons}🔘 · +50 maximum HP`
        });
        original.components.push(
          row(
            button(
              'buy-reinforced-jacket',
              `Reinforced Jacket · ${M.emporium.reinforcedJacketButtons}🔘`,
              ButtonStyle.Primary
            ).setDisabled(s.wallet.buttons < M.emporium.reinforcedJacketButtons)
          )
        );
      } else if (chapterTwo(s) && !s.soupKitchenOwned) {
        embed.addFields({
          name: 'Soup Kitchen',
          value: `${M.emporium.soupKitchenButtons.toLocaleString('en-US')}🔘`
        });
        original.components.push(
          row(
            button(
              'buy-soup-kitchen',
              `Soup Kitchen · ${M.emporium.soupKitchenButtons.toLocaleString('en-US')}🔘`,
              ButtonStyle.Primary
            ).setDisabled(s.wallet.buttons < M.emporium.soupKitchenButtons)
          )
        );
      } else if (chapterTwo(s) && s.tier === 3 && !s.goldenIdolOwned) {
        embed.addFields({
          name: 'Golden Idol',
          value: `${M.emporium.goldenIdolButtons.toLocaleString('en-US')}🔘`
        });
        original.components.push(
          row(
            button(
              'buy-golden-idol',
              `Golden Idol · ${M.emporium.goldenIdolButtons.toLocaleString('en-US')}🔘`,
              ButtonStyle.Primary
            ).setDisabled(s.wallet.buttons < M.emporium.goldenIdolButtons)
          )
        );
      }
      if (s.goldenIdolOwned) original.components.push(row(button('shop', 'Shop')));
      original.components.push(
        row(
          button('throw', 'Throw'),
          ...(s.soupKitchenOwned ? [button('kitchen', 'Kitchen')] : []),
          button('emporium', 'Refresh')
        )
      );
    }
  }
  if (view === 'shop') {
    // Keep the portrait and original dialogue; wares follow the current chapter.
    if (s.wooden) {
      embed.setFields();
      original.components = [];
      const ware = (name, value) => embed.addFields({ name, value, inline: true });
      const purchase = (name, label, disabled, quantity = '1') =>
        new ButtonBuilder()
          .setCustomId(id(name, quantity))
          .setLabel(label)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled);
      if (known.diamonds && !s.roughOwned) {
        ware('`Rough Snowman` ⛄️', '**1💎**');
        original.components.push(
          row(purchase('buy-snowman', 'Rough ⛄️ · 1💎', s.wallet.diamonds < 1))
        );
      }
      if (s.redRecipe) {
        if (chapterTwo(s))
          embed.addFields({
            name: 'Snowballs',
            value: `🔴 \`Spicy Snowballs\` · **1,000❄️ each**${
              s.iceRecipe ? '\n🔵 `Ice Snowballs` · **2,000❄️ each**' : ''
            }`
          });
        else ware('🔴 `Spicy Snowballs`', '**1,000❄️ each**');
        original.components.push(
          row(
            ...['1', '10', '100', 'max']
              .filter(
                (q) =>
                  q === '1' ||
                  (q === 'max' ? s.wallet.snow >= 1000 : Number(q) * 1000 <= s.wallet.snow)
              )
              .map((q) =>
                purchase(
                  'buy-spicy',
                  q === 'max'
                    ? 'Spicy 🔴 Max'
                    : `Spicy 🔴 ×${q} · ${compactNumber(Number(q) * 1000)}❄️`,
                  s.wallet.snow < (q === 'max' ? 1000 : Number(q) * 1000),
                  q
                )
              )
          )
        );
        if (!s.oldStone && (!s.liveRules || (s.gymEntered && s.strength >= 3))) {
          ware('`Old Skipping Stone`', s.liveRules ? '**1💎**' : '**10💎**');
          original.components.push(
            row(
              purchase(
                'buy-old-stone',
                `Old Skipping Stone · ${s.liveRules ? 1 : 10}💎`,
                s.wallet.diamonds < (s.liveRules ? 1 : 10)
              )
            )
          );
        }
      }
      if (chapterTwo(s) && s.iceRecipe) {
        original.components.push(
          row(
            ...['1', '10', '100', 'max']
              .filter(
                (q) =>
                  q === '1' ||
                  (q === 'max' ? s.wallet.snow >= 2000 : Number(q) * 2000 <= s.wallet.snow)
              )
              .map((q) =>
                purchase(
                  'buy-ice',
                  q === 'max'
                    ? 'Ice 🔵 Max'
                    : `Ice 🔵 ×${q} · ${compactNumber(Number(q) * 2000)}❄️`,
                  s.wallet.snow < (q === 'max' ? 2000 : Number(q) * 2000),
                  q
                )
              )
          )
        );
      }
      if (s.roughOwned && !s.roughHp && !s.owned[1]) {
        ware('`Sturdy Snowman` ⛄️', '**1💎**');
        original.components.push(
          row(purchase('buy-sturdy', 'Sturdy ⛄️ · 1💎', s.wallet.diamonds < 1))
        );
      }
      const upgrades = [];
      if (s.owned[1] && !s.owned[2] && s.tiers[1].wins >= 100) {
        ware('`Snowman 2` ⛄️', '100 S1 victories');
        upgrades.push(purchase('buy-s2', 'Unlock S2', false));
      }
      if (s.owned[2] && !s.owned[3]) {
        const price = M.rules.snowmen[2].snowPrice / M.rules.diamondSnowCost;
        const label = `${compactNumber(price)}💎`;
        ware('`Snowman 3` ⛄️', `**${label}** · 100 S2 victories`);
        upgrades.push(
          purchase('buy-s3', `S3 · ${label}`, s.tiers[2].wins < 100 || s.wallet.diamonds < price)
        );
      }
      if (s.ironMaterial && s.tier === 2) {
        ware('`Iron Shovel`', '**1k💎** + Iron material');
        upgrades.push(purchase('iron', 'Iron Shovel · 1k💎', s.wallet.diamonds < 1000));
      }
      if (s.goldenIdolOwned && s.tier === 3) {
        ware('`Golden Shovel`', 'Golden Idol + Iron Shovel');
        upgrades.push(purchase('buy-golden-shovel', 'Golden Shovel · Trade Idol', false));
      }
      if (chapterTwo(s)) {
        const price = M.rules.iceRecipeSnowCost / M.rules.diamondSnowCost;
        embed.addFields(
          {
            name: 'Recipes',
            value: `${
              s.iceRecipe ? '' : `\`Recipe #1\` · **${compactNumber(price)}💎**\n`
            }\`Recipe #2\` · Unavailable\n\`Recipe #3\` · Unavailable`
          },
          {
            name: 'Snowmen',
            value: s.owned[4]
              ? '`Snowman 4` ⛄️ · Owned'
              : `\`Snowman 4\` ⛄️ · **${compactNumber(M.s4.priceDiamonds)}💎** · ${
                  M.s4.requiredS3Wins
                } S3 victories`
          }
        );
        if (!s.iceRecipe)
          original.components.push(
            row(
              purchase(
                'buy-ice-recipe',
                `Recipe #1 · ${compactNumber(price)}💎`,
                s.wallet.diamonds < price
              )
            )
          );
        if (!s.owned[4])
          upgrades.push(
            purchase(
              'buy-s4',
              `S4 · ${compactNumber(M.s4.priceDiamonds)}💎`,
              (s.tiers[3]?.wins || 0) < M.s4.requiredS3Wins ||
                s.wallet.diamonds < M.s4.priceDiamonds
            )
          );
      }
      if (upgrades.length) original.components.push(row(...upgrades));
      if (receipt.message?.includes('on the house'))
        embed.setDescription(dialogue(receipt.message));
      if (
        ['buy-spicy', 'buy-red-diamonds'].includes(action) &&
        !['rejected', 'denied'].includes(receipt.outcome)
      )
        embed.setDescription(receipt.message || 'You purchased 🔴 Spicy Snowballs.');
      if (action === 'iron' && s.tier === 3 && !['rejected', 'denied'].includes(receipt.outcome))
        embed.setDescription(
          dialogue(
            `A better shovel means more snow! You are collecting ${M.rate(s)}/sec. Use it wisely!`
          )
        );
      if (
        action === 'buy-golden-shovel' &&
        s.tier === 4 &&
        !['rejected', 'denied'].includes(receipt.outcome)
      )
        embed.setDescription(dialogue(receipt.message));
      const navigation = [button('shop', 'Refresh'), button('diamonds', '💎 Exchange')];
      if (!s.redRecipe && known.kitchen) navigation.push(button('kitchen', 'Kitchen 🌶️'));
      if (s.roughOwned && (s.roughHp > 0 || s.owned[1])) navigation.push(button('throw', 'Throw'));
      if (s.gymEntered) navigation.push(button('train', 'Gym'));
      original.components.push(row(...navigation));
      if (s.liveRules && s.tutorialStage === 'stone') {
        embed.setDescription(
          dialogue('Ah, that old rock? One diamond and it’s yours.') +
            (s.wallet.diamonds < 1
              ? '\n\nUse `/snow diamonds` to exchange your gathered snow.'
              : '')
        );
        embed.setFields({ name: '`Old Skipping Stone`', value: '**1💎**' });
        original.components = [
          row(
            purchase('buy-old-stone', 'Old Skipping Stone · 1💎', s.wallet.diamonds < 1),
            button('diamonds', '💎 Exchange'),
            button('shop', 'Refresh')
          )
        ];
      }
    }
  }
  if (view === 'status') {
    const equipment = embed.data.fields?.find((f) => f.name === 'Equipment');
    if (equipment)
      equipment.value = `${
        ['Bare Hands', 'Wooden Shovel', 'Stone Shovel', 'Iron Shovel', 'Golden Shovel'][s.tier]
      }\n${M.rate(s)} snow/second`;
  }
  if (view === 'train') {
    // Original Hendrix portrait and speech style, current mandatory lesson,
    // shared training costs and prospective stat purchases.
    const taunt = receipt.message === "Those scrawny arms can't lift this!";
    embed.setDescription(
      lesson
        ? dialogue(
            'You’ve worked up quite a sweat already. To get started, invest it towards reaching Level 3.'
          )
        : [dialogue(taunt ? receipt.message : gymLine(s)), taunt ? null : receipt.message]
            .filter(Boolean)
            .join('\n\n')
    );
    if (
      action === 'lift' &&
      s.ironMaterial &&
      !s.lift50Completed &&
      !taunt &&
      !['rejected', 'denied'].includes(receipt.outcome)
    )
      embed.setDescription(
        dialogue(
          'Whoa, there buddy. I’ve got to hand it to you. You’re making progress. For all your hard work, I’ll let you keep the weight. Maybe you can find a good use for it. Now that you’ve started on this path, you’ll need to expand your horizons. Maybe trying some throwing knives to improve your aim. But don’t slack on the lifting!'
        )
      );
    embed.setFields(
      { name: 'STR 💪🏽', value: `Level ${s.strength}`, inline: true },
      ...(s.strength >= 25 ? [{ name: 'ACC 🎯', value: `Level ${s.accuracy}`, inline: true }] : []),
      ...(s.lift50Completed ? [{ name: 'END 🛡️', value: `Level ${s.defense}`, inline: true }] : []),
      ...(output.embeds[0].data.fields || []).filter((f) => f.name === 'Lessons complete')
    );
    original.components = output.components;
    if (!lesson) original.components.push(row(button('shop', 'Shop'), button('throw', 'Throw')));
  }
  if (
    location === 'throw' &&
    s.owned[1] &&
    !['battle-defeat', 'stone-unlocked', 'sturdy-purchased'].includes(view) &&
    !lesson &&
    s.tutorialStage !== 'stone'
  ) {
    const template = originalScreen(projection, 'throw');
    embed
      .setTitle(s.target === 1 ? 'Sturdy Snowman' : `Snowman ${s.target}`)
      .setThumbnail(template.embeds[0].data.thumbnail.url);
    original.files = template.files;
    const hp = (n, max, color) => {
      const filled = Math.max(0, Math.min(10, Math.ceil((10 * n) / max)));
      return `**${Math.round(n)}/${Math.round(max)} HP**\n${color.repeat(filled)}${'⬛'.repeat(
        10 - filled
      )}`;
    };
    const attack = (actor, event) => {
      if (!event || event.target !== s.target) return '';
      if (event.outcome === 'waiting') return '\nYou: Waiting for enough ❄️ snow.';
      const ammunition =
        actor === 'You'
          ? ` · ${
              event.fire
                ? '🔥 Fire Ball'
                : { regular: '⚪ Regular', red: '🔴 Spicy', ice: '🔵 Ice', brown: '🟤 Brown' }[
                    event.type
                  ]
            }`
          : '';
      const age = Number.isFinite(event.at)
        ? ` · ${Math.max(0, (s.now - event.at) / 1000).toFixed(1)}s ago`
        : '';
      return `\n${actor}: **${event.outcome === 'hit' ? 'Hit' : 'Miss'}**${
        event.immune ? ' · immune' : ''
      }${ammunition}${age}${
        event.victory ? ' — snowman defeated!' : event.defeat ? ' — you were defeated.' : ''
      }`;
    };
    embed.setDescription(
      [
        receipt.message,
        `Defeated: ${s.tiers[s.target].wins}\n\n${hp(s.enemyHp, M.enemy(s).hp, '🟥')}${attack(
          'You',
          s.lastPlayerAttack
        )}`
      ]
        .filter(Boolean)
        .join('\n\n')
    );
    embed.setFields({
      name: 'You',
      value: hp(s.playerHp, M.maxHp(s), '🟩') + attack('Snowman', s.lastEnemyAttack)
    });
    const update = receipt.combatUpdate;
    if (update?.target === s.target && (update.attacks > 1 || update.enemyAttacks > 1)) {
      const lines = [];
      if (update.attacks > 0)
        lines.push(`You: ${update.hits} hit(s), ${update.attacks - update.hits} miss(es)`);
      if (update.enemyAttacks > 0)
        lines.push(
          `Snowman: ${update.enemyHits} hit(s), ${update.enemyAttacks - update.enemyHits} miss(es)`
        );
      embed.addFields({
        name: 'Attacks since last update',
        value: lines.join('\n') + '\nHit/Miss tags show each side’s latest attack.'
      });
    }
    embed.addFields({
      name: 'Next attacks',
      value: `Equipped: ${Math.max(0, (s.nextPlayerAt - s.now) / 1000).toFixed(
        1
      )}s · Snowman: ${Math.max(0, (s.nextEnemyAt - s.now) / 1000).toFixed(1)}s`
    });
    const goal = nextGoal(s, M.rules, M.s4);
    if (goal) embed.addFields({ name: 'Next goal', value: goal });
    original.components = output.components;
    original.components.push(
      row(
        button('shop', 'Shop'),
        ...(s.gymEntered ? [button('train', 'Gym')] : []),
        ...(s.jacketOwned ? [button('emporium', 'Emporium')] : [])
      )
    );
  }
  if (view === 'sturdy-purchased') {
    embed.setDescription(
      dialogue(
        'Now that you know the basics, you don’t need me holding your hand. The fights will be automatic and continue when you’re offline. Just make sure to stock up on spicy snowballs. The more you have, the faster you’ll progress.'
      ) + '\n\nUse `/snow throw` to enter the fight.'
    );
    const target = originalScreen(projection, 'throw');
    embed.setThumbnail(target.embeds[0].data.thumbnail.url);
    original.files = target.files;
    original.components = [row(button('throw', 'Throw', ButtonStyle.Success))];
  }
  if (view === 'snowman-purchased' && s.roughIntroPending)
    original.components = [row(button('throw', 'Throw', ButtonStyle.Success))];
  if (view === 'help')
    embed.setDescription(
      !s.wooden
        ? 'Collect ❄️ Snow automatically, including while offline.\n\nUse `/snow throw` to visit your practice target. **10 ❄️ → 1 ⚪️**, dealing **1 damage**. The dummy has **5 HP**.'
        : embed.data.description.replace('**100❄️ each**', '**1💎 each**')
    );
  if (view === 'spicy-purchased')
    embed.setDescription(
      receipt.message || 'You purchased 🔴 Spicy Snowballs. Use `/snow throw` to continue.'
    );
  if (!lesson && action === 'recipe-cancel') {
    embed.setDescription('Mixing cancelled. Use `/snow kitchen` when you want to start again.');
    original.components = [];
  }
  if (view === 'kitchen' && s.redRecipe) {
    const draft = projection.recipeDraft;
    embed.setFields(
      {
        name: 'Recipes',
        value: Array.from(
          { length: 7 },
          (_, index) =>
            `${index + 1}. ${
              index === 0
                ? '🌶️🌶️🌶️'
                : index === 1 && s.dirtyRecipeUnlocked
                ? (s.dirtyRecipeVersion === 2 ? brown.recipe : DIRTY_RECIPE).map(emojiFor).join('')
                : '❔'.repeat(7)
            }`
        ).join('\n')
      },
      {
        name: 'Enter Recipe:',
        value: draft.ingredients.map(emojiFor).join('') + '❔'.repeat(7 - draft.ingredients.length)
      }
    );
    original.components = [
      row(
        ...draft.ingredientOrder.map((ingredient) =>
          new ButtonBuilder()
            .setCustomId(id('ingredient', ingredient))
            .setLabel(emojiFor(ingredient))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(draft.ingredients.length >= 7)
        )
      ),
      row(
        ...(draft.ingredients.length >= 3 ? [button('mix', 'Mix', ButtonStyle.Success)] : []),
        button('recipe-cancel', 'Cancel', ButtonStyle.Danger)
      )
    ];
  } else if (view === 'kitchen') {
    embed.setFields(
      {
        name: 'Recipes',
        value: Array.from({ length: 7 }, (_, index) => `${index + 1}. ${'❔'.repeat(7)}`).join('\n')
      },
      {
        name: 'Enter Recipe:',
        value: '🌶️'.repeat(s.wallet.peppers) + '❔'.repeat(7 - s.wallet.peppers)
      }
    );
  }
  if (!lesson && action === 'recipe-cancel') original.components = [];
  if (view === 'kitchen' && action !== 'recipe-cancel' && s.soupKitchenOwned)
    original.components.splice(
      Math.max(0, original.components.length - 1),
      0,
      row(button('garden-open', 'Pond 🐟'))
    );
  if (view === 'garden' && s.soupKitchenOwned) {
    const g = s.garden || { phase: 'idle', held: 0, heldTenths: 0, collection: {} };
    const total = s.foodDonatedTenths || 0,
      pond = require('./pond');
    const rank = total >= 200 ? 'Expert Rod' : total >= 50 ? 'Improved Rod' : 'Starter Rod';
    const nextRod =
      total >= 200
        ? 'Best rod unlocked.'
        : `Next rod at ${total >= 50 ? '20.0' : '5.0'} lbs donated.`;
    embed
      .setTitle('Pond 🐟')
      .setDescription(
        receipt.message || 'Choose a fishing spot, then reel and give slack to land your catch.'
      );
    const fishing =
      g.phase === 'fight'
        ? `**${pond.spots[g.spot].label}** · Progress **${g.progress}/${
            pond.spots[g.spot].target
          }** · Tension **${
            g.tension
          }/5**\nReel: +1 progress, +2 tension. Above 5 snaps the line.\nGive Slack: −3 tension, ${Math.round(
            pond.spots[g.spot].escape * 100
          )}% chance the fish escapes.`
        : 'Shallows: 3 pulls · 10% escape on slack\nReeds: 4 pulls · 15% escape on slack\nDeep Water: 5 pulls · 20% escape on slack';
    embed.setFields(
      { name: 'Fishing', value: fishing },
      {
        name: 'Soup Kitchen',
        value: `Fish held: **${pond.pounds(
          g.heldTenths || 0
        )} lbs** · Total food donated: **${pond.pounds(total)} lbs**${
          g.unweighedHeld ? '\nEarlier catches have no recorded weight.' : ''
        }\n${rank} · ${nextRod}`
      },
      {
        name: 'Collection',
        value: ['Trout', 'Perch', 'Arctic Char']
          .map((fish) => `${fish}: ${g.collection[fish] ? '✅' : '❔'}`)
          .join(' · ')
      }
    );
    const cast = (spot, label) =>
      new ButtonBuilder()
        .setCustomId(id('garden-cast', spot))
        .setLabel(label)
        .setStyle(ButtonStyle.Primary);
    original.components = [
      row(
        ...(g.phase === 'fight'
          ? [
              button('garden-reel', 'Reel 🎣', ButtonStyle.Primary),
              button('garden-slack', 'Give Slack')
            ]
          : [cast('shallows', 'Shallows'), cast('reeds', 'Reeds'), cast('deep', 'Deep Water')]),
        ...(g.held ? [button('garden-donate', 'Donate Fish', ButtonStyle.Success)] : [])
      ),
      row(button('kitchen', 'Kitchen'))
    ];
  }
  if (s.liveRules && view === 'throw' && !s.owned[1] && s.roughOwned && s.roughHp > 0) {
    if (!s.redRecipe && s.roughThrows >= 3) {
      embed.setDescription(
        dialogue(
          'This is going to take forever. Let’s go to the Kitchen and create something a bit more impactful.'
        )
      );
      original.components = [row(button('kitchen', 'Kitchen 🌶️'))];
    } else if (s.redRecipe) {
      embed.setDescription(
        `**${s.roughHp}/50 HP**\n${'🟩'.repeat(Math.ceil(s.roughHp / 5))}${'⬛'.repeat(
          10 - Math.ceil(s.roughHp / 5)
        )}`
      );
      original.components = [
        row(
          new ButtonBuilder()
            .setCustomId(id('attack-spicy'))
            .setLabel('Throw · 1 🔴')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(!s.wallet.red),
          button('shop', 'Shop'),
          button('throw', 'Refresh')
        )
      ];
    } else {
      embed.setDescription(
        `Practice your aim! Throw three snowballs at the Rough Snowman.\n\n**${s.roughHp}/50 HP** · ${s.roughThrows}/3 practice throws`
      );
      original.components = [
        row(
          new ButtonBuilder()
            .setCustomId(id('attack'))
            .setLabel('Throw · 1 ⚪️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!s.wallet.regular)
        )
      ];
      const capacity = Math.floor(s.wallet.snow / 10);
      const quantities = ['1', '10', '100', 'max'].filter((q) =>
        q === 'max' ? capacity > 0 : Number(q) <= capacity
      );
      if (quantities.length)
        original.components.push(
          row(
            ...quantities.map((q) =>
              new ButtonBuilder()
                .setCustomId(id('craft', q))
                .setLabel(q === 'max' ? 'Make Max ⚪️' : `Make ×${q} ⚪️`)
                .setStyle(ButtonStyle.Secondary)
            )
          )
        );
      original.components.push(row(button('throw', 'Refresh')));
    }
  }
  if (s.liveRules && s.tutorialStage === 'gym' && !s.gymEntered) {
    embed
      .setTitle('Your first victory!')
      .setDescription(
        dialogue(
          "Wow, you worked up quite the 💦 Sweat taking down that Snowman. Let's head to the Gym and see what we can do with it."
        )
      )
      .setFields();
    original.components = [row(button('train', 'Gym', ButtonStyle.Success))];
  }
  if (s.liveRules && s.tutorialStage === 'stone' && !['shop', 'diamonds'].includes(location)) {
    const gym = originalScreen(projection, 'train');
    embed.setTitle('Hendrix’s Gym 💪🏽').setThumbnail(gym.embeds[0].data.thumbnail.url);
    original.files = gym.files;
    embed
      .setDescription(
        dialogue(
          "Now, you're getting somewhere. Destroying snowmen will work up quite the Sweat, but you're going to need a bigger arsenal to make any real progress. Head back to the Shop and ask about that old rock Requia keeps behind the counter. Maybe it can help."
        )
      )
      .setFields();
    original.components = [row(button('shop', 'Shop', ButtonStyle.Success))];
  }
  if (s.liveRules && view === 'stone-unlocked') {
    const shop = originalScreen(projection, 'shop');
    embed.setThumbnail(shop.embeds[0].data.thumbnail.url);
    original.files = shop.files;
    embed.setDescription(
      dialogue(
        "You turned that old rock into a Stone Shovel 🪏? Why didn't I think of that? With it you're now collecting 36❄️/second. I'm sure there's other ways to improve it, just keep your eye out for materials. Until then, why don't you stock up on some more spicy snowballs and get back to the fight."
      )
    );
    if (s.chapter0Pending && receipt.run?.status === 'active')
      original.components = [row(button('end-chapter0', 'End of Chapter 0', ButtonStyle.Success))];
  }
  if (view === 'not-ready' || view === 'unavailable' || unavailable(s, action)) {
    const kylax = originalScreen(projection, 'kitchen');
    embed
      .setTitle('Stop!')
      .setThumbnail(kylax.embeds[0].data.thumbnail.url)
      .setFields()
      .setDescription(
        dialogue(
          `You’re not ready for that yet. Try using \`/snow ${continueCommand || next()}\` instead.`
        )
      );
    original.files = kylax.files;
    original.components = [row(button(continueCommand || next(), 'Continue', ButtonStyle.Success))];
  }
  const secretOwned = Boolean(
    s.secretCharacters?.nnorahc ||
      receipt.secretCharacters?.some((c) => c.characterId === nnorahc.id)
  );
  if (
    secretOwned &&
    (view === 'hidden' ||
      (action === 'mix' &&
        receipt.message?.startsWith("You discovered N'norah'c!") &&
        !['rejected', 'denied'].includes(receipt.outcome)))
  ) {
    original.files.push(new AttachmentBuilder(nnorahc.image, { name: 'nnorahc-placeholder.jpeg' }));
    if (view === 'hidden') {
      embed.addFields({ name: 'Discovered character', value: nnorahc.name });
      embed.setThumbnail('attachment://nnorahc-placeholder.jpeg');
    } else {
      embed
        .setTitle('Secret character discovered!')
        .setDescription(receipt.message)
        .setImage('attachment://nnorahc-placeholder.jpeg');
    }
  }
  if (view !== 'hidden' && !unavailable(s, action) && s.brown && s.brown.pieces > s.brown.read)
    embed.addFields({ name: 'Hidden message', value: brown.notice });
  embed.setFooter(output.embeds[0].data.footer);
  // Navigation follows discovery just like currency footers. It must never
  // turn a visit to an unrelated location into a crafting/combat screen.
  original.components = original.components
    .map((r) =>
      row(
        ...r.components.filter((b) => {
          const name = actionOf(b);
          return !(
            (name === 'diamonds' && !s.wooden) ||
            (name === 'shop' && s.dummyHp > 0) ||
            (name === 'kitchen' && !known.kitchen) ||
            (name === 'train' && !s.gymUnlocked) ||
            (name === 'end-chapter0' && receipt.run?.status !== 'active') ||
            (name.startsWith('garden-') && !s.soupKitchenOwned)
          );
        })
      )
    )
    .filter((r) => r.components.length);
  if (output.embeds.length > 1) original.embeds.push(...output.embeds.slice(1));
  if (closed) {
    original.components = [];
    const saved = output.embeds[0].data.fields?.find((f) => f.name === 'Test saved');
    if (saved) embed.addFields(saved);
  }
  if (receipt.run)
    embed.addFields({
      name: `Diagnostic · Run #${receipt.run.run} · ${receipt.run.speed}×`,
      value: `${(receipt.run.realElapsedMs / 60000).toFixed(1)} real / ${(
        receipt.run.gameElapsedMs / 60000
      ).toFixed(1)} game minutes\nButton responses (prior completed samples):\n${timingText(
        receipt.run.timings
      )}`.slice(0, 1024)
    });
  if (view === 'kitchen' && s.soupKitchenOwned)
    embed.addFields({
      name: 'Total Food donated',
      value: `**${((s.foodDonatedTenths || 0) / 10).toFixed(1)} lbs**`
    });
  return formatCommands(original);
}
function formatCommands(output) {
  const format = (text) =>
    text?.replace(/(?<!`)\/snow(?: [a-z][a-z_-]*)?/g, (command) => `\`${command}\``);
  for (const embed of output.embeds) {
    if (embed.data.description) embed.setDescription(format(embed.data.description));
    if (embed.data.fields)
      embed.setFields(embed.data.fields.map((f) => ({ ...f, value: format(f.value) })));
  }
  const buttons = output.components.flatMap((r) => r.components),
    refresh = buttons.filter((b) => b.data.label === 'Refresh');
  if (refresh.length) {
    const action = (b) => b.data.custom_id.split(':')[4];
    if (buttons.some((b) => action(b) === 'snowmen')) {
      output.components = controlLayout.fight(buttons);
      return output;
    }
    const compactFight = buttons.every(
      (b) =>
        action(b).startsWith('select-s') ||
        action(b).startsWith('equip-') ||
        action(b).startsWith('quick-buy-') ||
        b.data.label === 'Refresh'
    );
    if (compactFight) {
      const groups = [
        buttons.filter((b) => action(b).startsWith('select-s')),
        buttons.filter((b) => action(b).startsWith('equip-') || action(b).startsWith('quick-buy-')),
        [refresh.at(-1)]
      ];
      output.components = groups
        .filter((group) => group.length)
        .map((group) => new ActionRowBuilder().addComponents(...group));
      return output;
    }
    const ordered = [...buttons.filter((b) => b.data.label !== 'Refresh'), refresh.at(-1)];
    output.components = [];
    for (let n = 0; n < ordered.length; n += 5)
      output.components.push(new ActionRowBuilder().addComponents(...ordered.slice(n, n + 5)));
  }
  return output;
}
module.exports = { restore };
