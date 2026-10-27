const { fixture } = require('./fixture')
const liveConfig = require('../../config/checkins/checkins.json')
function productionFixture(store) {
  const f = fixture(store)
  f.setOwner('server-owner')
  f.config.production = { liveEnabled: true, scheduledEnabled: true, guildId: 'prod', commandChannelId: 'chat',
    reviewGuildId: 'prod', reviewChannelId: 'review', playerRoleIds: { monday: 'monday-role', wednesday: 'wednesday-role' },
    reviewerUserIds: ['reviewer'], reviewerRoleIds: [] }
  f.config.campaigns = structuredClone(liveConfig.campaigns)
  f.config.schedule = structuredClone(liveConfig.schedule)
  f.channel.guildId = 'prod'
  f.member.roles.cache.set('monday-role', {})
  f.guild.members.list = async () => new Map([['owner', f.member]])
  f.setEnv('production')
  f.setNow(Date.parse('2026-11-02T20:00:00Z'))
  f.command = extra => f.controller.checkIn(f.interaction({ guildId: 'prod', channelId: 'chat', options: { getString: () => 'monday' }, ...extra }))
  f.record = async () => (await f.store.list()).at(-1)
  f.scheduler = require('../../services/checkins/scheduling/scheduler').createScheduler({ store: f.store,
    config: () => f.config, environment: () => 'production', clock: () => f.now })
  const setNow = f.setNow
  f.now = Date.parse('2026-11-02T20:00:00Z')
  f.setNow = value => { f.now = value; setNow(value) }
  return f
}
module.exports = { productionFixture }
