const { SlashCommandBuilder, EmbedBuilder } = require('discord.js')
const { Achievement, PlayerAchievement, User } = require('../../Models/model')


module.exports = {
  data: new SlashCommandBuilder()
    .setName('award')
    .setDescription('Award an achievement to a player')
    .addUserOption((option) =>
      option
        .setName('player')
        .setDescription('The player to award the achievement to')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('achievement')
        .setDescription('The achievement to award')
        .setRequired(true)
    ),

  async execute(interaction) {
    const player = interaction.options.getUser('player')
    const achievementName = interaction.options.getString('achievement')

    try {
      // Find or create the player and achievement
      const playerData = await UserfindOne({ where: { user_id: user_id } })
      const achievement = await Achievement.findOne({
        where: { name: achievementName },
      })

      if (!playerData || !achievement) {
        return interaction.reply('Player or achievement not found.')
      }

      // Check if the player already has the achievement
      const existingAward = await PlayerAchievement.findOne({
        where: {
          playerId: playerData.id,
          achievementId: achievement.id,
        },
      })

      if (existingAward) {
        return interaction.reply('Player already has this achievement.')
      }

      // Award the achievement
      await PlayerAchievement.create({
        playerId: playerData.id,
        achievementId: achievement.id,
      })

      return interaction.reply(
        `Achievement **${achievement.name}** awarded to ${Userusername}!`
      )
    } catch (error) {
      console.error(error)
      return interaction.reply('There was an error awarding the achievement.')
    }
  },
}
