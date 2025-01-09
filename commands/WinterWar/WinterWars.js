const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  EmbedBuilder,
} = require('discord.js')
const { WinterWar, WinterMonster } = require('../../Models/model.js')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('winterwars')
    .setDescription('Manage your Winter Wars account or fight monsters!')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('account')
        .setDescription('View or allocate stats for your Winter Wars account.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('fight').setDescription('Fight a winter monster!')
    ),

  async execute(interaction) {
    const allowedChannels = [
      process.env.WINTERCHANNELID,
      process.env.BOTTESTCHANNELID,
    ]

    if (!allowedChannels.includes(interaction.channel.id)) {
      await interaction.reply({
        content: `❄️ This command can only be used in the designated Winter Wars channels.`,
        ephemeral: true,
      })
      return
    }

    const userId = interaction.user.id
    const subcommand = interaction.options.getSubcommand()

    if (subcommand === 'account') {
      let character = await WinterWar.findOne({ where: { userId } })
      if (!character) {
        character = await WinterWar.create({
          userId,
          hp: 5,
          strength: 5,
          defense: 5,
          agility: 5,
          statPoints: 10,
          war_points: 100,
        })
      }

      const generateStatEmbed = () => {
        let description =
          `**HP:** ${character.hp}\n` +
          `**Strength:** ${character.strength}\n` +
          `**Defense:** ${character.defense}\n` +
          `**Agility:** ${character.agility}\n`

        if (character.statPoints > 0) {
          description =
            `Welcome to Winter Wars! You have **${character.statPoints} points** to distribute among the following stats:\n\n` +
            `**HP:** How much damage you can take before defeat.\n` +
            `**Strength:** How much damage you deal to enemies.\n` +
            `**Defense:** How much damage you can block.\n` +
            `**Agility:** How fast you act and dodge attacks.\n` +
            `Use the buttons below to allocate your points!\n\n` +
            description +
            `\n**Unallocated Points:** ${character.statPoints}\n\n`
        }

        return new EmbedBuilder()
          .setTitle(`${interaction.user.username}'s Winter Wars Account`)
          .setDescription(description)
          .setFooter({ text: `❄️${character.war_points} War Points` })
          .setColor('Blue')
      }

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('hp')
          .setLabel('HP +1')
          .setStyle('Primary'),
        new ButtonBuilder()
          .setCustomId('strength')
          .setLabel('Strength +1')
          .setStyle('Primary'),
        new ButtonBuilder()
          .setCustomId('defense')
          .setLabel('Defense +1')
          .setStyle('Primary'),
        new ButtonBuilder()
          .setCustomId('agility')
          .setLabel('Agility +1')
          .setStyle('Primary')
      )

      const components = character.statPoints > 0 ? [actionRow] : []

      await interaction.reply({
        embeds: [generateStatEmbed()],
        components,
        ephemeral: true,
      })

      if (character.statPoints > 0) {
        const collector = interaction.channel.createMessageComponentCollector({
          filter: (i) => i.user.id === userId,
          time: 60000,
        })

        collector.on('collect', async (btnInteraction) => {
          const stat = btnInteraction.customId

          if (character.statPoints > 0) {
            await character.increment(stat, { by: 1 })
            await character.decrement('statPoints', { by: 1 })
            await character.reload()
          }

          await btnInteraction.update({
            embeds: [generateStatEmbed()],
            components: character.statPoints > 0 ? [actionRow] : [],
          })

          if (character.statPoints === 0) {
            collector.stop()
          }
        })

        collector.on('end', async () => {
          await interaction.editReply({
            components: [],
          })
        })
      }
    } else if (subcommand === 'fight') {
      let player = await WinterWar.findOne({ where: { userId } })
      if (!player) {
        await interaction.reply({
          content: `❄️ You need to allocate your stats first. Use \`/winterwars account\` to get started!`,
        })
        return
      }

      const monsters = await WinterMonster.findAll()
      if (!monsters || monsters.length === 0) {
        await interaction.reply({
          content: `❄️ No monsters are available to fight. Please try again later!`,
          ephemeral: true,
        })
        return
      }

      const monster = monsters[Math.floor(Math.random() * monsters.length)]

      const monsterStats = {
        name: monster.name,
        hp: monster.hp,
        strength: monster.strength,
        defense: monster.defense,
        agility: monster.agility,
        attacks:
          typeof monster.attacks === 'string'
            ? JSON.parse(monster.attacks)
            : monster.attacks,
      }

      const battleState = {
        playerHP: player.hp,
        monsterHP: monsterStats.hp,
        history: [],
        turnOrderDecided: false,
        turn: null,
      }

      const generateBattleEmbed = () =>
        new EmbedBuilder()
          .setTitle(
            `Battle: ${interaction.user.username} vs ${monsterStats.name}`
          )
          .setDescription(
            `❄️ **Your HP:** ${battleState.playerHP}\n` +
              `🔥 **${monsterStats.name} HP:** ${battleState.monsterHP}\n\n` +
              `**Battle History:**\n` +
              battleState.history.slice(-5).join('\n')
          )
          .setColor('Blue')

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('attack')
          .setLabel('Attack')
          .setStyle('Primary'),
        new ButtonBuilder()
          .setCustomId('defend')
          .setLabel('Defend')
          .setStyle('Secondary'),
        new ButtonBuilder()
          .setCustomId('special')
          .setLabel('Special')
          .setStyle('Success')
      )

      await interaction.reply({
        embeds: [generateBattleEmbed()],
        components: [actionRow],
        ephemeral: true,
      })

      const monsterTurn = async () => {
        const monsterDamage = Math.max(
          1,
          monsterStats.strength - player.defense + Math.floor(Math.random() * 3)
        )
        battleState.playerHP -= monsterDamage

        battleState.history.push(
          `${monsterStats.name} attacks ${interaction.user.username} for ${monsterDamage} damage.`
        )

        if (battleState.playerHP <= 0) {
          collector.stop('defeat')
          return
        }

        await interaction.editReply({
          embeds: [generateBattleEmbed()],
        })

        battleState.turn = 'player'
      }

      const collector = interaction.channel.createMessageComponentCollector({
        filter: (i) => i.user.id === userId,
        time: 60000,
      })

      collector.on('collect', async (btnInteraction) => {
        if (!battleState.turnOrderDecided) {
          battleState.turnOrderDecided = true
          if (player.agility >= monsterStats.agility) {
            battleState.turn = 'player'
            battleState.history.push(
              `${interaction.user.username} takes the first turn!`
            )
          } else {
            battleState.turn = 'monster'
            battleState.history.push(
              `${monsterStats.name} takes the first turn!`
            )
            await monsterTurn()
            return
          }
        }

        if (battleState.turn === 'player') {
          const action = btnInteraction.customId

          if (action === 'attack') {
            const playerDamage = Math.max(
              1,
              player.strength -
                monsterStats.defense +
                Math.floor(Math.random() * 3)
            )
            battleState.monsterHP -= playerDamage
            battleState.history.push(
              `${interaction.user.username} attacks ${monsterStats.name} for ${playerDamage} damage.`
            )

            if (battleState.monsterHP <= 0) {
              collector.stop('victory')
              return
            }
          } else if (action === 'defend') {
            const hpRecovered = Math.floor(player.defense / 2)
            battleState.playerHP += hpRecovered
            battleState.history.push(
              `${interaction.user.username} defends and recovers ${hpRecovered} HP.`
            )
          } else if (action === 'special') {
            const specialDamage = Math.max(
              1,
              player.strength * 1.5 -
                monsterStats.defense +
                Math.floor(Math.random() * 5)
            )
            battleState.monsterHP -= specialDamage
            battleState.history.push(
              `${interaction.user.username} uses a special attack on ${monsterStats.name} for ${specialDamage} damage.`
            )

            if (battleState.monsterHP <= 0) {
              collector.stop('victory')
              return
            }
          }

          await btnInteraction.update({
            embeds: [generateBattleEmbed()],
            components: [actionRow],
          })

          battleState.turn = 'monster'
          await monsterTurn()
        }
      })

      collector.on('end', async (collected, reason) => {
        const resultEmbed = new EmbedBuilder().setTitle('Battle Result')

        if (reason === 'victory') {
          resultEmbed
            .setDescription(
              `🎉 **Victory!** You defeated ${monsterStats.name}!\n\n💰 Rewards: +10 War Points`
            )
            .setColor('Green')
          await player.increment('war_points', { by: 10 })
        } else if (reason === 'defeat') {
          resultEmbed
            .setDescription(
              `😞 **Defeat!** ${monsterStats.name} was too strong. 💔 Better luck next time!`
            )
            .setColor('Red')
        } else {
          resultEmbed
            .setDescription(
              '⏳ **Battle Timeout!** The battle ended due to inactivity.'
            )
            .setColor('Grey')
        }

        await interaction.editReply({
          embeds: [resultEmbed],
          components: [],
        })
      })
    }
  },
}
