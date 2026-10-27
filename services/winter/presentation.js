const path = require('node:path')
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js')
const { SHOVELS, COSTS, TARGETS } = require('./economy')
const { IDS, DIRTY_RECIPE, emojiFor } = require('./recipes')
const { confirmationButtons } = require('../confirmation-controls')
const { config: battleConfig, hasStarted } = require('./battle')
const { compactNumber: format } = require('../compact-number')
const { SKILLS, MAX_LEVEL, LIFT_TAUNT, RECIPE_PRICE } = require('./gym')
const { dialogue } = require('../character-dialogue')

function screen({ player: p, progress = {}, shopProgress = {}, tutorialGifts = {}, kitchen = {}, recipeDraft = {}, battle = {}, message, continueCommand }, view = 'status', { development = false, now = Date.now() } = {}) {
  const kitchenReady = shopProgress.snowmanOwned && shopProgress.snowmanHp <= TARGETS.snowman - TARGETS.kitchenHits && !kitchen.spicyUnlocked
  const shovel = SHOVELS[p.tier]
  const next = p.tier === 2 ? 'Maximum shovel unlocked' :
    `${SHOVELS[p.tier + 1].name}: ${format(shovel.cost)} snow${p.tier === 1 ? ' + 1 Sturdy Rock (consumed)' : ''}`
  const available = [`${format(p.snow)}❄️`]
  const idleStarted = hasStarted(battle)
  if (!idleStarted && (progress.snowballsUnlocked || p.snowballs)) available.push(`${format(p.snowballs)}⚪️`)
  if (kitchen.spicyUnlocked) available.push(`${format(kitchen.spicy || 0)}🔴`)
  if (battle.dirtyUnlocked) available.push(`${format(battle.dirty || 0)}🟤`)
  if (progress.diamondsUnlocked || p.diamonds) available.push(`${format(p.diamonds)}💎`)
  if (idleStarted) available.push(`${format(battle.sweat)}💦`)
  const embed = new EmbedBuilder().setColor(0xadd8e6)
    .setTitle({ welcome: 'Welcome to Winter Wars ❄️', status: 'Winter Wars · Snow', snowballs: 'Snowball Factory', diamonds: '💎 Exchange', 'diamond-gift': '💎 Exchange', shop: 'Requia’s Winter Shop', shovel: 'Shovels', throw: shopProgress.snowmanOwned && progress.dummyHp === 0 ? 'Rough Snowman ⛄️' : 'Training Dummy', help: 'Winter Wars · Help', restart: 'Restart your development profile?', broken: 'Oh No!', 'broken-again': 'Oh No!', 'shovel-gift': 'Congratulations!', 'snowman-purchased': 'Rough Snowman purchased! ⛄️', kitchen: 'Kylax’s Kitchen 🌶️', 'spicy-unlocked': 'New Snowball Unlocked!', 'spicy-purchased': 'Spicy Snowballs 🔴', 'hidden': 'New Recipe!', 'dirty-unlocked': 'Dirty Snowball Unlocked!', 'not-ready': 'Not ready yet', 'stone-unlocked': 'New Shovel Unlocked!', melted: 'Not again!', 'sturdy-purchased': 'New Opponent Unlocked!', 'hendrix-unlocked': 'New Opponent Unlocked!', 'requia-unlocked': 'New Opponent Unlocked!', hendrix: 'Hendrix 💪🏽', requia: 'Requia 💎', opponents: 'Choose your opponent', fight: 'Snowman ⛄️', 'battle-defeat': 'Oh No!', train: 'Hendrix’s Gym 💪🏽' }[view])
    .setFooter({ text: `Available: ${available.join(' · ')}` })
  const button = (action, label, disabled = false, style = ButtonStyle.Secondary) => new ButtonBuilder()
    .setCustomId(`snow:${p.userId}:${action}`).setLabel(label).setStyle(style).setDisabled(disabled)
  const row = (...buttons) => new ActionRowBuilder().addComponents(...buttons)
  const components = [], files = []
  const thumbnail = name => {
    embed.setThumbnail(`attachment://winter-${name}.png`)
    files.push(new AttachmentBuilder(path.join(__dirname, `../../assets/winter/${name}.png`), { name: `winter-${name}.png` }))
  }
  const badge = (folder, file, name) => {
    embed.setThumbnail(`attachment://${name}.png`)
    files.push(new AttachmentBuilder(path.join(__dirname, '../../assets/badges', folder, file), { name: `${name}.png` }))
  }
  const quantities = (action, cost, crafting = false) => {
    const capacity = Math.floor(p.snow / cost)
    if (!capacity) return
    const values = ['1', '10', '100'].filter(q => Number(q) <= capacity)
    values.push('max')
    components.push(row(...values.map(q => button(`${action}:${q}`, crafting ? (q === 'max' ? 'Make Max ⚪️' : `Make ×${q} ⚪️`) : q === 'max' ? 'Max' : `×${q}`))))
  }
  if (view === 'not-ready') {
    embed.setDescription(`You’re not ready for that yet. Try using \`/snow ${continueCommand}\` instead.`)
    components.push(row(button(continueCommand, 'Continue', false, ButtonStyle.Success)))
  } else if (view === 'hidden') {
    embed.setDescription(DIRTY_RECIPE.map(emojiFor).join(''))
  } else if (view === 'dirty-unlocked') {
    embed.setDescription(dialogue('Wow that’s gross.'))
    components.push(row(button('throw', 'Throw')))
  } else if (view === 'spicy-purchased') {
    embed.setDescription(message)
    components.push(row(button('throw', 'Throw')))
  } else if (view === 'welcome') {
    embed.setDescription('Prepare to go toe to toe in the crazy snowball fight ever seen. Every second you play, you’ll collect ❄️ Snow that you can use against your enemies. Each snowball costs 10 ❄️.\n\nTo get started use `/snow throw`. Use the `/snow help` command if you get stuck.')
    components.push(row(button('throw', 'Throw'), button('help', 'Help')))
  } else if (view === 'restart') {
    embed.setDescription('Restart your Winter Wars development profile from the beginning?\n\nYou will have **10 ❄️**, Bare Hands, no snowballs or diamonds, and a fresh dummy. Your currency discoveries and shop progress will also reset.')
    components.push(row(...confirmationButtons(`snow:${p.userId}:restart-confirm:${progress.restartToken}`, `snow:${p.userId}:restart-cancel`)))
  } else if (['broken', 'broken-again'].includes(view)) {
    embed.setDescription(dialogue(view === 'broken'
      ? 'You broke it! What were you thinking?! You better use `/snow shop` to replace it.'
      : 'I told you, you broke it! You’ve got to replace it in the `/snow shop`.'))
    thumbnail('broken-dummy')
    components.push(row(button('shop', 'Requia’s Winter Shop')))
  } else if (view === 'melted') {
    embed.setDescription(dialogue('Not again! You know what to do.'))
    thumbnail('melted-snowman')
    components.push(row(button('shop', 'Shop')))
  } else if (['sturdy-purchased', 'opponents'].includes(view)) {
    if (view === 'sturdy-purchased') embed.setTitle('New Opponent Unlocked!')
    embed.setDescription([message, dialogue('Alright, now we’re talking. This snowman is no pushover. Be careful because he fights back!')].filter(Boolean).join('\n\n'))
    const opponents = [button(`battle-start:${battle.fightId}`, '⛄️', false, ButtonStyle.Success)]
    if (battle.hendrixUnlocked) opponents.push(button('opponent-hendrix', 'Hendrix 💪🏽'))
    if (battle.requiaUnlocked) opponents.push(button('opponent-requia', 'Requia 💎'))
    components.push(row(...opponents))
  } else if (['hendrix-unlocked', 'requia-unlocked'].includes(view)) {
    embed.setTitle('New Opponent Unlocked!').setDescription(view === 'hendrix-unlocked' ? 'You lifted 100lbs! Hendrix is ready to face you. 💪🏽' : 'You unlocked Requia! 💎')
    components.push(row(button('throw', 'Opponents')))
  } else if (['hendrix', 'requia'].includes(view)) {
    const name = view === 'hendrix' ? 'Hendrix' : 'Requia'
    embed.setTitle(view === 'hendrix' ? 'Hendrix 💪🏽' : 'Requia 💎').setDescription(`${name} is sizing you up. Come back soon.`)
    components.push(row(button('throw', 'Opponents')))
  } else if (view === 'fight') {
    const health = (hp, max, color = '🟩') => {
      const filled = Math.ceil(10 * hp / max)
      return `**${format(hp)}/${format(max)} HP**\n${color.repeat(filled)}${'⬛'.repeat(10 - filled)}`
    }
    embed.setDescription([message, battle.lastEvent].filter(Boolean).join('\n\n') || 'You’re automatically throwing snowballs. Each throw uses 10 ❄️.')
      .addFields({ name: 'Sturdy Snowman', value: `${health(battle.enemyHp, battle.enemyMaxHp, '🟥')}\n⛄️ Defeated: ${format(battle.defeated)}${battle.stunRemaining ? `\n💫 Stunned: ${battle.stunRemaining}` : ''}` },
        { name: 'You', value: health(battle.playerHp, battleConfig.playerMaxHp) })
    thumbnail('snowman')
    const attacks = []
    if (kitchen.spicyUnlocked) attacks.push(button(`battle-special:${battle.fightId}`, '🔴', !kitchen.spicy || now < battle.specialReadyAt, ButtonStyle.Primary))
    if (battle.dirtyUnlocked) attacks.push(button(`battle-dirty:${battle.fightId}`, '🟤', !battle.dirty || now < battle.specialReadyAt, ButtonStyle.Primary))
    attacks.push(button(`battle-pause:${battle.fightId}`, 'Cancel', false, ButtonStyle.Danger))
    components.push(row(...attacks))
  } else if (view === 'battle-defeat') {
    embed.setDescription('You lost. It’s time to hit the gym and get stronger. Use `/snow train`.')
    components.push(row(button('train', 'Train', false, ButtonStyle.Success)))
  } else if (view === 'train') {
    badge('Classic', 'HENDRIX_BADGE.png', 'winter-gym-badge')
    embed.setDescription(message === LIFT_TAUNT ? dialogue(message) : [dialogue('It’s time to train. No complaints!'), message].filter(Boolean).join('\n\n'))
    if (battle.trainUnlocked) {
      const gym = Object.fromEntries(SKILLS.map(skill => [skill.id, battle.gym?.[skill.id] ?? 1]))
      embed.addFields(...SKILLS.map(skill => ({ name: `${skill.emoji} ${skill.short}`, value: gym[skill.id] >= MAX_LEVEL ? 'MAX' : `Level ${format(gym[skill.id])}\n${format(gym[skill.id])}💦`, inline: true })))
      components.push(row(...SKILLS.map(skill => button(`train-${skill.id}`, `${skill.emoji} ${skill.short} · ${gym[skill.id] >= MAX_LEVEL ? 'MAX' : `${format(gym[skill.id])}💦`}`, gym[skill.id] >= MAX_LEVEL || battle.sweat < gym[skill.id], ButtonStyle.Primary))))
      components.push(row(button('lift', '🏋️ Lift 100lbs')))
    }
  } else if (view === 'kitchen') {
    badge('Winter', 'WINTER_KYLAX_BADGE.png', 'winter-kitchen-badge')
    if (kitchen.spicyUnlocked) {
      const ingredients = recipeDraft.ingredients || []
      const ingredientOrder = recipeDraft.ingredientOrder || IDS
      embed.setDescription([dialogue('Welcome back.'), message].filter(Boolean).join('\n\n'))
        .addFields({ name: 'Recipes', value: ['1. 🌶️🌶️🌶️', ...Array.from({ length: 9 }, (_, i) => `${i + 2}. ${i === 0 && battle.dirtyUnlocked ? DIRTY_RECIPE.map(emojiFor).join('') : '❔❔❔❔❔❔❔'}`)].join('\n') },
          { name: 'Enter Recipe:', value: ingredients.map(emojiFor).join('') + '❔'.repeat(7 - ingredients.length) })
      components.push(row(...ingredientOrder.map(id => button(`ingredient:${id}`, emojiFor(id), ingredients.length >= 7))))
      const controls = []
      if (ingredients.length >= 3) controls.push(button('mix', 'Mix', false, ButtonStyle.Success))
      controls.push(button('recipe-cancel', 'Cancel', false, ButtonStyle.Danger))
      components.push(row(...controls))
    } else {
      embed.setDescription([message, dialogue('Hey there! First time? Don’t worry, cooking is easy and I’m here to help. First things first. My kitchen is a great place to unlock all sorts of goodies, but you need recipes. Each recipe requires 3 to 7 **Ingredients**. Below you’ll see a number of buttons. Enter your recipe by clicking the right ones then hitting **Mix**. If the recipe is correct, you’ll unlock something new!\n\nTo get you started, I’ll give you your first recipe. 🤫 Don’t tell anyone: 🌶️🌶️🌶️')].filter(Boolean).join('\n\n'))
        .addFields({ name: 'Recipes', value: `${'🌶️'.repeat(kitchen.peppers || 0)}${'❔'.repeat(7 - (kitchen.peppers || 0))}` })
      components.push(row((kitchen.peppers || 0) < 3 ? button('pepper', '🌶️') : button('mix', 'Mix', false, ButtonStyle.Success)))
    }
  } else if (view === 'spicy-unlocked') {
    embed.setDescription('You’ve unlocked the 🔴 Spicy Snowball. Snowmen everywhere beware!')
    components.push(row(button('shop', 'Back to Shop')))
  } else if (view === 'stone-unlocked') {
    embed.setDescription('You received the Stone Shovel 🪏. You’re now collecting 36❄️/second.')
    components.push(row(button('shop', 'Back to Shop')))
  } else if (view === 'shop') {
    badge('Classic', 'REQUIA_BADGE.png', 'winter-shop-badge')
    embed.setColor(0x00ff00)
    if (!shopProgress.helped) {
      embed.setDescription([message, dialogue('Welcome to my shop. Here you will find all the things you’ll need to win your war.'), dialogue(progress.dummyHp === 0
        ? 'It looks like you broke the training dummy, maybe we can do something about it.'
        : 'Try out the training dummy with `/snow throw`, then come see me if you need a hand.')].filter(Boolean).join('\n\n'))
      if (progress.dummyHp === 0) components.push(row(button('shop-help', 'Please help me 🙏🏽', false, ButtonStyle.Success)))
      else components.push(row(button('throw', 'Throw')))
    } else {
      embed.setDescription([message, dialogue(progress.diamondsUnlocked || p.diamonds
        ? !shopProgress.snowmanOwned ? 'Now you’re ready to replace that training dummy with something a bit tougher.' : 'Welcome back! Check out my wares below:'
        : 'You’re back! I’m happy to continue helping you out, but you’ll need to turn that snow into diamonds. Check out the 💎 Exchange below.')].filter(Boolean).join('\n\n'))
      if (progress.diamondsUnlocked || p.diamonds) {
        if (!shopProgress.snowmanOwned) {
          embed.addFields({ name: '`Rough Snowman` ⛄️', value: '**1💎**', inline: true })
          components.push(row(button('buy-snowman', 'Rough ⛄️ · 1💎', p.diamonds < 1, ButtonStyle.Primary)))
        } else if (shopProgress.snowmanHp === 0) {
          embed.addFields({ name: '`Sturdy Snowman` ⛄️', value: battle.sturdyOwned ? 'Owned' : `**${format(battleConfig.sturdyPriceDiamonds)}💎**`, inline: true })
          if (!battle.sturdyOwned) components.push(row(button('buy-sturdy', `Sturdy ⛄️ · ${format(battleConfig.sturdyPriceDiamonds)}💎`, p.diamonds < battleConfig.sturdyPriceDiamonds, ButtonStyle.Primary)))
        }
        if (kitchen.spicyUnlocked) {
          embed.addFields({ name: '🔴 `Spicy Snowballs`', value: '**1💎**', inline: true },
            { name: '`Old Skipping Stone`', value: kitchen.oldStone ? 'Owned' : '**10💎**', inline: true })
          const wares = [button('buy-spicy:1', battle.spicyPurchased || kitchen.spicy ? 'Spicy 🔴 ×1 · 1💎' : 'Spicy 🔴 · 1💎', p.diamonds < 1, ButtonStyle.Primary)]
          if (battle.spicyPurchased || kitchen.spicy) wares.push(button('buy-spicy:max', `Max 🔴 · ${format(p.diamonds)}💎`, p.diamonds < 1, ButtonStyle.Primary))
          if (!kitchen.oldStone) wares.push(button('buy-old-stone', 'Old Skipping Stone · 10💎', p.diamonds < 10, ButtonStyle.Primary))
          if (battle.sturdyOwned) {
            embed.addFields({ name: '`Recipe`', value: battle.requiaUnlocked ? 'Owned' : `**${format(RECIPE_PRICE)}💎**`, inline: true })
            if (!battle.requiaUnlocked) wares.push(button('buy-recipe', `Recipe · ${format(RECIPE_PRICE)}💎`, p.diamonds < RECIPE_PRICE, ButtonStyle.Primary))
          }
          components.push(row(...wares))
        }
      }
      components.push(row(button('diamonds', '💎 Exchange')))
      if (kitchenReady || kitchen.spicyUnlocked) {
        const navigation = [button('kitchen', 'Kitchen 🌶️')]
        if (kitchen.spicyUnlocked && shopProgress.snowmanOwned && (shopProgress.snowmanHp > 0 || battle.sturdyOwned)) navigation.push(button('throw', 'Throw'))
        components.push(row(...navigation))
      }
      else if (shopProgress.snowmanOwned && shopProgress.snowmanHp > 0) components.push(row(button('throw', 'Throw')))
    }
  } else if (view === 'shovel-gift') {
    embed.setColor(0x00ff00).setDescription(dialogue(p.tier === 1
      ? 'I can’t fix the dummy, but maybe we can make something useful out of it instead.\n\nYou’ve unlocked the **Wooden Shovel** 🪏.\n\nYou’re now collecting snow at **6❄️/second**. There are plenty more shovels out there to help you collect snow for your wars. Good luck!'
      : `You already have a ${shovel.name}, collecting ${shovel.rate}❄️/second. Keep your stronger shovel! Good luck!`))
    components.push(row(button('shop', 'Back to Shop')))
  } else if (view === 'snowman-purchased') {
    embed.setColor(0x00ff00).setDescription('You found a new way to practice! Use `/snow throw` to continue on your winter journey.')
    thumbnail('snowman')
    components.push(row(button('shop', 'Back to Shop'), button('throw', 'Throw')))
  } else if (view === 'throw') {
    const snowman = shopProgress.snowmanOwned && progress.dummyHp === 0
    const maximum = snowman ? TARGETS.snowman : TARGETS.dummy
    const hp = Math.min(maximum, snowman ? shopProgress.snowmanHp : progress.dummyHp ?? TARGETS.dummy)
    const segments = snowman ? 10 : TARGETS.dummy
    const filled = Math.ceil(hp / maximum * segments)
    embed.setDescription(snowman && kitchenReady
      ? dialogue('This is going to take forever. Let’s go to the Kitchen and create something a bit more impactful.')
      : [message, hp ? 'Practice your aim! Each throw uses 1 ⚪️ and deals 1 damage.' : 'You defeated the Rough Snowman!',
        `**${hp}/${maximum} HP**\n${'🟩'.repeat(filled)}${'⬛'.repeat(segments - filled)}`].filter(Boolean).join('\n\n'))
    thumbnail(snowman ? 'snowman' : 'dummy')
    if (kitchenReady) components.push(row(button('kitchen', 'Kitchen 🌶️'), button('shop', 'Shop')))
    else {
      const attacks = [button('attack', 'Throw · 1 ⚪️', !p.snowballs || !hp, ButtonStyle.Primary)]
      if (snowman && kitchen.spicyUnlocked) attacks.push(button('attack-spicy', 'Throw · 1 🔴', !kitchen.spicy || !hp, ButtonStyle.Danger))
      if (development && snowman && kitchen.spicyUnlocked && hp) attacks.push(button('test-kill', 'Defeat Rough · Test', false, ButtonStyle.Danger))
      components.push(row(...attacks))
      quantities('craft', 10, true)
      components.push(row(button('throw', 'Refresh'), button('shop', 'Shop'), button('help', 'Help')))
    }
  } else if (view === 'help') {
    embed.setDescription('Collect ❄️ Snow automatically, including while offline.\n\nUse `/snow throw` to visit your practice target. **10 ❄️ → 1 ⚪️**, dealing **1 damage**. The dummy has **5 HP**.\n\nAfter it breaks, visit Requia’s Winter Shop for a free wooden shovel (**6❄️/second**). Beg in the 💎 Exchange for your first diamond, then buy a **Rough Snowman for 1 💎** (**50 HP**). After three hits, visit Kylax’s Kitchen to discover **🌶️🌶️🌶️**.\n\nUnlocked 🔴 Spicy Snowballs cost **1 💎 each** and deal **10 damage**. Exchange **1k ❄️ → 1 💎** for more supplies.\n\nDiscovered resources stay in your footer even at zero.')
    components.push(row(button('throw', 'Throw'), button('shop', 'Shop')))
  } else if (['diamonds', 'diamond-gift', 'snowballs'].includes(view)) {
    const exchange = view !== 'snowballs'
    const action = exchange ? 'diamonds' : 'snowballs'
    const canBeg = exchange && shopProgress.helped && !progress.diamondsUnlocked && !p.diamonds && !tutorialGifts.diamondGift
    embed.setDescription([canBeg ? dialogue('Need a hand making your first diamond? Ask me for a little help.') : view === 'diamond-gift' ? dialogue('Fine! I’ll show you how it’s done. See it’s easy! But from now on you’re paying full price. I have a business to run.') : message,
      `${format(COSTS[action])} ❄️ → 1 ${exchange ? '💎' : '⚪️'}`].filter(Boolean).join('\n\n'))
    if (view === 'diamond-gift') components.push(row(button('shop', 'Back to Shop')))
    else if (canBeg) components.push(row(button('beg', 'Beg', false, ButtonStyle.Success)))
    quantities(action, COSTS[action])
    const navigation = [button(action, 'Refresh')]
    if (view !== 'diamond-gift') navigation.unshift(button('shop', 'Back to Shop'))
    if (!exchange) navigation.push(button('throw', 'Throw'))
    components.push(row(...navigation))
  } else {
    embed.setDescription(message || 'Snow collects automatically, including while you are offline.')
      .addFields(
        { name: 'Equipment', value: `${shovel.name}\n${shovel.rate} snow/second`, inline: true },
        { name: 'Next evolution', value: !shopProgress.helped && p.tier === 0 ? 'Visit Requia’s Winter Shop after breaking the training dummy.' : next },
      )
    if (view === 'shovel' && p.tier === 1) components.push(row(button('upgrade-1', 'Upgrade', p.snow < shovel.cost || !p.rock)))
    components.push(row(button('snowballs', 'Snowballs'), button('diamonds', '💎 Exchange'), button('shop', 'Shop'), button('shovel', 'Shovels')))
    components.push(row(button('throw', 'Throw'), button('help', 'Help')))
  }
  // The shop is introduced only after the training dummy has been broken.
  const visibleComponents = components.map(component => {
    const buttons = component.components.filter(b => {
      const action = b.data.custom_id.split(':')[2]
      if (action === 'help') return false
      if (progress.dummyHp !== 0 && action === 'shop') return false
      if (kitchenReady && ['throw', 'snowballs', 'attack', 'attack-spicy', 'craft'].includes(action)) return false
      return true
    })
    return buttons.length ? row(...buttons) : null
  }).filter(Boolean)
  // Always the final testing button, including on confirmation screens.
  if (development) visibleComponents.push(row(button('restart', 'Restart', false, ButtonStyle.Danger)))
  return { content: '', embeds: [embed], components: visibleComponents, files, attachments: [], allowedMentions: { parse: [] } }
}
module.exports = { screen }
