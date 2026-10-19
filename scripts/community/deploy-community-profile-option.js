const fs = require('node:fs')
const path = require('node:path')
const { createHash, randomUUID } = require('node:crypto')

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
async function run(args = process.argv.slice(2)) {
  if (
    !(args.length === 1 && args[0] === '--plan') &&
    !(
      args.length === 2 &&
      args[0] === '--apply' &&
      /^[a-f0-9]{64}$/.test(args[1])
    )
  )
    throw new Error(
      'Usage: node scripts/deploy-community-profile-option.js --plan | --apply <reviewed SHA-256>',
    )
  const runtime =
    require('../../config/runtime/runtime').loadDiscordEnvironment()
  if (runtime.env !== 'development')
    throw new Error('Community profile option deploy is development-only')
  const { REST, Routes } = require('discord.js')
  const rest = new REST().setToken(process.env.TOKEN),
    route = Routes.applicationGuildCommands(runtime.clientId, runtime.guildId)
  const definition = require('../../commands/Server/Profile').data.toJSON()
  const community = definition.options?.find(
    (option) => option.name === 'community' && option.type === 5,
  )
  if (
    !community ||
    definition.options.filter((option) => option.name !== 'community')
      .length !== 1 ||
    definition.options.find((option) => option.name === 'player')?.type !== 6
  )
    throw new Error('Unexpected local /profile definition')
  const live = await rest.get(route),
    current = live.find(
      (command) => command.name === 'profile' && command.type === 1,
    )
  if (
    !current ||
    !current.id ||
    current.description !== definition.description ||
    current.options?.length !== 1 ||
    current.options[0].name !== 'player' ||
    current.options[0].type !== 6 ||
    current.options[0].description !==
      definition.options.find((option) => option.name === 'player').description
  )
    throw new Error(
      'Live development /profile differs from the reviewed player-only definition',
    )
  const snapshot = {
    environment: runtime.env,
    guildId: runtime.guildId,
    clientId: runtime.clientId,
    commandId: current.id,
    current: {
      name: current.name,
      description: current.description,
      options: current.options,
    },
    desired: definition,
    registry: live
      .map(({ id, name, type, version }) => ({ id, name, type, version }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
  const hash = digest(snapshot)
  const pathToSnapshot = path.join(
    __dirname,
    '..',
    'artifacts',
    'command-registry',
    `community-profile-${Date.now()}-${randomUUID()}.json`,
  )
  fs.mkdirSync(path.dirname(pathToSnapshot), { recursive: true })
  fs.writeFileSync(pathToSnapshot, `${JSON.stringify(snapshot, null, 2)}\n`, {
    flag: 'wx',
  })
  console.log(`Development guild: ${runtime.guildId}`)
  console.log(
    `Targeted update: /profile only (${current.id}); add optional boolean community; preserve player option`,
  )
  console.log(
    `Other commands preserved by command-specific PUT: ${snapshot.registry
      .filter((command) => command.id !== current.id)
      .map((command) => command.name)
      .join(', ')}`,
  )
  console.log(`Review SHA-256: ${hash}`)
  console.log(`Registry snapshot: ${pathToSnapshot}`)
  if (args[0] === '--plan') return
  if (args[1] !== hash)
    throw new Error(
      'Reviewed /profile plan changed; inspect a new --plan before applying',
    )
  const result = await rest.patch(
    Routes.applicationGuildCommand(
      runtime.clientId,
      runtime.guildId,
      current.id,
    ),
    { body: definition },
  )
  if (
    result.id !== current.id ||
    result.name !== 'profile' ||
    !result.options?.some(
      (option) => option.name === 'community' && option.type === 5,
    )
  )
    throw new Error(
      'Discord accepted an unexpected /profile definition; inspect the registry snapshot',
    )
  const after = await rest.get(route),
    namesBefore = snapshot.registry.filter(
      (command) => command.id !== current.id,
    )
  const namesAfter = after
    .filter((command) => command.id !== current.id)
    .map(({ id, name, type, version }) => ({ id, name, type, version }))
    .sort((a, b) => a.name.localeCompare(b.name))
  if (JSON.stringify(namesBefore) !== JSON.stringify(namesAfter))
    throw new Error(
      'Another development command changed during the targeted /profile update',
    )
  console.log(
    'Updated /profile community option; verified all other development guild commands are unchanged.',
  )
}
if (require.main === module)
  run().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
module.exports = { run, digest }
