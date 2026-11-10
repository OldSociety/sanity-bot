const { chapterTwo } = require('./progression');
const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const M = require('./game');
const { discovered, idleStarted } = require('./discoveries');
const { compactNumber } = require('../numbers');
const { confirmationButtons } = require('../../confirmation-controls');
const { isAdminAction } = require('./admin');
const { timingText } = require('./response-times');
const controlLayout = require('./snowman-selection');
const labels = {
  snow: '❄️ Snow',
  diamonds: '💎 Diamonds',
  regular: '⚪ Snowballs',
  red: '🔴 Spicy',
  ice: '🔵 Ice',
  sweat: '💦 Sweat',
  buttons: 'Buttons',
  peppers: 'Peppers'
};
const duration = (ms) => `${(ms / 3600000).toFixed(2)}h`;
const amounts = (values) =>
  Object.entries(values)
    .filter(([, n]) => n !== 0)
    .map(([key, n]) => `${labels[key] || key}: ${n.toLocaleString('en-US')}`)
    .join('\n') || 'None';
function diagnosticEmbed(run, counts = []) {
  const interactions = counts.reduce((n, r) => n + r.count, 0);
  return new EmbedBuilder()
    .setColor(run.status === 'active' ? 0x3498db : 0x2ecc71)
    .setTitle(`Winter diagnostic Run #${run.run} — ${run.status}`)
    .setDescription(
      `${run.bookmark} → ${run.stopAt} · ${run.speed}×\n${duration(
        run.realElapsedMs
      )} real / ${duration(
        run.gameElapsedMs
      )} game time\n${interactions} human interactions; system captures counted separately.`
    )
    .addFields(
      { name: 'Total gained since bookmark', value: amounts(run.gained), inline: true },
      { name: 'Total spent since bookmark', value: amounts(run.spent), inline: true },
      { name: 'Current balances', value: amounts(run.balances), inline: true },
      {
        name: 'Progress',
        value: `Chapter ${run.chapter} · STR${run.strength} · ACC${run.accuracy}\n${
          ['Hands', 'Wooden', 'Stone', 'Iron'][run.tier]
        } shovel\n${Object.entries(run.tiers)
          .map(([t, r]) => `S${t}: ${r.wins} wins / ${r.losses} losses / ${r.attacks} attacks`)
          .join('\n')}`
      },
      {
        name: 'Interaction counts',
        value:
          counts
            .map((r) => `${r.kind} ${r.action} (${r.outcome}): ${r.count}`)
            .join('\n')
            .slice(0, 1024) || 'None yet. Full counts are retained in the database and export.'
      },
      {
        name: 'Button response times · real milliseconds',
        value: timingText(run.timings).slice(0, 1024)
      },
      {
        name: 'Timing measurement',
        value:
          'Server receive → completed Discord message update, including queue time. Prior completed samples by action; full stage averages and individual samples are saved in the export. Discord client/network time before server receipt is excluded.'
      }
    )
    .setFooter({
      text: 'Development only · exact balances, gross resource ledger and checkpoints saved in SQLite'
    });
}
function viewFor(action) {
  if (['snowmen', 'snowmen-page'].includes(action)) return 'snowmen';
  if (isAdminAction(action)) return action === 'restart' ? 'restart' : 'admin';
  if (action?.startsWith('garden-')) return 'garden';
  if (
    ['throw', 'attack', 'attack-spicy', 'craft'].includes(action) ||
    /^select-s(?:[1-9]|10)$/.test(action) ||
    action?.startsWith('equip-') ||
    action?.startsWith('quick-buy-')
  )
    return 'throw';
  if (
    [
      'shop',
      'shop-help',
      'buy-snowman',
      'buy-old-stone',
      'buy-sturdy',
      'buy-s2',
      'buy-s3',
      'buy-s4',
      'iron',
      'buy-golden-shovel',
      'buy-ice-recipe',
      'buy-spicy',
      'buy-red-diamonds',
      'buy-ice'
    ].includes(action)
  )
    return 'shop';
  if (['kitchen', 'pepper', 'mix', 'ingredient', 'recipe-cancel'].includes(action))
    return 'kitchen';
  if (
    ['gym', 'train', 'train-strength', 'train-accuracy', 'train-defense', 'lift'].includes(action)
  )
    return 'train';
  if (
    [
      'buy-jacket',
      'buy-fire-flower',
      'buy-reinforced-jacket',
      'buy-soup-kitchen',
      'buy-golden-idol'
    ].includes(action)
  )
    return 'emporium';
  if (action === 'hidden') return 'hidden';
  if (['diamonds', 'beg', 'diamonds-convert'].includes(action)) return 'diamonds';
  if (action === 'diagnostic' || action === 'end-chapter0') return 'status';
  return ['status', 'help', 'emporium'].includes(action) ? action : 'unavailable';
}
function pathHint(s, known) {
  if (s.dummyHp > 0) return 'Use /snow throw to make snowballs and practice on the training dummy.';
  if (!s.wooden) return 'The dummy is broken. Use /snow shop and ask Requia for help.';
  if (!known.diamonds) return 'Use /snow diamonds to visit the Diamond Press.';
  if (!s.roughOwned) return 'Use /snow shop to get a Rough Snowman.';
  if (!s.redRecipe && known.kitchen)
    return 'Use /snow kitchen to meet Kylax and discover your first recipe.';
  if (!s.redRecipe) return 'Use /snow throw to practice with the Rough Snowman.';
  if (!s.oldStone)
    return 'Requia has Old Stone in /snow shop. Bring it to her to receive a Stone Shovel.';
  if (s.roughHp > 0) return 'Use /snow throw to finish the Rough Snowman.';
  if (!s.owned[1]) return 'Use /snow shop to get S1, then /snow throw to start your idle fight.';
  if (s.gymUnlocked && !s.gymEntered) return 'You can now visit Hendrix with /snow gym.';
  return `Use /snow throw for your fight, /snow shop for supplies${
    s.gymEntered ? ', and /snow gym to visit Hendrix' : ''
  }.`;
}
function screen(receipt, userId, diagnostic = false) {
  if (!diagnostic && receipt.displayAction) receipt = { ...receipt, action: receipt.displayAction };
  const s = receipt.state,
    run = receipt.run,
    rows = [];
  if (diagnostic) {
    const failed = ['rejected', 'denied'].includes(receipt.outcome);
    const embed = new EmbedBuilder()
      .setColor(failed ? 0xe74c3c : 0xadd8e6)
      .setTitle(
        failed ? 'Winter diagnostic — request not applied' : 'Winter Wars · Diagnostic mode'
      )
      .setDescription(
        receipt.message ||
          (run ? `Run #${run.run} is ${run.status}.` : 'No diagnostic run is active.')
      );
    if (!run)
      embed.addFields({
        name: 'Start a tutorial test',
        value:
          '`/snow diagnostic mode:start stop_at:stone`\nStarts Chapter 0 and saves a public recap when Stone is acquired or the run is manually stopped.'
      });
    else
      embed.addFields({
        name: 'Saved results',
        value: `\`/snow diagnostic mode:review run:${run.run}\`\n\`/snow diagnostic mode:export run:${run.run}\`\nFinished runs receive a public recap in the channel where they started. Periodic reports are optional.`
      });
    if (run)
      embed.addFields(
        {
          name: 'Starting point',
          value: M.settings.bookmarks[run.bookmark]?.label || run.bookmark
        },
        {
          name: 'Play this run',
          value:
            run.status === 'active'
              ? 'Use `/snow throw` to continue. Starting without a bookmark begins a fresh Chapter 0 tutorial; bookmarks explicitly skip ahead.'
              : 'This run is saved and frozen. Use `/snow diagnostic mode:start` to begin a fresh Chapter 0 tutorial.'
        }
      );
    return {
      content: '',
      embeds: [embed, ...(run ? [diagnosticEmbed(run, receipt.counts)] : [])],
      components: [],
      files: [],
      attachments: [],
      allowedMentions: { parse: [] }
    };
  }
  const known = discovered(s);
  const button = (action, label, disabled = false, quantity = '1', style = ButtonStyle.Secondary) =>
    new ButtonBuilder()
      .setCustomId(`snow:${userId}:pt:${run?.run ?? 'normal'}:${action}:${quantity}`)
      .setLabel(label)
      .setStyle(style)
      .setDisabled(disabled);
  const row = (...buttons) => rows.push(new ActionRowBuilder().addComponents(buttons));
  const add = (items) => {
    for (let i = 0; i < items.length; i += 5) row(...items.slice(i, i + 5));
  };
  const view = viewFor(receipt.action);
  const titles = {
    admin: 'Winter development admin',
    restart: 'Reset your development Winter profile?',
    status: 'Winter Wars — Status',
    help: 'Winter Wars — Help',
    shop: 'Requia’s Shop',
    kitchen: 'Kylax’s Kitchen',
    garden: 'Pond 🐟',
    train: 'Hendrix’s Gym',
    diamonds: s.wooden ? 'Diamond Press' : 'Not ready yet',
    emporium: 'Azulis’s Emporium',
    unavailable: 'Not available yet',
    throw: s.owned[1] ? `Snowman ${s.target}` : s.dummyHp > 0 ? 'Training dummy' : 'Rough Snowman'
  };
  titles.hidden = 'A winter secret';
  titles.snowmen = 'Choose a Snowman';
  const embed = new EmbedBuilder()
    .setColor(0xb4d9ed)
    .setTitle(titles[view])
    .setDescription(
      [
        receipt.message,
        `${['Hands', 'Wooden shovel', 'Stone shovel', 'Iron shovel', 'Golden shovel'][s.tier]}${
          s.gymEntered ? ` · STR${s.strength}${s.strength >= 25 ? ` · ACC${s.accuracy}` : ''}` : ''
        }`
      ]
        .filter(Boolean)
        .join('\n\n')
    );
  if (view === 'admin' || view === 'restart') {
    embed.setTitle(
      view === 'restart' ? 'Reset your development Winter profile?' : 'Winter development admin'
    );
    if (!receipt.admin) embed.setDescription('Development administrators only.');
    else if (view === 'restart' && s.restartToken) {
      embed.setDescription(
        `${
          receipt.message || ''
        }\n\nConfirm starts Chapter 0 with 10 snow and fresh equipment/unlocks. ${
          run
            ? `Run #${run.run} will remain saved; a new numbered diagnostic run will begin with the same speed, endpoint and report settings.`
            : 'Only your development Winter profile is reset; its audit history remains saved.'
        }`
      );
      row(
        ...confirmationButtons(
          `snow:${userId}:pt:${run?.run ?? 'normal'}:restart-confirm:${s.restartToken}`,
          `snow:${userId}:pt:${run?.run ?? 'normal'}:restart-cancel:${s.restartToken}`
        )
      );
    } else {
      embed.setDescription(
        [
          receipt.message,
          'Testing controls affect only your development Winter profile. Reset requires confirmation.'
        ]
          .filter(Boolean)
          .join('\n\n')
      );
      embed.addFields({
        name: 'Testing resources',
        value: amounts({ ...s.wallet, sweat: s.wallet.sweat + (s.gymLessonReserve || 0) })
      });
      if (s.gymLessonReserve)
        embed.addFields({
          name: 'Gym lesson',
          value: `${s.wallet.sweat} Sweat is available for the two lessons; ${s.gymLessonReserve} earned/granted Sweat becomes available at STR3.`
        });
      const closed = Boolean(run && run.status !== 'active');
      row(
        button('grant-sweat', '+100 Sweat', closed),
        button('grant-snow', '+1 hour snow', closed),
        button('grant-ammo', '+10 each snowball', closed)
      );
      row(button('restart', 'Reset', false, '1', ButtonStyle.Danger));
    }
  } else if (run && run.status !== 'active') {
    embed.addFields({
      name: 'Test saved',
      value: run
        ? `Run #${run.run} is frozen. Use /snow diagnostic mode:review or mode:export to inspect it, or mode:start for another test.`
        : 'Your saved run is complete.'
    });
  } else if (s.gymEntered && s.strength < 3) {
    const cost = s.strength + 1;
    embed
      .setTitle('Hendrix’s Gym')
      .setDescription(
        '“You’ve worked up quite a sweat already. To get started, invest it towards reaching Level 3.”'
      );
    embed.addFields(
      { name: 'Strength', value: `Level ${s.strength} → Level ${s.strength + 1}` },
      { name: 'Sweat', value: `${s.wallet.sweat} 💦 · This upgrade costs ${cost} 💦.` }
    );
    row(
      button(
        'train-strength',
        `Strength · ${cost}💦`,
        s.wallet.sweat < cost,
        '1',
        ButtonStyle.Success
      ).setEmoji('💪🏽')
    );
  } else {
    if (
      [
        'shop',
        'shop-help',
        'buy-snowman',
        'buy-old-stone',
        'buy-sturdy',
        'buy-s2',
        'buy-s3',
        'iron',
        'buy-ice-recipe',
        'buy-spicy',
        'buy-red-diamonds',
        'buy-ice'
      ].includes(view)
    ) {
      const wares = [];
      if (!s.wooden)
        wares.push(
          s.dummyHp
            ? 'Use /snow throw to practice with the training dummy first.'
            : 'Ask Requia for help.'
        );
      if (s.wooden && !known.diamonds) wares.push('Use /snow diamonds to visit the Diamond Press.');
      if (known.diamonds && !s.roughOwned) wares.push('Rough Snowman: 1 💎');
      if (s.redRecipe) wares.push('Spicy: 1,000 ❄️ each', 'Ice recipe: 10,000,000 ❄️');
      if (s.redRecipe && !s.oldStone) wares.push('Old Stone: 10 💎 → Stone shovel');
      if (s.oldStone) wares.push('Iron shovel: 1,000,000 ❄️ + Gym lift material');
      if (s.owned[1]) wares.push('S2: 100 S1 victories');
      if (s.owned[2])
        wares.push(
          `S3: 100 S2 victories + ${M.rules.snowmen[2].snowPrice.toLocaleString('en-US')} ❄️`
        );
      if (s.iceRecipe) wares.push('Ice: 2,000 ❄️ each');
      embed.addFields({ name: 'Requia’s Shop', value: wares.join('\n') || pathHint(s, known) });
      const buttons = [];
      if (!s.wooden && s.dummyHp === 0) buttons.push(button('shop-help', 'Ask Requia for help'));
      if (known.diamonds && !s.roughOwned)
        buttons.push(button('buy-snowman', 'Rough Snowman · 1 💎'));
      if (s.redRecipe && !s.oldStone) buttons.push(button('buy-old-stone', 'Old Stone · 10 💎'));
      if (s.roughOwned && !s.roughHp && !s.owned[1])
        buttons.push(button('buy-sturdy', 'S1 · 1 💎', s.wallet.diamonds < 1));
      if (s.owned[1] && !s.owned[2])
        buttons.push(button('buy-s2', 'Unlock S2', s.tiers[1].wins < 100));
      if (s.owned[2] && !s.owned[3])
        buttons.push(
          button(
            'buy-s3',
            `S3 · ${compactNumber(M.rules.snowmen[2].snowPrice)} ❄️`,
            s.tiers[2].wins < 100
          )
        );
      if (s.oldStone && s.tier < 3) buttons.push(button('iron', 'Iron · 2m ❄️', !s.ironMaterial));
      if (s.redRecipe && !s.iceRecipe)
        buttons.push(button('buy-ice-recipe', 'Ice recipe · 10m ❄️'));
      if (s.redRecipe) {
        for (const q of ['1', '10', '100', 'max'])
          buttons.push(button('buy-spicy', `Buy ${q} 🔴`, false, q));
        buttons.push(button('buy-red-diamonds', '10 🔴 · 10 💎', false, '10'));
      }
      if (s.iceRecipe)
        for (const q of ['1', '10', '100', 'max'])
          buttons.push(button('buy-ice', `Buy ${q} 🔵`, false, q));
      add(buttons);
    } else if (['kitchen', 'pepper', 'mix', 'recipe-cancel'].includes(view)) {
      embed.addFields({
        name: 'Kylax’s Kitchen',
        value: !known.kitchen
          ? 'Practice with the Rough Snowman first.'
          : s.redRecipe
          ? '🔴 Spicy recipe discovered. Requia stocks your ammunition and the Ice recipe.'
          : `Three peppers might warm up a snowball. Added: ${s.wallet.peppers}/3.`
      });
      if (receipt.action === 'recipe-cancel')
        embed.setDescription('Mixing cancelled. Use /snow kitchen when you want to start again.');
      else if (known.kitchen && !s.redRecipe)
        row(
          button('pepper', 'Add Pepper', s.wallet.peppers >= 3),
          button('mix', 'Mix', s.wallet.peppers !== 3, '1', ButtonStyle.Success),
          button('recipe-cancel', 'Cancel', false, '1', ButtonStyle.Danger)
        );
    } else if (
      ['train', 'train-strength', 'train-accuracy', 'train-defense', 'lift'].includes(view)
    ) {
      const cost = s.strength + s.accuracy + s.defense + s.special + 1;
      embed.addFields({
        name: 'Hendrix’s Gym',
        value: !s.gymUnlocked
          ? 'Return after your first defeat.'
          : !s.gymEntered
          ? 'Enter the Gym to begin your lessons.'
          : `Next training purchase: ${cost} Sweat. STR${s.strength}${
              s.strength >= 25 ? ` / ACC${s.accuracy}` : ''
            }.\n${
              s.ironMaterial
                ? 'You lifted 25lbs and found Iron. Take it to Requia.'
                : 'Keep training, and return when you are ready.'
            }`
      });
      if (s.gymEntered) {
        const controls = [
          button(
            'train-strength',
            `Strength · ${s.strength >= 100 ? 'MAX' : `${cost}💦`}`,
            s.wallet.sweat < cost || s.strength >= 100
          ).setEmoji('💪🏽')
        ];
        if (s.strength >= 25)
          controls.push(
            button(
              'train-accuracy',
              `Accuracy · ${s.accuracy >= 100 ? 'MAX' : `${cost}💦`}`,
              s.wallet.sweat < cost || s.accuracy >= 100
            ).setEmoji('🎯')
          );
        if (s.lift50Completed)
          controls.push(
            button(
              'train-defense',
              `Endurance · ${s.defense >= 100 ? 'MAX' : `${cost}💦`}`,
              s.wallet.sweat < cost || s.defense >= 100
            ).setEmoji('🛡️')
          );
        if (
          (s.gymLiftRevealed || (s.gymLiftRevealed === undefined && s.strength > 3)) &&
          !s.lift50Completed
        )
          controls.push(button('lift', s.ironMaterial ? '50 lbs' : '25 lbs').setEmoji('🏋️'));
        row(...controls);
        if (s.strength === 3 && !s.gymLiftRevealed)
          embed.addFields({
            name: 'Lessons complete',
            value:
              'You reached Level 3. Return to the snowmen with /snow throw. Visit Hendrix again with /snow gym when you are ready.'
          });
      }
    } else if (['diamonds', 'beg', 'diamonds-convert'].includes(view)) {
      embed.addFields({
        name: s.wooden ? 'Diamond Press' : 'Continue your current path',
        value: s.wooden ? '1 💎 = 1,000 ❄️.' : 'Ask Requia for help first.'
      });
      if (s.wooden)
        row(
          button('beg', 'Ask for your first diamond', s.diamondGift),
          button('diamonds-convert', 'Press 1 💎'),
          button('diamonds-convert', 'Press 10 💎', false, '10')
        );
    } else if (view === 'emporium')
      embed.addFields({
        name: 'Azulis’s Emporium',
        value: known.buttons
          ? 'You found a Button. Keep progressing to discover Emporium purchases.'
          : 'There is nothing to do here yet. Continue your current path.'
      });
    else if (view === 'status' || view === 'help') {
      if (view === 'help')
        embed.addFields({
          name: 'Getting started',
          value:
            'Snow gathers while you are away. Use the command for the place you want to visit; each place has its own controls.'
        });
      embed.addFields({ name: 'Your path', value: pathHint(s, known) });
    } else if (view === 'unavailable') {
      embed.addFields({ name: 'Continue your current path', value: pathHint(s, known) });
    } else if (view === 'snowmen') {
      const available = controlLayout.targets(s, M.rules.snowmen);
      const selection = controlLayout.selector({
        targets: available,
        page: receipt.selectorPage || 0,
        fight: (t) =>
          button(
            `select-s${t}`,
            `Fight S${t}`,
            false,
            '1',
            s.target === t ? ButtonStyle.Primary : ButtonStyle.Secondary
          ),
        back: button('throw', 'Back to Fight'),
        optional: [
          button('shop', 'Shop'),
          ...(s.gymEntered ? [button('train', 'Gym')] : []),
          ...(s.jacketOwned ? [button('emporium', 'Emporium')] : [])
        ],
        previous: (p) => button('snowmen-page', 'Previous', false, String(p)),
        next: (p) => button('snowmen-page', 'Next', false, String(p))
      });
      rows.push(...selection.components);
      embed.setDescription(
        `Choose an unlocked Snowman. Currently fighting S${s.target}.${
          selection.pages > 1 ? `\nPage ${selection.page + 1}/${selection.pages}` : ''
        }`
      );
    } else if (view === 'throw') {
      embed.addFields({
        name: 'Throw',
        value: !s.owned[1]
          ? s.dummyHp
            ? `Training dummy: ${s.dummyHp}/5 HP. Make and throw snowballs.`
            : !s.roughOwned
            ? 'The dummy is broken. Ask Requia for help, then obtain a Rough Snowman.'
            : s.roughHp
            ? `Rough Snowman: ${s.roughHp}/50 HP. ${
                s.roughThrows < 3
                  ? 'Practice three hits.'
                  : !s.redRecipe
                  ? 'Visit the Kitchen.'
                  : 'Use your new recipe to finish it.'
              }`
            : !s.oldStone
            ? 'Buy Old Stone from Requia to receive the Stone shovel.'
            : 'Purchase S1 at the shop, then return to Throw.'
          : `S${s.target}: ${s.tiers[s.target].wins} victories · ${
              s.tiers[s.target].losses
            } defeats\nYou: ${s.playerHp}/${M.maxHp(s)} HP · Snowman: ${Number(
              s.enemyHp.toFixed(2)
            )} HP\n${s.active ? 'Combat continues while you are away.' : 'Use Throw to start.'}`
      });
      if (!s.owned[1] && (s.dummyHp > 0 || (s.roughOwned && s.roughHp > 0)))
        row(
          button('craft', 'Make 1 ⚪'),
          button('craft', 'Make 10 ⚪', false, '10'),
          button('attack', 'Throw ⚪'),
          ...(s.redRecipe ? [button('attack-spicy', 'Throw 🔴')] : [])
        );
      else if (s.owned[1]) {
        const ammunition = [
          ['regular', '⚪ Regular'],
          ['red', s.fireFlowerOwned ? '🔥 Fire Ball' : '🔴 Spicy'],
          ['ice', '🔵 Ice'],
          ['brown', '🟤 Brown']
        ].filter(([type]) => (type === 'brown' ? s.brown?.generated > 0 : known[type]));
        const equipped = ammunition.find(([type]) => type === s.equipped)?.[1] || '⚪ Regular';
        const fallback = s.equipped !== 'regular' && !M.ammoAvailable(s, s.equipped);
        embed.addFields({
          name: 'Equipped',
          value: `**${equipped}**\n${
            fallback
              ? `Out of stock. ${
                  M.ammoAvailable(s, 'regular')
                    ? 'Currently using ⚪ Regular.'
                    : 'Waiting for snow for ⚪ Regular.'
                } ${equipped} resumes when restocked.`
              : M.ammoAvailable(s, s.equipped)
              ? 'Your idle attacks use this snowball while it is available.'
              : 'Waiting for snow for ⚪ Regular.'
          }`
        });
        row(
          ...(s.chapter !== 0 || s.tutorialFlow !== 2 ? [button('snowmen', 'Change Snowman')] : []),
          button('throw', 'Refresh'),
          ...(s.gymUnlocked && !s.gymEntered ? [button('train', 'Visit Hendrix')] : [])
        );
        row(
          ...ammunition.map(([type, label]) => {
            const quick = ['red', 'ice'].includes(type) && !M.ammoAvailable(s, type);
            const cost =
              type === 'ice'
                ? M.rules.iceSnowCost
                : M.rules.redSnowCost * (s.fireFlowerOwned ? Math.max(1, 5 - s.wallet.red) : 1);
            return button(
              quick ? `quick-buy-${type}` : `equip-${type}`,
              quick ? `${label} · Buy Max` : label,
              quick ? s.wallet.snow < cost : !M.ammoAvailable(s, type),
              quick ? 'max' : '1',
              s.equipped === type ? ButtonStyle.Success : ButtonStyle.Secondary
            );
          })
        );
      }
    }
  }
  const available = [`${compactNumber(s.wallet.snow)}❄️`];
  for (const [key, emoji] of [
    ['regular', '⚪'],
    ['red', '🔴'],
    ['ice', '🔵'],
    ['diamonds', '💎'],
    ['sweat', '💦'],
    ['buttons', '🔘']
  ]) {
    if (known[key] && !(key === 'regular' && (idleStarted(s) || (s.liveRules && s.redRecipe))))
      available.push(`${compactNumber(s.wallet[key])}${emoji}`);
  }
  embed.setFooter({ text: `Available: ${available.join(' · ')}` });
  if (s.brown?.generated > 0)
    embed.setFooter({
      text: `Available: ${available.join(' · ')} · ${compactNumber(s.brown.inventory)}🟤`
    });
  const embeds = [embed];
  if (diagnostic && run) embeds.push(diagnosticEmbed(run, receipt.counts));
  return require('./screen-style').restore(
    receipt,
    userId,
    { content: '', embeds, components: rows, allowedMentions: { parse: [] } },
    view
  );
}
module.exports = { screen, diagnosticEmbed, viewFor };
