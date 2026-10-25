const path = require('node:path')
const { EmbedBuilder, AttachmentBuilder } = require('discord.js')
const draft = require('../config/commands/achievement-preview.json')

const states = {
  locked: {
    title: 'You have not unlocked this achievement yet!',
    description: 'Complete these example tasks to unlock the achievement.',
    icon: 'locked.png',
  },
  progress: {
    title: 'Continue Where You Left Off',
    description: 'A preview of an achievement in progress.',
    icon: 'locked.png',
  },
  unlocked: {
    title: 'Achievement Unlocked!',
    description: 'All example tasks are complete.',
    icon: 'unlocked.png',
  },
}
const pieces = ['PB1C', 'PB1E', 'PB2C', 'PB2E', 'PB3F', 'PB3E']
const layouts = {
  empty: ['PB1E', 'PB2E', 'PB2E', 'PB3E'],
  half: ['PB1C', 'PB2C', 'PB2E', 'PB3E'],
  full: ['PB1C', 'PB2C', 'PB2C', 'PB3F'],
}

async function achievementPreview(client, state = 'progress') {
  const view = states[state]
  if (!view) throw Error('Unknown achievement preview state')
  const source = await client.guilds.fetch(draft.emojiSourceGuildId)
  const available = await source.emojis.fetch()
  const emojis = Object.fromEntries(pieces.map(name => [name,
    available.find(item => item.name === name && item.available !== false),
  ]))
  const missing = pieces.filter(name => !emojis[name])
  if (missing.length) throw Error(`Missing progress bar emojis: ${missing.join(', ')}`)
  const bar = fill => layouts[fill].map(name => {
    const emoji = emojis[name]
    return `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`
  }).join('')
  const rows = draft.tasks.map(task => {
    const value = state === 'unlocked' ? task.target
      : state === 'locked' ? 0 : task.sampleProgress
    const fill = value >= task.target ? 'full' : value > 0 ? 'half' : 'empty'
    return `\`${value} / ${task.target}\` ${bar(fill)} ${task.label}`
  })
  const filename = `achievement-${view.icon}`
  return {
    embeds: [new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(view.title)
      .setDescription(view.description)
      .setThumbnail(`attachment://${filename}`)
      .addFields({ name: draft.achievementName, value: rows.join('\n') })
      .setFooter({ text: 'Achievement preview • Sample progress only • Nothing is tracked' })],
    files: [new AttachmentBuilder(
      path.join(__dirname, '../assets/achievements/preview', view.icon),
      { name: filename },
    )],
    allowedMentions: { parse: [] },
  }
}

module.exports = { achievementPreview }
