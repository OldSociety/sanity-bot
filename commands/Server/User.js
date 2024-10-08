const { SlashCommandBuilder, EmbedBuilder } = require('discord.js')
const { User } = require('../../Models/model.js')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('user')
    .setDescription('Provides information about the user.'),
  async execute(interaction) {
    const userId = interaction.user.id
    // interaction.user is the object representing the User who ran the command

    // Fetch or create user data
    let userData = await User.findOne({ where: { user_id: userId } })
    if (!userData) {
      userData = await User.create({
        user_id: userId,
        user_name: interaction.user.username,
        chat_exp: 0,
        chat_level: 1,
        bank: 0,
        fate_points: 0,
        last_chat_message: new Date(),
      })
    }

    const UserEmbed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle(`${interaction.user.username}`)
      .setDescription(`**level ${userData.chat_level}**`)
	  .addFields({name: ' ', value: `This command was run by ${interaction.user.username}, who joined on ${interaction.member.joinedAt}.`})
      .setTimestamp()

    await await interaction.reply({ embeds: [UserEmbed] })
  },
}
