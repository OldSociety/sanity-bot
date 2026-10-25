const { reminderOccurrence, reminderSlot } = require('./calendar')
const { reminder } = require('../presentation/messages')
async function roster(guild) {
  const result = [], seen = new Set()
  let after
  while (true) {
    const page = await guild.members.list({ limit: 1000, ...(after ? { after } : {}) })
    if (!page || page.size > 1000) throw Error('Incomplete check-in roster.')
    for (const member of page.values()) {
      if (!member.id || seen.has(member.id)) throw Error('Repeated check-in roster page.')
      seen.add(member.id); result.push(member)
    }
    if (page.size < 1000) return result
    const last = [...page.keys()].at(-1)
    if (!last || last === after) throw Error('Incomplete check-in roster pagination.')
    after = last
  }
}
function createScheduler({ store, config, environment, clock = Date.now }) {
  let running = null
  async function tick(client) {
    const all = config(), c = all.production
    if (environment() !== 'production' || !c?.liveEnabled || !c.scheduledEnabled) return
    if (running) return running
    running = (async () => {
      const now = clock()
      for (const campaign of Object.keys(all.campaigns)) {
        const current = reminderOccurrence(all, campaign, now)
        if (!current) continue
        const roleId = c.playerRoleIds?.[campaign]
        if (!roleId) throw Error('Missing campaign player role.')
        const guild = await client.guilds.fetch(c.guildId)
        if (!await store.occurrence(current.key)) {
          const members = await roster(guild)
          const recipients = members.filter(m => !m.user.bot && m.roles.cache.has(roleId)).map(m => ({
            id: `notice:${current.key}:${m.id}`, owner: m.id, campaign, name: all.campaigns[campaign].name,
            isTest: false, isNotice: true, guildId: c.guildId, playerRoleId: roleId,
            reviewGuildId: c.reviewGuildId, reviewChannelId: c.reviewChannelId,
            commandChannelId: c.commandChannelId, occurrenceKey: current.key, ...current,
          }))
          await store.reserveOccurrence({ ...current, roleId }, recipients)
        }
        for (const recipient of await store.recipients(current.key)) {
          if (await store.completedFor(recipient.owner, current.key)) continue
          const slot = reminderSlot(current, now)
          if (!slot) continue
          if (slot.backup) {
            let member
            try { member = await guild.members.fetch({ user: recipient.owner, force: true }) } catch { continue }
            if (member.user.bot || !member.roles.cache.has(roleId)) continue
            const latestSlot = reminderSlot(current, clock())
            if (!latestSlot?.backup || latestSlot.kind !== slot.kind) continue
            const extendUntil = slot.kind === 'last-day' && all.schedule.extendForMissedLastDayReminder ? current.lastDayBackupEndsAt : null
            const payload = reminder(recipient)
            if (extendUntil) payload.content += '\nThe original reminder was missed. Your check-in window has been extended through tonight at 11:59 p.m. Pacific.'
            await store.reserveBackup(recipient, slot.kind, payload, extendUntil)
          } else await store.enqueue(recipient, slot.kind, `user:${recipient.owner}`, reminder(recipient))
        }
      }
      await store.expire(now, { backupHold: all.schedule.backupDelayHours === 24 && all.schedule.extendForMissedLastDayReminder })
    })().finally(() => { running = null })
    return running
  }
  return { tick }
}
module.exports = { createScheduler, roster }
