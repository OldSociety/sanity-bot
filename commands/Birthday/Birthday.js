const { SlashCommandBuilder } = require('discord.js');
const { User } = require('../../Models/model'); // Adjust path as needed

module.exports = {
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName('birthday')
    .setDescription('Check, set, or update birthdays')
    .addSubcommand(subcommand =>
      subcommand
        .setName('check')
        .setDescription("Check a user's birthday")
        .addUserOption(option =>
          option
            .setName('target')
            .setDescription('The user to check. Defaults to you if not provided.')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remember')
        .setDescription("Save your birthday")
        .addIntegerOption(option =>
          option
            .setName('day')
            .setDescription('Day of your birthday (1-31)')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName('month')
            .setDescription('Month of your birthday (1-12)')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName('year')
            .setDescription('Year of your birthday (e.g. 1990)')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('update')
        .setDescription("Update your birthday")
        .addIntegerOption(option =>
          option
            .setName('day')
            .setDescription('New day of your birthday (1-31)')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName('month')
            .setDescription('New month of your birthday (1-12)')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName('year')
            .setDescription('New year of your birthday (e.g. 1990)')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Helper: Calculate the next birthday and days remaining based on day and month.
      const calculateNextBirthday = (day, month) => {
        const birthdayThisYear = new Date(today.getFullYear(), month - 1, day);
        const nextBirthday = birthdayThisYear < today
          ? new Date(today.getFullYear() + 1, month - 1, day)
          : birthdayThisYear;
        const diffDays = Math.ceil((nextBirthday - today) / (1000 * 60 * 60 * 24));
        return { nextBirthday, diffDays };
      };

      // Helper: Validate day, month, year.
      const validateDate = (day, month, year) => {
        if (day < 1 || day > 31) return 'Invalid day. Please enter a number between 1 and 31.';
        if (month < 1 || month > 12) return 'Invalid month. Please enter a number between 1 and 12.';
        if (String(day).length > 2) return 'Day should be 1 or 2 digits.';
        if (String(month).length > 2) return 'Month should be 1 or 2 digits.';
        if (String(year).length !== 4) return 'Year should be a 4-digit number.';
        const currentYear = today.getFullYear();
        if (year < currentYear - 80 || year > currentYear) {
          return `Year should be within the last 80 years (between ${currentYear - 80} and ${currentYear}).`;
        }
        const birthdayTest = new Date(year, month - 1, day);
        if (
          birthdayTest.getDate() !== day ||
          birthdayTest.getMonth() !== month - 1 ||
          birthdayTest.getFullYear() !== year
        ) {
          return 'The provided date is invalid. Please check day, month, and year.';
        }
        return null;
      };

      if (subcommand === 'check') {
        const target = interaction.options.getUser('target') || interaction.user;
        const userRecord = await User.findOne({ where: { user_id: target.id } });
        if (!userRecord || !userRecord.birthday) {
          return interaction.reply(
            `No birthday found for **${target.username}**. Use \`/birthday remember\` to add one.`
          );
        }
        const storedBirthday = new Date(userRecord.birthday);
        const day = storedBirthday.getDate();
        const month = storedBirthday.getMonth() + 1;
        const { nextBirthday, diffDays } = calculateNextBirthday(day, month);
        const formattedDate = nextBirthday.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
        if (diffDays === 0) {
          return interaction.reply(`Happy Birthday to **${target.username}** 🎂!`);
        } else {
          return interaction.reply(
            `**${target.username}**'s birthday is in **${diffDays}** days on **${formattedDate}** :candle:`
          );
        }
      } else if (subcommand === 'remember') {
        const day = interaction.options.getInteger('day');
        const month = interaction.options.getInteger('month');
        const year = interaction.options.getInteger('year');
        const errorMessage = validateDate(day, month, year);
        if (errorMessage) return interaction.reply(errorMessage);

        const discordId = interaction.user.id;
        const discordUserName = interaction.user.username;
        const birthdayDate = new Date(year, month - 1, day);
        console.log(`[DEBUG] Saving birthday for ${discordUserName} (${discordId}):`, birthdayDate);

        let userRecord = await User.findOne({ where: { user_id: discordId } });
        if (userRecord) {
          userRecord.birthday = birthdayDate;
          await userRecord.save();
          console.log(`[DEBUG] Updated existing record for ${discordUserName}`);
        } else {
          userRecord = await User.create({
            user_id: discordId,
            user_name: discordUserName,
            birthday: birthdayDate,
          });
          console.log(`[DEBUG] Created new record for ${discordUserName}`);
        }
        const { nextBirthday, diffDays } = calculateNextBirthday(day, month);
        const formattedDate = nextBirthday.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
        return interaction.reply(
          `Duly noted, I'll wish **${discordUserName}**'s next birthday in **${diffDays}** days, on **${formattedDate}** :candle:`
        );
      } else if (subcommand === 'update') {
        const day = interaction.options.getInteger('day');
        const month = interaction.options.getInteger('month');
        const year = interaction.options.getInteger('year');
        const errorMessage = validateDate(day, month, year);
        if (errorMessage) return interaction.reply(errorMessage);

        const discordId = interaction.user.id;
        const discordUserName = interaction.user.username;
        const birthdayDate = new Date(year, month - 1, day);
        console.log(`[DEBUG] Updating birthday for ${discordUserName} (${discordId}):`, birthdayDate);

        const userRecord = await User.findOne({ where: { user_id: discordId } });
        if (!userRecord) {
          return interaction.reply(
            `No birthday record found for **${discordUserName}**. Use \`/birthday remember\` to create one first.`
          );
        }
        userRecord.birthday = birthdayDate;
        await userRecord.save();
        console.log(`[DEBUG] Updated birthday record for ${discordUserName}`);
        const { nextBirthday, diffDays } = calculateNextBirthday(day, month);
        const formattedDate = nextBirthday.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
        return interaction.reply(
          `Birthday for **${discordUserName}** has been updated. Next birthday is in **${diffDays}** days on **${formattedDate}** :candle:`
        );
      }
    } catch (error) {
      console.error('Error in /birthday command:', error);
      return interaction.reply('Something went wrong while processing the birthday command.');
    }
  },
};
