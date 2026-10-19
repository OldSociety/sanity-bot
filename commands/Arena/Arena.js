const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  environments: ["development", "production"],
  data: new SlashCommandBuilder()
    .setName("arena")
    .setDescription("Choose a character and test turn-based combat.")
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName("access")
        .setDescription(
          "Server owner: unlock or lock production Arena testing."
        )
        .addChoices(
          { name: "Unlock", value: "unlock" },
          { name: "Lock", value: "lock" },
          { name: "Status", value: "status" }
        )
    ),
  async execute(interaction) {
    const { access } = require("../../services/arena/access");
    const action = interaction.options?.getString?.("access");
    if (action) return access.manage(interaction, action);
    if (!(await access.authorize(interaction))) return;
    return require("../../services/arena/controller").arena.execute(
      interaction,
      undefined,
      { selection: true }
    );
  },
};
