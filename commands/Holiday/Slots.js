const { SlashCommandBuilder, EmbedBuilder } = require('discord.js')
const { HolidayStat } = require('../../Models/model')

// Prevents concurrent spins per player
const activePlayers = new Set()

module.exports = {
  environments: [],
  eventKey: 'winter',
  data: new SlashCommandBuilder()
    .setName('slots')
    .setDescription('Spin the Winter Slot Machine! 🎰'),

  async execute(interaction) {
    return interaction.reply({ content: 'Winter commands are currently disabled.', ephemeral: true, allowedMentions: { parse: [] } })
    const allowedChannelIds = [
      process.env.WINTERCHANNELID,
      process.env.BOTTESTCHANNELID,
    ]
    if (!allowedChannelIds.includes(interaction.channel.id)) {
      return interaction.reply({
        content: `This command can only be used in <#${allowedChannelIds[0]}>.`,
        ephemeral: true,
      })
    }

    const userId = interaction.user.id
    if (activePlayers.has(userId)) {
      return interaction.reply({
        content: '⏳ You already have a spin in progress!',
        ephemeral: true,
      })
    }
    activePlayers.add(userId)

    try {
      let player = await HolidayStat.findOne({ where: { userId } })
      if (!player) {
        return interaction.reply({
          content: `You need to join the snowball event first with **/throw** to get started!`,
          ephemeral: true,
        })
      }

      const bet = 10
      if (player.candycanes < bet) {
        return interaction.reply({
          content: `You need at least **${bet} 🍬 candy canes** to play.`,
          ephemeral: true,
        })
      }

      // Deduct the bet upfront
      player.candycanes -= bet
      await player.save()

      // Weighted symbols: rarity + payouts
      const symbols = [
        { emoji: '❄️', weight: 4, value3: 100, value2: 15 },
        { emoji: '🍪', weight: 4, value3: 200, value2: 15 },
        { emoji: '🎁', weight: 3, value3: 250, value2: 18 },
        { emoji: '☃️', weight: 3, value3: 350, value2: 28 },
        { emoji: '🎄', weight: 2, value3: 500, value2: 50 },
        { emoji: '🦌', weight: 1, value3: 1000, value2: 100 },
      ]

      // Weighted random spin
      const spin = () => {
        const total = symbols.reduce((a, s) => a + s.weight, 0)
        let roll = Math.random() * total
        for (const s of symbols) {
          roll -= s.weight
          if (roll <= 0) return s
        }
        return symbols[0]
      }

      // Begin animation
      await interaction.deferReply()
      await interaction.editReply('🎰 Spinning...')

      const delay = (ms) => new Promise((r) => setTimeout(r, ms))
      for (let i = 0; i < 3; i++) {
        await delay(500)
        const fake = [spin().emoji, spin().emoji, spin().emoji]
        await interaction.editReply(`🎰 **Spinning...**\n${fake.join(`  :  `)}`)
      }

      // Final result
      const reels = [spin(), spin(), spin()]
      const [r1, r2, r3] = reels
      const display = reels.map(r => r.emoji).join(`  :  `)

      let payout = 0
      let winText = ''

      // Adjacent-only logic
      if (r1.emoji === r2.emoji && r2.emoji === r3.emoji) {
        payout = r1.value3
        winText = `🎉🎉🎉 Triple ${r1.emoji}! You won **${payout} 🍬!🎉🎉🎉**`
      } else if (r1.emoji === r2.emoji) {
        payout = r1.value2
        winText = `Two ${r1.emoji}s! You won **${payout} 🍬!**`
      } else if (r2.emoji === r3.emoji) {
        payout = r2.value2
        winText = `Two ${r2.emoji}s! You won **${payout} 🍬!**`
      } else {
        winText = `💨 No luck this time. Better bundle up and try again.`
      }

      // Update balance safely
      await player.reload()
      player.candycanes += payout
      await player.save()

      // Value chart for clarity
      const valueTable = symbols
        .map(s => `${s.emoji} — 3x: ${s.value3} 🍬 | 2x: ${s.value2} 🍬`)
        .join('\n')

      const embed = new EmbedBuilder()
        .setTitle('🎰 Winter Slot Machine 🎰')
        .setDescription(`${display}\n\n${winText}`)
        .addFields({ name: 'Payouts', value: valueTable })
        .setColor(payout > 0 ? 0x00ffb3 : 0x3399ff)
        .setFooter({ text: `Current Balance: 🍬 ${player.candycanes}` })

      await interaction.editReply({ content: '', embeds: [embed] })
    } finally {
      activePlayers.delete(userId)
    }
  },
}
