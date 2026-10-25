const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, escapeMarkdown } = require('discord.js')
const questions = {
  1: 'Rate your latest session, 5 being the best.',
  2: 'Rate the story, 5 being the best.',
  3: 'Rate the quests, 5 being the best.',
  4: 'Are you prepared for the session?',
  5: 'Did you participate in the server chat regularly since your last session? (2+ messages a week)',
  6: 'If no, how have you remained active in the server the last two weeks?',
  7: 'Do you have any additional feedback?',
  8: "What is this week's code?",
}
const quiet = { allowedMentions: { parse: [] } }
const button = (record, action, label, style = ButtonStyle.Secondary) => new ButtonBuilder()
  .setCustomId(`ci:${record.id}:${record.revision}:${action}`).setLabel(label).setStyle(style)
const row = (...buttons) => new ActionRowBuilder().addComponents(...buttons)
const label = record => record.isTest ? 'TEST CHECK-IN' : 'CHECK-IN'
function reminder(record) {
  return { ...quiet, content: `${record.name}\nThis is your reminder to check in for the next game. After you complete this weeks to-dos, reach out to the DM for this week’s code. Use the /check-in command in #chat-in-hell to begin your check in.`, components: [] }
}
function invitation(record) {
  return { ...quiet, content: `${label(record)} — ${record.name}${record.isTest ? '\nOwner-only development test. No game rewards or real attendance records.' : ''}`,
    components: [row(button(record, 'begin', 'Begin Check-In', ButtonStyle.Primary), button(record, 'absence', 'Absence'))].map(x => x.toJSON()) }
}
function prompt(record) {
  const q = record.question
  let choices
  if (q <= 3) choices = [row(...[1, 2, 3, 4, 5].map(n => button(record, `answer-${n}`, String(n))))]
  else if (q <= 5) choices = [row(button(record, 'answer-Yes', 'Yes', ButtonStyle.Success), button(record, 'answer-No', 'No', ButtonStyle.Danger))]
  else choices = [row(button(record, 'text', 'Enter answer', ButtonStyle.Primary), ...(q === 7 ? [button(record, 'skip', 'Skip')] : []))]
  return { ...quiet, content: `${label(record)} — ${record.name}\nQuestion ${q + 1} of 9: ${questions[q]}`,
    components: choices.map(x => x.toJSON()) }
}
function snapshot(record) {
  const clean = value => escapeMarkdown(String(value)).slice(0, 900)
  const embed = new EmbedBuilder().setColor(0x5865f2).setTitle(`${label(record)} — ${record.type === 'ABSENCE' ? 'Absence' : 'Submission'}`)
    .setDescription(`${clean(record.displayName)} (${record.owner})\nCampaign: ${clean(record.name)}\n${record.openDate ? `Check-in window: ${record.openDate} through ${record.lastDate} (Pacific)` : 'Session date: Not configured (development test)'}`)
    .addFields({ name: 'Joined server', value: record.joinedAt ? new Date(record.joinedAt).toISOString() : 'Unavailable', inline: true },
      { name: 'Submitted', value: new Date(record.submittedAt).toISOString(), inline: true },
      { name: 'Time to complete', value: `${Math.max(0, Math.round((record.submittedAt - record.startedAt) / 1000))} seconds`, inline: true })
  if (record.avatar) embed.setThumbnail(record.avatar)
  if (record.lateReminderExtension) embed.addFields({ name: 'Extended check-in deadline', value:
    `${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(record.closesAt - 60000))} Pacific` })
  if (record.type === 'ABSENCE') embed.addFields({ name: 'Absence explanation', value: clean(record.explanation) })
  else {
    embed.addFields({ name: '1. What session are you checking in for?', value: clean(record.name) })
    for (let q = 1; q <= 8; q++) embed.addFields({ name: `${q + 1}. ${questions[q]}`, value: clean(record.answers[q] ?? '-') })
  }
  embed.setFooter({ text: `${record.isTest ? 'Test' : 'Check-in'} ${record.id} • No weekly-code validation configured` })
  return embed.toJSON()
}
function review(record) {
  const actions = ['accept', 'deny', 'accept-reason', 'deny-reason']
  const names = ['Accept', 'Deny', 'Accept with Reason', 'Deny with Reason']
  const styles = [ButtonStyle.Success, ButtonStyle.Danger, ButtonStyle.Primary, ButtonStyle.Secondary]
  return { ...quiet, embeds: [record.snapshot], components: [row(...actions.map((action, i) => button(record, action, names[i], styles[i])))].map(x => x.toJSON()) }
}
function decision(record) {
  return { ...quiet, content: `${label(record)} — ${record.name}\n${record.status === 'ACCEPTED' ? 'Accepted' : 'Denied'} by ${record.reviewer}.${record.reason ? `\nReason: ${escapeMarkdown(record.reason)}` : ''}`,
    embeds: [record.snapshot], components: [] }
}
module.exports = { questions, quiet, invitation, prompt, snapshot, review, decision, reminder, label }
