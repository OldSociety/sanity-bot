// handlers/reportHandler.js

const { ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js')
const modChannelId = process.env.MODERATORCHANNELID
const supportCategoryId = process.env.SUPPORTCATID
const adminRoleIds = [
  process.env.ADMINROLEID,
  process.env.SMASTERROLEID,
  process.env.MODERATORROLEID,
]

module.exports = (client) => {
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isModalSubmit()) return

    if (interaction.customId === 'anonymousReport') {
      const reportInfo = interaction.fields.getTextInputValue('reportInfo')
      const reportLinks = interaction.fields.getTextInputValue('reportLinks') || 'No links provided'
      const reportVisibility = interaction.fields.getTextInputValue('reportVisibility').trim()

      const reportEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('Anonymous Report')
        .addFields(
          { name: 'Information', value: reportInfo },
          { name: 'Links', value: reportLinks },
          { name: 'Reported By', value: reportVisibility ? `<@${interaction.user.id}>` : 'Anonymous' }
        )
        .setTimestamp()

      const guild = interaction.guild

      if (reportVisibility) {
        const randomNum = Math.floor(1000 + Math.random() * 9000)
        const channelName = `${interaction.user.username}-report-${randomNum}`
        const category = guild.channels.cache.get(supportCategoryId)

        const reportChannel = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          topic: 'Anonymous report channel',
          parent: category || null,
          permissionOverwrites: [
            {
              id: interaction.user.id,
              allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
            },
            ...adminRoleIds.map(roleId => ({
              id: roleId,
              allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
            })),
            {
              id: guild.roles.everyone.id,
              deny: [PermissionsBitField.Flags.ViewChannel],
            },
          ],
        })

        const actionRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('claim_ticket')
            .setLabel('Claim Ticket')
            .setStyle(ButtonStyle.Primary)
        )

        await reportChannel.send({
          content: `Thank you for taking the time to file this report. A moderator @here will join you shortly to address the matter.`,
          components: [actionRow],
        })

        await reportChannel.send({ embeds: [reportEmbed] })
        await interaction.reply({ content: 'Your report has been sent to the staff in a private channel.', ephemeral: true })
      } else {
        const modChannel = client.channels.cache.get(modChannelId)
        if (modChannel) {
          await modChannel.send({ embeds: [reportEmbed] })
          await interaction.reply({ content: 'Your anonymous report has been submitted to the staff.', ephemeral: true })
        } else {
          console.error('Moderator channel not found.')
          await interaction.reply({ content: 'An error occurred while submitting your report.', ephemeral: true })
        }
      }
    }
  })

  client.on('interactionCreate', async (buttonInteraction) => {
    if (!buttonInteraction.isButton()) return
    const channel = buttonInteraction.channel
    const adminChannel = client.channels.cache.get(modChannelId)

    // Check if the user has any of the admin roles
    const isAdmin = adminRoleIds.some(roleId => buttonInteraction.member.roles.cache.has(roleId))
    if (!isAdmin) {
      await buttonInteraction.reply({ content: 'Only admins can interact with this button.', ephemeral: true })
      return
    }

    if (buttonInteraction.customId === 'claim_ticket') {
      await buttonInteraction.reply({ content: `This ticket has been claimed by ${buttonInteraction.user.tag}.`, ephemeral: true })
      await channel.send(`<@${buttonInteraction.user.id}> has claimed this ticket.`)

      const closeActionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Close Ticket')
          .setStyle(ButtonStyle.Secondary)
      )
      await buttonInteraction.message.edit({ components: [closeActionRow] })
    }

    if (buttonInteraction.customId === 'close_ticket') {
      await buttonInteraction.reply({ content: `The ticket is being closed by ${buttonInteraction.user.tag}.`, ephemeral: true })
      await channel.send(`🔒 Ticket closed by <@${buttonInteraction.user.id}>.`)

      await channel.permissionOverwrites.edit(buttonInteraction.guild.roles.everyone, { ViewChannel: false })

      const ticketClosedEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('🔒 Ticket Closed')
        .addFields(
          { name: '🆔', value: channel.name, inline: true },
          { name: '✅Opened By', value: `<@${buttonInteraction.user.id}>`, inline: true },
          { name: '❌Closed By', value: `<@${buttonInteraction.user.id}>`, inline: true },
          { name: '⏱️Open Time', value: `<t:${Math.floor(channel.createdTimestamp / 1000)}:F>`, inline: true },
          { name: '#️⃣ Ticket Name', value: channel.name, inline: true },
          { name: '🙋‍♂️ Claimed By', value: buttonInteraction.user.tag, inline: true },
        )
        .setTimestamp()

      await adminChannel.send({ embeds: [ticketClosedEmbed] })

      const deleteActionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('delete_ticket')
          .setLabel('Delete Ticket')
          .setStyle(ButtonStyle.Danger)
      )
      await buttonInteraction.message.edit({ components: [deleteActionRow] })
    }

    if (buttonInteraction.customId === 'delete_ticket') {
      await buttonInteraction.reply({ content: `This ticket is being deleted by ${buttonInteraction.user.tag}.`, ephemeral: true })
      await channel.delete()
    }
  })
}
