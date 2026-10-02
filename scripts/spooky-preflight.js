// Offline only: construct command definitions without importing the bot/runtime.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { tokenImage, preparePayload } = require('../services/spooky/token-art')
const {
  config,
  pieces,
  requireApprovedRarity,
  getEventState,
} = require('../services/spooky/config')
const { spookyCommand } = require('../services/spooky/command-definition')
const { adminCommand } = require('../services/spooky/admin-command')
const reminders = require('../config/spooky-reminders.json')
const winners = require('../config/spooky-winners.json')
const badgeAccess = require('../config/badge-access.json')

function preflight(args = []) {
  if (args.length)
    throw new Error(
      'Offline preflight accepts no arguments or target overrides',
    )
  requireApprovedRarity()
  require('../services/badge-access').validateSettings(badgeAccess)
  assert.equal(pieces.length, 28)
  assert.equal(new Set(pieces.map((piece) => piece.id)).size, 28)
  assert.equal(getEventState(Date.parse(config.startsAt)), 'ACTIVE')
  assert.equal(getEventState(Date.parse(config.endsAt)), 'CLOSED')
  let tokenImages = 0
  for (const id of new Set(pieces.map((piece) => piece.characterId)))
    for (let mask = 1; mask <= 15; mask++) {
      const name = tokenImage(
        id,
        ['tl', 'tr', 'bl', 'br'].filter((_, bit) => mask & (1 << bit)),
      )
      fs.accessSync(
        preparePayload({ files: [{ tokenAsset: name, name }] }).files[0]
          .attachment,
        fs.constants.R_OK,
      )
      tokenImages++
    }
  const controller = {
    execute() {
      throw new Error('Preflight cannot execute interactions')
    },
  }
  const commands = [spookyCommand(controller), adminCommand(controller)].map(
    (command) => command.data.toJSON(),
  )
  assert.equal(new Set(commands.map((command) => command.name)).size, 2)
  const expected = [7, 4]
  commands.forEach((command, index) => {
    assert.equal(command.options.length, expected[index])
    assert.equal(
      new Set(command.options.map((option) => option.name)).size,
      expected[index],
    )
    for (const option of command.options)
      assert.match(option.name, /^[a-z0-9-]{1,32}$/)
  })
  assert.ok(commands[0].options.some((option) => option.name === 'help'))
  const badgeCommand = require('../commands/Achievements/Badges').data.toJSON()
  assert.deepEqual(
    badgeCommand.options.map((option) => option.name),
    ['view', 'leaderboard'],
  )
  const gates = [
    'Published balance results are historical; version 8 needs measurement before public launch.',
    'Six badge artworks/emoji names remain pending; Selene is configured and generic medals represent other earned badges.',
    'Offline full registry review passed (see command-registry-audit-results.json); compare live server-only commands before any bulk registration.',
    'Development storage/registration/startup completed; human interaction and recovery acceptance remain open (see live-session guide).',
  ]
  if (!config.enabled) gates.push('Gameplay is disabled in this environment; development uses its explicit override.')
  if (
    !badgeAccess.enabled ||
    Object.values(badgeAccess.roles).some((id) => !id)
  )
    gates.push(
      'Badge emoji access is disabled or partially configured; dedicated cosmetic roles and explicit emoji restriction setup are pending.',
    )
  if (
    !reminders.enabled ||
    !reminders.channelId ||
    !reminders.roleIds.length ||
    !reminders.localTime
  )
    gates.push(
      'Reminder activation/channel/Resident roles/Pacific time are pending.',
    )
  if (
    !winners.enabled ||
    !winners.channelId ||
    (winners.mode === 'overall' ? !winners.overall?.roleId || !winners.announcementAt :
      !winners.treat.name || !winners.treat.roleId || !winners.trick.name || !winners.trick.roleId)
  )
    gates.push(
      'Winner activation, Scream Supreme role, November announcement time and channel are pending.',
    )
  return {
    scope: 'offline Spooky definitions/configuration only',
    configVersion: config.version,
    databaseOpened: false,
    discordContacted: false,
    environmentCredentialsRead: false,
    checksPassed: true,
    liveAcceptanceComplete: false,
    pieces: pieces.length,
    rarityCounts: Object.fromEntries(['common', 'rare', 'legendary'].map(rarity => [rarity, pieces.filter(piece => piece.rarity === rarity).length])),
    characterRarities: Object.fromEntries([...new Set(pieces.map(piece => piece.characterId))].map(id => [id, pieces.filter(piece => piece.characterId === id).map(piece => piece.rarity)])),
    tokenImages,
    fullCircleImages: 7,
    commands: commands.map((command) => ({
      name: command.name,
      subcommands: command.options.map((option) => option.name),
    })),
    permanentBadgeCommand: {
      name: badgeCommand.name,
      subcommands: badgeCommand.options.map((option) => option.name),
    },
    gates,
  }
}
if (require.main === module) {
  try {
    process.stdout.write(
      `${JSON.stringify(preflight(process.argv.slice(2)), null, 2)}\n`,
    )
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
module.exports = { preflight }
