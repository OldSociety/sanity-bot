const { SlashCommandBuilder, EmbedBuilder } = require('discord.js')

module.exports = {
  environments: ['development', 'production'],
  data: new SlashCommandBuilder()
    .setName('emoji-test')
    .setDescription('Preview progress bars made from development server emojis.')
    .setDMPermission(false),
  async execute(interaction) {
    if (!['development', 'production'].includes(process.env.NODE_ENV) || !interaction.guildId) {
      await interaction.reply({ content: 'This test is only available in a server.', ephemeral: true })
      return
    }
    await interaction.deferReply({ ephemeral: true })
    try {
      // The source stays in development even when invoked by the production bot.
      const source = await interaction.client.guilds.fetch('684459745167671453')
      const emojis = await source.emojis.fetch()
      const names = ['PB1C', 'PB1E', 'PB2C', 'PB2HF', 'PB2E', 'PB3F', 'PB3E']
      const pieces = Object.fromEntries(names.map(name => [name,
        emojis.find(item => item.name === name && item.available !== false),
      ]))
      const missing = names.filter(name => !pieces[name])
      if (missing.length) {
        await interaction.editReply({ content: `Missing development server emojis: ${missing.map(name => `\`${name}\``).join(', ')}.` })
        return
      }
      const layouts = [
        [0, ['PB1E', 'PB2E', 'PB2E', 'PB3E']],
        [2, ['PB1C', 'PB2E', 'PB2E', 'PB3E']],
        [3, ['PB1C', 'PB2HF', 'PB2E', 'PB3E']],
        [4, ['PB1C', 'PB2C', 'PB2E', 'PB3E']],
        [5, ['PB1C', 'PB2C', 'PB2HF', 'PB3E']],
        [6, ['PB1C', 'PB2C', 'PB2C', 'PB3E']],
        [8, ['PB1C', 'PB2C', 'PB2C', 'PB3F']],
      ]
      const rows = layouts.map(([value, tiles]) => {
        const bar = tiles.map(name => {
          const emoji = pieces[name]
          return `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`
        }).join('')
        return `\`${value} / 8\` ${bar}`
      })
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle('Progress bar preview')
          .setDescription(rows.join('\n'))
          .setFooter({ text: 'Four emoji tiles per bar • Hosted in development' })],
        allowedMentions: { parse: [] },
      })
    } catch (error) {
      console.warn('Emoji preview unavailable:', error.message)
      await interaction.editReply({ content: 'I could not load the development server emoji. Check that the bot can access that server.' })
    }
  },
}
