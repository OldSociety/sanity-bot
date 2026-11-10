const config = require('../../../config/winter/snowball-fight.json')
const { withBotTests } = require('../../command-channels')
const { commandEnabled } = require('../../command-environment')
const { GameError, createStore } = require('./store')
const { render } = require('./presentation')
function enabled(environment = process.env.NODE_ENV) {
  return environment === 'development' && config.enabled
}
function restriction(interaction, environment = process.env.NODE_ENV) {
  if (!enabled(environment) || !commandEnabled({ name: 'snowball-fight', environments: ['development'] }, environment)) return 'Snowball Fight is available only in development.'
  if (interaction.guildId !== config.guildId || process.env.GUILDID !== config.guildId || interaction.user.bot) return 'Use Snowball Fight in the configured development server.'
  const channels = withBotTests([process.env.WINTERCHANNELID], { guildId: interaction.guildId, environment })
  if (!channels.includes(interaction.channelId)) return `Use /snowball-fight in ${channels.map(id => `<#${id}>`).join(' or ')}.`
  return null
}
function parseButton(customId, userId) {
  const parts = customId.split(':')
  if (parts[0] !== 'sf' || parts[1] !== userId) throw new GameError('These controls belong to another player.')
  if (parts[2] === 'battle' && parts.length === 6 && /^[a-f0-9-]{36}$/.test(parts[3]) && /^\d+$/.test(parts[4]) && ['attack', 'heal', 'retreat'].includes(parts[5]))
    return { action: parts[5], battleId: parts[3], revision: Number(parts[4]) }
  if (parts[2] === 'buy' && parts.length === 4 && config.items.some(item => item.id === parts[3])) return { action: 'buy', itemId: parts[3] }
  if (parts[2] === 'claim' && parts.length === 3) return { action: 'claim' }
  if (parts[2] === 'leaders' && parts.length === 5 && ['hits', 'accuracy', 'wins', 'badges'].includes(parts[3]) && /^\d+$/.test(parts[4]))
    return { action: 'leaderboard', metric: parts[3], page: Number(parts[4]) }
  throw new GameError('Invalid Snowball Fight control. Reopen the command.')
}
function createHandler({ getStore, authorize = restriction } = {}) {
  return async function handle(interaction) {
    const denied = authorize(interaction)
    if (denied) return interaction.reply({ content: denied, ephemeral: true, allowedMentions: { parse: [] } })
    let input
    const isButton = interaction.isButton?.() === true
    try {
      if (isButton) input = parseButton(interaction.customId, interaction.user.id)
      else {
        input = { action: interaction.options.getSubcommand() }
        for (const [field, option, kind] of [['characterId', 'character', 'String'], ['itemId', 'item', 'String'], ['metric', 'metric', 'String'], ['amount', 'amount', 'Integer'], ['page', 'page', 'Integer']]) {
          const value = interaction.options[`get${kind}`](option)
          if (value !== null && value !== undefined) input[field] = value
        }
      }
    } catch (error) {
      return interaction.reply({ content: error instanceof GameError ? error.message : 'Invalid Snowball Fight command.', ephemeral: true, allowedMentions: { parse: [] } })
    }
    const publicResult = ['throw', 'fight', 'attack', 'heal', 'retreat'].includes(input.action)
    // Fight controls edit their original public encounter. Inventory/purchases remain private.
    if (isButton && ['attack', 'heal', 'retreat', 'leaderboard'].includes(input.action)) await interaction.deferUpdate()
    else await interaction.deferReply({ ephemeral: !publicResult })
    try {
      if (['throw', 'gift'].includes(input.action)) {
        const target = interaction.options.getUser('target', true)
        if (target.bot || target.id === interaction.user.id) throw new GameError('Choose another participating human member.')
        const member = interaction.options.getMember?.('target') || await interaction.guild.members.fetch(target.id).catch(() => null)
        if (!member) throw new GameError('Choose a member of this server.')
        input.targetId = target.id; input.targetBot = target.bot
      }
      const receipt = await getStore().execute({ ...input, guildId: interaction.guildId, userId: interaction.user.id, interactionId: interaction.id })
      const emojis = Object.fromEntries([...(interaction.guild?.emojis?.cache?.values() || [])].filter(e => e.available !== false).map(e => [e.name, e]))
      return await interaction.editReply(render(receipt, interaction.user.id, emojis))
    } catch (error) {
      const message = error instanceof GameError ? error.message : 'Snowball Fight could not display this action. Reopen stats or fight to check saved progress before retrying.'
      if (!(error instanceof GameError)) console.error('Snowball Fight unavailable:', error.message)
      if (interaction.deferred && isButton && ['attack', 'heal', 'retreat', 'leaderboard'].includes(input.action))
        return interaction.followUp({ content: message, ephemeral: true, allowedMentions: { parse: [] } })
      return interaction.editReply({ content: message, embeds: [], components: [], allowedMentions: { parse: [] } })
    }
  }
}
let selected
const handle = createHandler({ getStore: () => selected ||= createStore({ sequelize: require('../../../config/database/sequelize') }) })
module.exports = { enabled, restriction, parseButton, createHandler, handle }
