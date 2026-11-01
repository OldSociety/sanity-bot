// Adapt the original presentation to the development model. This module only
// projects state and controls; it never executes the legacy economy or combat.
const { screen: originalScreen } = require('./presentation');
const { config } = require('./battle');
const { dialogue } = require('../character-dialogue');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { discovered } = require('./playtest-discovery');
const M = require('./playtest-model');
const { timingText } = require('./playtest-timings');
const { IDS, DIRTY_RECIPE, emojiFor } = require('./recipes');
const actionOf = b => b.data.custom_id.split(':')[4];
function restore(receipt, userId, output, location) {
  const s = receipt.state, known = discovered(s), action = receipt.action;
  const id = (name, quantity = '1') => `snow:${userId}:pt:${receipt.run?.run ?? 'normal'}:${name}:${quantity}`;
  const button = (name, label, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(id(name)).setLabel(label).setStyle(style);
  const row = (...buttons) => new ActionRowBuilder().addComponents(buttons);
  // Preserve the diagnostic/admin renderer and its confirmation protections.
  if (['admin', 'restart'].includes(location)) return formatCommands(output);
  const closed = s.chapter === 2 || Boolean(receipt.run && receipt.run.status !== 'active');
  const lesson = s.gymEntered && s.strength < 3;
  let view = lesson ? 'train' : location;
  if (location === 'status' && !s.wooden && s.dummyHp > 0) view = 'welcome';
  let continueCommand;
  const next = () => s.dummyHp > 0 ? 'throw' : !s.wooden ? 'shop' : !known.diamonds ? 'diamonds' : !s.roughOwned ? 'shop' : !s.redRecipe && known.kitchen ? 'kitchen' : !s.redRecipe || s.roughHp > 0 ? 'throw' : 'shop';
  if (!lesson && (location === 'shop' && s.dummyHp > 0 || location === 'diamonds' && !s.wooden || location === 'kitchen' && !known.kitchen || location === 'train' && !s.gymUnlocked || location === 'emporium' && !known.buttons)) { view = 'not-ready'; continueCommand = next(); }
  if (!lesson && receipt.outcome !== 'rejected' && receipt.outcome !== 'denied') {
    if (receipt.presentationView) view = receipt.presentationView;
    else if (action === 'shop-help' && s.wooden) view = 'shovel-gift';
    else if (action === 'beg' && s.diamondGift) view = 'diamond-gift';
    else if (action === 'buy-snowman' && s.roughOwned) view = 'snowman-purchased';
    else if (action === 'mix' && s.redRecipe && !s.recipeDraft) view = 'spicy-unlocked';
    else if (action === 'buy-old-stone' && s.oldStone) view = 'stone-unlocked';
    else if (['buy-spicy', 'buy-red-diamonds'].includes(action)) view = 'spicy-purchased';
    else if (action === 'buy-sturdy' && s.owned[1]) view = 'sturdy-purchased';
  }
  if (!lesson && location === 'throw' && !s.owned[1]) {
    if (!s.dummyHp && !s.roughOwned) view = 'broken';
    else if (s.roughOwned && !s.roughHp) view = 'melted';
  }
  if (s.liveRules && s.tutorialStage === 'gym' && !s.gymEntered) view = 'battle-defeat';
  if (s.chapter0Pending) view = 'stone-unlocked';
  const projection = {
    player: { userId, tier: s.tier, shovelTier: s.tier, snow: s.wallet.snow, snowballs: s.wallet.regular, diamonds: s.wallet.diamonds },
    progress: { dummyHp: s.dummyHp, snowballsUnlocked: known.regular, diamondsUnlocked: known.diamonds },
    shopProgress: { helped: s.wooden, snowmanOwned: s.roughOwned, snowmanHp: s.roughHp },
    tutorialGifts: { diamondGift: s.diamondGift },
    kitchen: { spicyUnlocked: s.redRecipe, spicy: s.wallet.red, peppers: s.wallet.peppers, oldStone: s.oldStone },
    recipeDraft: s.recipeDraft || { ingredients: [], ingredientOrder: [...IDS] },
    battle: { gym: { strength: s.strength, accuracy: s.accuracy }, gymUnlocked: { strength: s.gymEntered, accuracy: s.strength >= 25 },
      gymVisited: s.gymEntered || s.gymUnlocked, gymTutorialActive: lesson, sturdyOwned: s.owned[1], sweat: s.wallet.sweat, idleStarted: known.sweat,
      ironMaterial: s.ironMaterial, ironShovelOwned: s.tier === 3, buttonsUnlocked: known.buttons, buttons: s.wallet.buttons },
    message: receipt.message || (view === 'spicy-purchased' ? 'You purchased 🔴 Spicy Snowballs. Use `/snow throw` to continue.' : null), continueCommand
  };
  const original = originalScreen(projection, ['unavailable', 'emporium'].includes(view) ? 'not-ready' : view === 'throw' && s.owned[1] ? 'status' : view, {
    battleConfig: { ...config, spicySnowCost: M.rules.redSnowCost, ironSnowCost: M.rules.ironSnowCost }, development: false
  });
  // Translate only supported actions. No legacy fight queue, testing shortcut,
  // secret recipe or unimplemented purchase can leak into the live adapter.
  const allowed = new Set(['throw', 'shop', 'help', 'diamonds', 'kitchen', 'train', 'craft', 'attack', 'attack-spicy', 'shop-help', 'beg', 'buy-snowman', 'buy-sturdy', 'buy-old-stone', 'buy-spicy', 'pepper', 'mix', 'ingredient', 'recipe-cancel', 'iron']);
  original.components = original.components.map(r => row(...r.components.filter(b => {
    const [,, name] = b.data.custom_id.split(':');
    return allowed.has(name);
  }).map(b => {
    const [,, name, q] = b.data.custom_id.split(':');
    b.setCustomId(id(name === 'diamonds' && q ? 'diamonds-convert' : name, q || '1')); return b;
  }))).filter(r => r.components.length);
  const embed = original.embeds[0];
  if (view === 'not-ready' || ['unavailable', 'emporium'].includes(view)) {
    embed.setTitle('Not ready yet').setDescription(`You’re not ready for that yet. Try using \`/snow ${continueCommand || next()}\` instead.`);
    original.components = [row(button(continueCommand || next(), 'Continue', ButtonStyle.Success))];
  }
  if (view === 'shop') {
    // Keep the portrait and original dialogue; wares follow the current chapter.
    if (s.wooden) {
      embed.setFields(); original.components = [];
      const ware = (name, value) => embed.addFields({ name, value, inline: true });
      const purchase = (name, label, disabled, quantity = '1') => new ButtonBuilder().setCustomId(id(name, quantity)).setLabel(label).setStyle(ButtonStyle.Primary).setDisabled(disabled);
      if (known.diamonds && !s.roughOwned) {
        ware('`Rough Snowman` ⛄️', '**1💎**'); original.components.push(row(purchase('buy-snowman', 'Rough ⛄️ · 1💎', s.wallet.diamonds < 1)));
      }
      if (s.redRecipe) {
        ware('🔴 `Spicy Snowballs`', '**1💎 each**');
        original.components.push(row(...['1', '10', '100', 'max'].filter(q => q === '1' || (q === 'max' ? s.wallet.diamonds > 0 : Number(q) <= s.wallet.diamonds)).map(q => purchase('buy-spicy', q === 'max' ? 'Spicy 🔴 Max' : `Spicy 🔴 ×${q} · ${q}💎`, s.wallet.diamonds < (q === 'max' ? 1 : Number(q)), q))));
        if (!s.oldStone && (!s.liveRules || s.gymEntered && s.strength >= 3)) { ware('`Old Skipping Stone`', s.liveRules ? '**1💎**' : '**10💎**'); original.components.push(row(purchase('buy-old-stone', `Old Skipping Stone · ${s.liveRules ? 1 : 10}💎`, s.wallet.diamonds < (s.liveRules ? 1 : 10)))); }
      }
      if (s.roughOwned && !s.roughHp && !s.owned[1]) { ware('`Sturdy Snowman` ⛄️', '**1💎**'); original.components.push(row(purchase('buy-sturdy', 'Sturdy ⛄️ · 1💎', s.wallet.diamonds < 1))); }
      const upgrades = [];
      if (s.owned[1] && !s.owned[2] && s.tiers[1].wins >= 100) { ware('`Snowman 2` ⛄️', '100 S1 victories'); upgrades.push(purchase('buy-s2', 'Unlock S2', false)); }
      if (s.owned[2] && !s.owned[3]) { ware('`Snowman 3` ⛄️', '**5k💎** · 100 S2 victories'); upgrades.push(purchase('buy-s3', 'S3 · 5k💎', s.tiers[2].wins < 100 || s.wallet.diamonds < 5000)); }
      if (s.ironMaterial && s.tier === 2) { ware('`Iron Shovel`', '**2k💎** + Iron material'); upgrades.push(purchase('iron', 'Iron Shovel · 2k💎', s.wallet.diamonds < 2000)); }
      if (upgrades.length) original.components.push(row(...upgrades));
      if (receipt.message?.includes('on the house')) embed.setDescription(dialogue(receipt.message));
      const navigation = [button('shop', 'Refresh'), button('diamonds', '💎 Exchange')];
      if (!s.redRecipe && known.kitchen) navigation.push(button('kitchen', 'Kitchen 🌶️'));
      if (s.roughOwned && (s.roughHp > 0 || s.owned[1])) navigation.push(button('throw', 'Throw'));
      original.components.push(row(...navigation));
      if (s.liveRules && s.tutorialStage === 'stone') {
        embed.setDescription(dialogue('Ah, that old rock? One diamond and it’s yours.') + (s.wallet.diamonds < 1 ? '\n\nUse `/snow diamonds` to exchange your gathered snow.' : ''));
        embed.setFields({ name: '`Old Skipping Stone`', value: '**1💎**' });
        original.components = [row(purchase('buy-old-stone', 'Old Skipping Stone · 1💎', s.wallet.diamonds < 1), button('diamonds', '💎 Exchange'), button('shop', 'Refresh'))];
      }
    }
  }
  if (view === 'status') {
    const equipment = embed.data.fields?.find(f => f.name === 'Equipment');
    if (equipment) equipment.value = `${['Bare Hands', 'Wooden Shovel', 'Stone Shovel', 'Iron Shovel'][s.tier]}\n${M.rate(s)} snow/second`;
  }
  if (view === 'train') {
    // Original Hendrix portrait and speech style, current mandatory lesson,
    // shared training costs and prospective stat purchases.
    const taunt = receipt.message === "Those scrawny arms can't lift this!";
    embed.setDescription(lesson ? dialogue('You’ve worked up quite a sweat already. To get started, invest it towards reaching Level 3.') : [dialogue(taunt ? receipt.message : 'It’s time to train. No complaints!'), taunt ? null : receipt.message].filter(Boolean).join('\n\n'));
    embed.setFields({ name: 'STR 💪🏽', value: `Level ${s.strength}`, inline: true }, ...(s.strength >= 25 ? [{ name: 'ACC 🎯', value: `Level ${s.accuracy}`, inline: true }] : []), ...(output.embeds[0].data.fields || []).filter(f => f.name === 'Lessons complete'));
    original.components = output.components;
    if (!lesson && s.strength === 3 && !s.gymLiftRevealed) original.components.push(row(button('throw', 'Throw')));
  }
  if (location === 'throw' && s.owned[1] && view !== 'battle-defeat' && view !== 'stone-unlocked' && !lesson && s.tutorialStage !== 'stone') {
    const template = originalScreen(projection, 'throw');
    embed.setTitle(s.target === 1 ? 'Sturdy Snowman' : `Snowman ${s.target}`).setThumbnail(template.embeds[0].data.thumbnail.url);
    original.files = template.files;
    const hp = (n, max, color) => { const filled = Math.max(0, Math.min(10, Math.ceil(10 * n / max))); return `**${Math.round(n)}/${Math.round(max)} HP**\n${color.repeat(filled)}${'⬛'.repeat(10 - filled)}`; };
    embed.setDescription([receipt.message, `Defeated: ${s.tiers[s.target].wins}\n\n${hp(s.enemyHp, M.enemy(s).hp, '🟥')}`].filter(Boolean).join('\n\n'));
    embed.setFields({ name: 'You', value: hp(s.playerHp, 50, '🟩') }, ...(output.embeds[0].data.fields || []).filter(f => f.name === 'Equipped'));
    embed.addFields({ name: 'Next attacks', value: `You: ${Math.max(0, (s.nextPlayerAt - s.now) / 1000).toFixed(1)}s · Snowman: ${Math.max(0, (s.nextEnemyAt - s.now) / 1000).toFixed(1)}s` });
    original.components = output.components;
    original.components.push(row(button('shop', 'Shop'), ...(s.gymEntered ? [button('train', 'Gym')] : [])));
  }
  if (view === 'sturdy-purchased') {
    embed.setDescription(dialogue('Alright, now we’re talking. This snowman is no pushover. Be careful because he fights back!') + '\n\nUse `/snow throw` to enter the fight.');
    const target = originalScreen(projection, 'throw'); embed.setThumbnail(target.embeds[0].data.thumbnail.url); original.files = target.files;
    original.components = [row(button('throw', 'Throw', ButtonStyle.Success))];
  }
  if (view === 'help') embed.setDescription(!s.wooden ? 'Collect ❄️ Snow automatically, including while offline.\n\nUse `/snow throw` to visit your practice target. **10 ❄️ → 1 ⚪️**, dealing **1 damage**. The dummy has **5 HP**.' : embed.data.description.replace('**100❄️ each**', '**1💎 each**'));
  if (view === 'spicy-purchased') embed.setDescription(receipt.message || 'You purchased 🔴 Spicy Snowballs. Use `/snow throw` to continue.');
  if (!lesson && action === 'recipe-cancel') { embed.setDescription('Mixing cancelled. Use `/snow kitchen` when you want to start again.'); original.components = []; }
  if (view === 'kitchen' && s.redRecipe) {
    const draft = projection.recipeDraft;
    embed.setFields({ name: 'Recipes', value: Array.from({ length: 7 }, (_, index) => `${index + 1}. ${index === 0 ? '🌶️🌶️🌶️' : index === 1 && s.dirtyRecipeUnlocked ? DIRTY_RECIPE.map(emojiFor).join('') : '❔'.repeat(7)}`).join('\n') },
      { name: 'Enter Recipe:', value: draft.ingredients.map(emojiFor).join('') + '❔'.repeat(7 - draft.ingredients.length) });
    original.components = [row(...draft.ingredientOrder.map(ingredient => new ButtonBuilder().setCustomId(id('ingredient', ingredient)).setLabel(emojiFor(ingredient)).setStyle(ButtonStyle.Secondary).setDisabled(draft.ingredients.length >= 7))),
      row(...(draft.ingredients.length >= 3 ? [button('mix', 'Mix', ButtonStyle.Success)] : []), button('recipe-cancel', 'Cancel', ButtonStyle.Danger))];
  } else if (view === 'kitchen') {
    embed.setFields({ name: 'Recipes', value: Array.from({ length: 7 }, (_, index) => `${index + 1}. ${'❔'.repeat(7)}`).join('\n') },
      { name: 'Enter Recipe:', value: '🌶️'.repeat(s.wallet.peppers) + '❔'.repeat(7 - s.wallet.peppers) });
  }
  if (!lesson && action === 'recipe-cancel') original.components = [];
  if (s.liveRules && view === 'throw' && !s.owned[1] && s.roughOwned && s.roughHp > 0) {
    if (!s.redRecipe && s.roughThrows >= 3) {
      embed.setDescription(dialogue('This is going to take forever. Let’s go to the Kitchen and create something a bit more impactful.'));
      original.components = [row(button('kitchen', 'Kitchen 🌶️'))];
    } else if (s.redRecipe) {
      embed.setDescription(`**${s.roughHp}/50 HP**\n${'🟩'.repeat(Math.ceil(s.roughHp / 5))}${'⬛'.repeat(10 - Math.ceil(s.roughHp / 5))}`);
      original.components = [row(new ButtonBuilder().setCustomId(id('attack-spicy')).setLabel('Throw · 1 🔴').setStyle(ButtonStyle.Danger).setDisabled(!s.wallet.red), button('shop', 'Shop'), button('throw', 'Refresh'))];
    } else {
      embed.setDescription(`Practice your aim! Throw three snowballs at the Rough Snowman.\n\n**${s.roughHp}/50 HP** · ${s.roughThrows}/3 practice throws`);
      original.components = [row(new ButtonBuilder().setCustomId(id('attack')).setLabel('Throw · 1 ⚪️').setStyle(ButtonStyle.Primary).setDisabled(!s.wallet.regular))];
      const capacity = Math.floor(s.wallet.snow / 10);
      const quantities = ['1', '10', '100', 'max'].filter(q => q === 'max' ? capacity > 0 : Number(q) <= capacity);
      if (quantities.length) original.components.push(row(...quantities.map(q => new ButtonBuilder().setCustomId(id('craft', q)).setLabel(q === 'max' ? 'Make Max ⚪️' : `Make ×${q} ⚪️`).setStyle(ButtonStyle.Secondary))));
      original.components.push(row(button('throw', 'Refresh')));
    }
  }
  if (s.liveRules && s.tutorialStage === 'gym' && !s.gymEntered) {
    embed.setTitle('Your first victory!').setDescription(dialogue("Wow, you worked up quite the 💦 Sweat taking down that Snowman. Let's head to the Gym and see what we can do with it.")).setFields();
    original.components = [row(button('train', 'Gym', ButtonStyle.Success))];
  }
  if (s.liveRules && s.tutorialStage === 'stone' && !['shop', 'diamonds'].includes(location)) {
    const gym = originalScreen(projection, 'train'); embed.setTitle('Hendrix’s Gym 💪🏽').setThumbnail(gym.embeds[0].data.thumbnail.url); original.files = gym.files;
    embed.setDescription(dialogue("Now, you're getting somewhere. Destroying snowmen will work up quite the Sweat, but you're going to need a bigger arsenal to make any real progress. Head back to the Shop and ask about that old rock Requia keeps behind the counter. Maybe it can help.")).setFields();
    original.components = [row(button('shop', 'Shop', ButtonStyle.Success))];
  }
  if (s.liveRules && view === 'stone-unlocked') {
    const shop = originalScreen(projection, 'shop'); embed.setThumbnail(shop.embeds[0].data.thumbnail.url); original.files = shop.files;
    embed.setDescription(dialogue("You turned that old rock into a Stone Shovel 🪏? Why didn't I think of that? With it you're now collecting 36❄️/second. I'm sure there's other ways to improve it, just keep your eye out for materials. Until then, why don't you stock up on some more spicy snowballs and get back to the fight."));
    if (s.chapter0Pending) original.components = [row(button('end-chapter0', 'End of Chapter 0', ButtonStyle.Success))];
  }
  embed.setFooter(output.embeds[0].data.footer);
  // Navigation follows discovery just like currency footers. It must never
  // turn a visit to an unrelated location into a crafting/combat screen.
  original.components = original.components.map(r => row(...r.components.filter(b => {
    const name = actionOf(b);
    return !(name === 'diamonds' && !s.wooden || name === 'shop' && s.dummyHp > 0 || name === 'kitchen' && !known.kitchen || name === 'train' && !s.gymUnlocked);
  }))).filter(r => r.components.length);
  if (output.embeds.length > 1) original.embeds.push(...output.embeds.slice(1));
  if (closed) {
    original.components = [];
    const saved = output.embeds[0].data.fields?.find(f => f.name === 'Test saved');
    if (saved) embed.addFields(saved);
  }
  if (receipt.run) embed.addFields({ name: `Diagnostic · Run #${receipt.run.run} · ${receipt.run.speed}×`, value: `${(receipt.run.realElapsedMs / 60000).toFixed(1)} real / ${(receipt.run.gameElapsedMs / 60000).toFixed(1)} game minutes\nButton responses (prior completed samples):\n${timingText(receipt.run.timings)}`.slice(0, 1024) });
  return formatCommands(original);
}
function formatCommands(output) {
  const format = text => text?.replace(/(?<!`)\/snow(?: [a-z][a-z_-]*)?/g, command => `\`${command}\``);
  for (const embed of output.embeds) {
    if (embed.data.description) embed.setDescription(format(embed.data.description));
    if (embed.data.fields) embed.setFields(embed.data.fields.map(f => ({ ...f, value: format(f.value) })));
  }
  const buttons = output.components.flatMap(r => r.components), refresh = buttons.filter(b => b.data.label === 'Refresh');
  if (refresh.length) {
    const ordered = [...buttons.filter(b => b.data.label !== 'Refresh'), refresh.at(-1)]; output.components = [];
    for (let n = 0; n < ordered.length; n += 5) output.components.push(new ActionRowBuilder().addComponents(...ordered.slice(n, n + 5)));
  }
  return output;
}
module.exports = { restore };
