const { SlashCommandBuilder } = require('discord.js')
const config = require('../../config/winter/snowball-fight.json')
const data = new SlashCommandBuilder().setName('snowball-fight').setDescription('Collect, throw, and earn Classic character badges.').setDMPermission(false)
for (const [name, description] of [
  ['start', 'Join Snowball Fight or reopen your profile.'], ['collect', 'Collect two snowballs.'],
  ['stats', 'View your resources and combat statistics.'], ['daily', 'Claim your daily snowballs and Buttons.'],
  ['quests', 'View today’s three quests.'], ['claim', 'Claim completed daily quest rewards.'],
  ['shop', 'Browse and buy ammunition, cocoa and cosmetics.'], ['collection', 'View Classic badges and unlock progress.'],
  ['achievements', 'View achievements and progress.'], ['news', 'Read the latest event information.'], ['help', 'Learn how to play.']
]) data.addSubcommand(option => option.setName(name).setDescription(description))
data.addSubcommand(option => option.setName('throw').setDescription('Throw a snowball at another participating member.')
  .addUserOption(o => o.setName('target').setDescription('An enrolled member; they may be offline.').setRequired(true)))
data.addSubcommand(option => option.setName('gift').setDescription('Gift snowballs to another participating member.')
  .addUserOption(o => o.setName('target').setDescription('The recipient.').setRequired(true))
  .addIntegerOption(o => o.setName('amount').setDescription('Snowballs to send.').setMinValue(1).setMaxValue(config.collection.capacity).setRequired(true)))
data.addSubcommand(option => option.setName('fight').setDescription('Start or resume a character encounter.')
  .addStringOption(o => o.setName('character').setDescription('Choose an opponent, or omit to resume.').addChoices(...config.characters.filter(c => c.enabled).map(c => ({ name: c.name, value: c.id })))))
data.addSubcommand(option => option.setName('choose').setDescription('Equip an unlocked Classic badge.')
  .addStringOption(o => o.setName('character').setDescription('An earned character badge.').setRequired(true).addChoices(...config.characters.map(c => ({ name: c.name, value: c.id })))))
data.addSubcommand(option => option.setName('item-info').setDescription('Inspect a shop item and your ownership.')
  .addStringOption(o => o.setName('item').setDescription('Item to inspect.').setRequired(true).addChoices(...config.items.map(c => ({ name: c.name, value: c.id })))))
data.addSubcommand(option => option.setName('leaderboard').setDescription('View this server’s rankings.')
  .addStringOption(o => o.setName('metric').setDescription('Ranking.').addChoices(...['hits', 'accuracy', 'wins', 'badges'].map(value => ({ name: value, value }))))
  .addIntegerOption(o => o.setName('page').setDescription('Page number.').setMinValue(1).setMaxValue(10000)))
module.exports = { data, environments: ['development'], execute: interaction => require('../../services/winter/snowball-fight/runtime').handle(interaction) }
