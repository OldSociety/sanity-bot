// Targeted development-only registration; never bulk replace the guild registry.
const fs = require('node:fs')
const path = require('node:path')
const { REST, Routes } = require('discord.js')
const { matches } = require('../../deploy-commands')

async function main(args = process.argv.slice(2)) {
  if (args.length !== 1 || !['--plan', '--apply'].includes(args[0]))
    throw new Error('Use --plan or --apply.')
  if (process.env.NODE_ENV !== 'development')
    throw new Error('Arena registration requires NODE_ENV=development.')
  const runtime =
    require('../../config/runtime/runtime').loadDiscordEnvironment(
      'development',
    )
  const desired = require('../../commands/Arena/Arena').data.toJSON()
  const rest = new REST().setToken(process.env.TOKEN)
  const route = Routes.applicationGuildCommands(
    runtime.clientId,
    runtime.guildId,
  )
  const before = await rest.get(route)
  const existing = before.find(
    (command) => command.name === desired.name && command.type === 1,
  )
  console.log(
    JSON.stringify({
      environment: runtime.env,
      guildId: runtime.guildId,
      command: desired,
      action: existing ? 'Update arena only' : 'Add arena only',
      preservedCommands: before
        .filter((command) => command.id !== existing?.id)
        .map((command) => command.name),
    }),
  )
  if (args[0] === '--plan') return
  const directory = path.join(runtime.root, 'artifacts', 'command-registry')
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(
    path.join(directory, `arena-development-before-${Date.now()}.json`),
    JSON.stringify(
      {
        guildId: runtime.guildId,
        clientId: runtime.clientId,
        commands: before,
      },
      null,
      2,
    ),
    { flag: 'wx' },
  )
  if (existing)
    await rest.patch(
      Routes.applicationGuildCommand(
        runtime.clientId,
        runtime.guildId,
        existing.id,
      ),
      { body: desired },
    )
  else await rest.post(route, { body: desired })
  const after = await rest.get(route)
  const arena = after.find(
    (command) => command.name === desired.name && command.type === 1,
  )
  if (!matches(arena, desired))
    throw new Error(
      'Registered arena definition did not match. Inspect the saved registry snapshot.',
    )
  const others = (commands) =>
    commands
      .filter((command) => command.id !== arena.id)
      .sort((a, b) => a.id.localeCompare(b.id))
  if (JSON.stringify(others(before)) !== JSON.stringify(others(after)))
    throw new Error(
      'Other registry entries changed during registration. Inspect the saved snapshot.',
    )
  console.log(
    `Verified /arena; ${
      others(after).length
    } other development commands unchanged.`,
  )
}

if (require.main === module)
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
module.exports = { main }
