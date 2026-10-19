// Target only old arena controls in development test channels, never registries.
const { REST, Routes } = require('discord.js')
async function main(args = process.argv.slice(2)) {
  if (args.length !== 1 || !['--plan', '--apply'].includes(args[0]))
    throw Error('Use --plan or --apply')
  if (process.env.NODE_ENV !== 'development') throw Error('Development only')
  const runtime =
    require('../../config/runtime/runtime').loadDiscordEnvironment(
      'development',
    )
  const rest = new REST().setToken(process.env.TOKEN)
  const me = await rest.get(Routes.user('@me'))
  const channels = await rest.get(Routes.guildChannels(runtime.guildId))
  const selected = channels.filter(
    (channel) =>
      [0, 5].includes(channel.type) &&
      /bot.*test|test.*bot|arena/i.test(channel.name),
  )
  const found = []
  for (const channel of selected) {
    let before
    while (true) {
      const query = new URLSearchParams({
        limit: '100',
        ...(before ? { before } : {}),
      })
      const messages = await rest.get(Routes.channelMessages(channel.id), {
        query,
      })
      for (const message of messages) {
        const controls =
          message.components?.flatMap((row) => row.components || []) || []
        if (
          message.author?.id === me.id &&
          controls.some((item) => item.custom_id?.startsWith('arena:'))
        )
          found.push({ channelId: channel.id, messageId: message.id })
      }
      if (messages.length < 100) break
      const oldest = messages.at(-1)
      if (Date.parse(oldest.timestamp) < Date.UTC(2026, 9, 15)) break
      before = oldest.id
    }
  }
  console.log(
    JSON.stringify({
      environment: 'development',
      channels: selected.map((channel) => channel.name),
      oldArenaMessages: found.length,
      action: args[0],
    }),
  )
  if (args[0] === '--apply') {
    for (const row of found)
      await rest.patch(Routes.channelMessage(row.channelId, row.messageId), {
        body: { components: [], allowed_mentions: { parse: [] } },
      })
    console.log(
      `Removed arena controls from ${found.length} development messages.`,
    )
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
module.exports = { main }
