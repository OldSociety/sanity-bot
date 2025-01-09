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
          `**Agility:** ${character.agility}\n``**Equipped Items:**\n` +
          `- Weapons: ${equippedWeapons.join(', ') || 'None'}\n` +
          `- Defense: ${equippedDefense.join(', ') || 'None'}\n`

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
      // Fetch player data
      const player = await WinterWar.findOne({ where: { userId } })
      if (!player) {
        await interaction.reply({
          content:
            '❄️ You need to create an account first! Use `/winterwars account`.',
          ephemeral: true,
        })
        return
      }

      // Fetch equipped items
      const equippedItems = await Inventory.findAll({
        where: { winterWarId: player.id, equipped: true },
        include: { model: BaseItem },
      })

      const equippedWeapons = equippedItems.filter(
        (item) => item.BaseItem.type === 'weapon'
      )
      const equippedDefenseItems = equippedItems.filter(
        (item) => item.BaseItem.type === 'defense'
      )

      // Select a random monster
      const monster = await WinterMonster.findOne({ order: sequelize.random() })
      if (!monster) {
        await interaction.reply({
          content: '❄️ No monsters available. Please try again later!',
          ephemeral: true,
        })
        return
      }

      // Battle state setup
      const battleState = {
        playerHP: player.hp,
        monsterHP: monster.hp,
        history: [],
        turn: 'player',
        defenseModifier: 1,
      }

      // Strength/Defense Boost Logic
      const getBoostMultiplier = (stat) => {
        const boosts = [
          { threshold: 750, multiplier: 16 },
          { threshold: 700, multiplier: 15 },
          { threshold: 650, multiplier: 14 },
          { threshold: 600, multiplier: 13 },
          { threshold: 550, multiplier: 12 },
          { threshold: 500, multiplier: 11 },
          { threshold: 450, multiplier: 9.75 },
          { threshold: 400, multiplier: 8.5 },
          { threshold: 350, multiplier: 7.5 },
          { threshold: 300, multiplier: 6.5 },
          { threshold: 250, multiplier: 5.5 },
          { threshold: 200, multiplier: 4.5 },
          { threshold: 125, multiplier: 3 },
          { threshold: 85, multiplier: 2.5 },
          { threshold: 55, multiplier: 2 },
          { threshold: 35, multiplier: 1.5 },
          { threshold: 20, multiplier: 1.25 },
          { threshold: 13, multiplier: 1 },
          { threshold: 8, multiplier: 0.75 },
          { threshold: 0, multiplier: 0.5 },
        ]

        for (const boost of boosts) {
          if (stat >= boost.threshold) {
            return boost.multiplier
          }
        }
        return 0.5
      }

      // Agility-Based Damage Swing Logic
      const calculateDamageWithAgility = (
        damageMin,
        damageMax,
        attackerAgility,
        defenderAgility
      ) => {
        const maxEffect = 0.9 // Cap agility effect at 90%
        const k = 0.01 // Scaling constant

        const attackerEffect = maxEffect * (1 - Math.exp(-k * attackerAgility))
        const defenderEffect = maxEffect * (1 - Math.exp(-k * defenderAgility))

        const effectiveSwing = attackerEffect - defenderEffect
        const damageRange = damageMax - damageMin

        return Math.floor(damageMin + damageRange * (0.5 + effectiveSwing / 2))
      }

      // Generate battle embed
      const generateBattleEmbed = () =>
        new EmbedBuilder()
          .setTitle(`Battle: ${interaction.user.username} vs ${monster.name}`)
          .setDescription(
            `❄️ **Your HP:** ${battleState.playerHP}
      🔥 **${monster.name} HP:** ${battleState.monsterHP}
      
      ` +
              `**Battle History:**
      ${battleState.history.slice(-5).join('\n') || 'No actions yet.'}`
          )
          .setColor('Blue')

      // Create action buttons
      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('attack')
          .setLabel('Attack')
          .setStyle('Primary'),
        new ButtonBuilder()
          .setCustomId('fierce_attack')
          .setLabel('Fierce Attack')
          .setStyle('Danger')
      )

      equippedWeapons.forEach((weapon, index) => {
        actionRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`weapon_${index}`)
            .setLabel(`Use ${weapon.BaseItem.name}`)
            .setStyle('Secondary')
        )
      })

      // Reply with the initial battle state
      await interaction.reply({
        embeds: [generateBattleEmbed()],
        components: [actionRow],
        ephemeral: true,
      })

      // Monster Turn Logic
      const monsterTurn = async () => {
        const monsterAttack = calculateDamageWithAgility(
          monster.damageMin,
          monster.damageMax,
          monster.agility,
          player.agility
        )

        const finalDamage = Math.max(
          monsterAttack - player.defense * getBoostMultiplier(player.defense),
          1
        )

        battleState.playerHP -= finalDamage
        battleState.history.push(
          `${monster.name} attacks ${interaction.user.username} for ${finalDamage} damage!`
        )

        if (battleState.playerHP <= 0) {
          collector.stop('defeat')
          return
        }

        battleState.turn = 'player'
        await interaction.editReply({ embeds: [generateBattleEmbed()] })
      }

      // Button interaction collector
      const collector = interaction.channel.createMessageComponentCollector({
        filter: (i) => i.user.id === userId,
        time: 60000,
      })

      collector.on('collect', async (btnInteraction) => {
        if (battleState.turn !== 'player') {
          await btnInteraction.reply({
            content: 'It’s not your turn!',
            ephemeral: true,
          })
          return
        }

        const action = btnInteraction.customId

        if (action === 'attack') {
          const playerAttack = calculateDamageWithAgility(
            equippedWeapons[0]?.BaseItem.damageMin || player.strength,
            equippedWeapons[0]?.BaseItem.damageMax || player.strength * 2,
            player.agility,
            monster.agility
          )

          const finalDamage = Math.max(
            playerAttack -
              monster.defense * getBoostMultiplier(monster.defense),
            1
          )

          battleState.monsterHP -= finalDamage
          battleState.history.push(
            `${interaction.user.username} attacks ${monster.name} for ${finalDamage} damage!`
          )
        } else if (action === 'fierce_attack') {
          const playerAttack =
            calculateDamageWithAgility(
              player.strength,
              player.strength * 2,
              player.agility,
              monster.agility
            ) * 1.5

          const finalDamage = Math.max(
            playerAttack -
              monster.defense * getBoostMultiplier(monster.defense),
            1
          )

          battleState.monsterHP -= finalDamage
          battleState.defenseModifier = 0.5 // Reduce player's defense for next monster attack
          battleState.history.push(
            `${interaction.user.username} uses a fierce attack on ${monster.name} for ${finalDamage} damage!`
          )
        } else if (action.startsWith('weapon_')) {
          const weaponIndex = parseInt(action.split('_')[1], 10)
          const weapon = equippedWeapons[weaponIndex].BaseItem

          const weaponAttack = calculateDamageWithAgility(
            weapon.damageMin,
            weapon.damageMax,
            player.agility,
            monster.agility
          )

          battleState.monsterHP -= weaponAttack
          battleState.history.push(
            `${interaction.user.username} uses ${weapon.name} to deal ${weaponAttack} damage to ${monster.name}!`
          )
        }

        if (battleState.monsterHP <= 0) {
          collector.stop('victory')
          return
        }

        battleState.turn = 'monster'
        await btnInteraction.update({ embeds: [generateBattleEmbed()] })
        await monsterTurn()
      })

      collector.on('end', async (collected, reason) => {
        const resultEmbed = new EmbedBuilder().setTitle('Battle Result')

        if (reason === 'victory') {
          resultEmbed
            .setDescription(`🎉 You defeated ${monster.name}!`)
            .setColor('Green')
          await player.increment('war_points', { by: 10 })
        } else if (reason === 'defeat') {
          resultEmbed
            .setDescription(`💔 You were defeated by ${monster.name}.`)
            .setColor('Red')
        } else {
          resultEmbed
            .setDescription('⏳ The battle ended due to inactivity.')
            .setColor('Grey')
        }

        await interaction.editReply({ embeds: [resultEmbed], components: [] })
      })
    }
  },
}
