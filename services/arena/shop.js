const { randomUUID } = require('node:crypto')
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js')
const packConfig = require('../../config/arena/shop/packs.json')

// A browsable pack catalog only. Purchases and random draws are not implemented.
function validateCatalog(config) {
  if (!config || !Array.isArray(config.packs) || !config.packs.length || config.packs.length > 5)
    throw Error('Shop preview requires between one and five packs')
  const ids = new Set()
  for (const pack of config.packs) {
    if (!pack || typeof pack.id !== 'string' || !/^[a-z][a-z0-9-]{0,23}$/.test(pack.id) || ids.has(pack.id) ||
        typeof pack.name !== 'string' || !pack.name || pack.name.length > 60 ||
        typeof pack.tier !== 'string' || !pack.tier || pack.tier.length > 40 ||
        typeof pack.description !== 'string' || pack.description.length > 400 ||
        !Number.isInteger(pack.color) || pack.color < 0 || pack.color > 0xffffff ||
        (pack.price !== null && (!Number.isInteger(pack.price) || pack.price < 0)) ||
        !Array.isArray(pack.characterPool) || pack.characterPool.length !== 0 ||
        pack.cardsPerPack !== null || pack.odds !== null || config.currency !== null)
      throw Error('Invalid shop preview pack; card pools and purchase rules must remain unassigned')
    ids.add(pack.id)
  }
  return structuredClone(config)
}
function createShop({
  config = packConfig,
  authorize = interaction => require('./access').access.authorize(interaction),
  environment = () => process.env.NODE_ENV,
  now = Date.now, timeoutMs = 5 * 60 * 1000, maxSessions = 1000,
  setTimer = setTimeout, clearTimer = clearTimeout,
  lifecycle = null, logger = console,
} = {}) {
  const catalog = validateCatalog(config), sessions = new Map()
  const reply = (interaction, content) => interaction.reply({ content, ephemeral: true, allowedMentions: { parse: [] } })
  function view(session, closed = false) {
    const button = (action, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder()
      .setCustomId(`arena:shop:${session.id}:${session.revision}:${action}`).setLabel(label).setStyle(style).setDisabled(disabled)
    const pack = catalog.packs.find(item => item.id === session.packId)
    const embed = new EmbedBuilder().setColor(pack?.color || 0x34985d)
      .setFooter({ text: 'Arena Shop • Preview • Purchases coming soon' })
    if (closed) return { content: '', embeds: [embed.setTitle('Shop closed').setDescription('Use /arena shop to browse packs again.')],
      components: [], allowedMentions: { parse: [] } }
    if (!pack) {
      embed.setTitle('— Arena Store —').setDescription('Build your fighting roster with character packs.\nChoose a pack below to view its details.')
        .addFields(catalog.packs.map(item => ({ name: item.name, value: `${item.description}\n**Price:** To be decided`, inline: true })))
        .addFields({ name: 'Character packs', value: 'Bronze, Silver and Gold tiers. Card pools, pack contents and odds are still being designed.' })
    } else {
      embed.setTitle(pack.name).setDescription(pack.description)
        .addFields(
          { name: 'Tier', value: pack.tier[0].toUpperCase() + pack.tier.slice(1), inline: true },
          { name: 'Price', value: pack.price === null ? 'To be decided' : `${pack.price} • Currency to be decided`, inline: true },
          { name: 'Pack contents', value: 'Character cards — pool and quantity to be decided.\nNo specific characters have been assigned.' },
          { name: 'Opening a pack', value: 'The planned shop awards a random character from the selected pack’s pool. Opening odds, duplicate rules and rewards will be set later.' },
        )
    }
    const packs = new ActionRowBuilder().addComponents(catalog.packs.map(item =>
      button(`pack-${item.id}`, item.name, ButtonStyle.Primary, item.id === session.packId)))
    const actions = new ActionRowBuilder()
    if (pack) actions.addComponents(button('purchase', 'Buy & Open — Coming Soon', ButtonStyle.Success, true), button('back', 'Back to Shop'))
    actions.addComponents(button('close', 'Close Shop', ButtonStyle.Danger))
    return { content: '', embeds: [embed], components: [packs, actions], allowedMentions: { parse: [] } }
  }
  function remove(session) { session.expiryGeneration = (session.expiryGeneration || 0) + 1; clearTimer(session.timer); sessions.delete(session.id); session.release?.() }
  async function retire(session) {
    remove(session)
    await session.work?.catch(() => {})
    try { await session.edit({ components: [], allowedMentions: { parse: [] } }) }
    catch (error) {
      if (![10008, 10015, 50027].includes(Number(error.code))) logger.warn?.(`Arena shop cleanup failed: ${error.code || error.name}`)
    }
  }
  function armExpiry(session) {
    clearTimer(session.timer)
    const generation = session.expiryGeneration = (session.expiryGeneration || 0) + 1
    session.expiresAt = now() + timeoutMs
    session.timer = setTimer(() => {
      if (generation === session.expiryGeneration && sessions.has(session.id)) return retire(session)
    }, timeoutMs)
    session.timer?.unref?.()
  }
  async function execute(interaction) {
    if (environment() !== 'development') return reply(interaction, 'Shop preview is available on the development bot only.')
    if (!(await authorize(interaction))) return
    await interaction.deferReply({ ephemeral: true })
    return lifecycle ? lifecycle.open(interaction, () => openSession(interaction)) : openSession(interaction)
  }
  async function openSession(interaction) {
    for (const previous of sessions.values())
      if (previous.ownerId === interaction.user.id && previous.guildId === interaction.guildId) await retire(previous)
    if (sessions.size >= maxSessions) return interaction.editReply({ content: 'The shop is busy. Please try again shortly.' })
    const session = { id: randomUUID(), ownerId: interaction.user.id, guildId: interaction.guildId, channelId: interaction.channelId,
      packId: null, revision: 0, expiresAt: now() + timeoutMs, busy: true,
      edit: payload => interaction.editReply(payload) }
    sessions.set(session.id, session)
    session.release = lifecycle?.track(interaction, () => retire(session))
    try {
      const message = await interaction.editReply(view(session))
      session.messageId = message.id
      armExpiry(session)
    } catch (error) { remove(session); throw error }
    finally { session.busy = false }
  }
  async function handleButton(interaction) {
    if (environment() !== 'development') return reply(interaction, 'Shop preview is available on the development bot only.')
    if (!(await authorize(interaction))) return
    const [, , id, revision, action] = (interaction.customId || '').split(':')
    const session = sessions.get(id)
    if (!session) return interaction.update({ components: [], allowedMentions: { parse: [] } })
    if (session.ownerId !== interaction.user.id || session.guildId !== interaction.guildId || session.channelId !== interaction.channelId || session.messageId !== interaction.message?.id)
      return reply(interaction, 'This shop menu belongs to another session. Use /arena shop.')
    if (now() >= session.expiresAt) { remove(session); return interaction.update({ components: [], allowedMentions: { parse: [] } }) }
    if (session.busy || String(session.revision) !== revision) return reply(interaction, 'This menu has changed. Use its latest buttons.')
    const next = { ...session, revision: session.revision + 1 }
    if (action === 'close') next.closed = true
    else if (action === 'back' && session.packId) next.packId = null
    else if (action?.startsWith('pack-') && catalog.packs.some(pack => pack.id === action.slice(5) && pack.id !== session.packId)) next.packId = action.slice(5)
    else return reply(interaction, 'That action is not available. Pack purchases are coming soon.')
    session.busy = true
    const work = (async () => { try {
      await interaction.deferUpdate()
      session.edit = payload => interaction.editReply(payload)
      await interaction.editReply(view(next, next.closed))
      if (!sessions.has(id)) { await interaction.editReply({ components: [], allowedMentions: { parse: [] } }); return }
      if (next.closed) remove(session)
      else {
        const edit = session.edit
        Object.assign(session, next, { edit, work })
        armExpiry(session)
      }
    } finally { session.busy = false }
    })()
    session.work = work
    return work
  }
  function dispose() { return Promise.allSettled([...sessions.values()].map(session => retire(session))) }
  return { execute, handleButton, dispose }
}
let singleton
module.exports = { validateCatalog, createShop, shop: {
  execute: interaction => (singleton ||= createShop({ lifecycle: require('./menu-lifecycle').menuLifecycle })).execute(interaction),
  handleButton: interaction => (singleton ||= createShop({ lifecycle: require('./menu-lifecycle').menuLifecycle })).handleButton(interaction),
} }
