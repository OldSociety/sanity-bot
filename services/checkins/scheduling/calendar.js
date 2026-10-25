const DAY = 86400000
const parse = date => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error('Invalid check-in calendar date.')
  const n = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0, 10) !== date) throw Error('Invalid check-in calendar date.')
  return n
}
const addDays = (date, days) => new Date(parse(date) + days * DAY).toISOString().slice(0, 10)
function localParts(now, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now)).map(p => [p.type, p.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute) }
}
function localTimestamp(date, hour, timezone) {
  let value = parse(date) + hour * 3600000
  // Resolve a Pacific local time through Intl rather than assuming a fixed UTC
  // offset. All configured times are noon/midnight, outside DST ambiguities.
  for (let i = 0; i < 4; i++) {
    const p = localParts(value, timezone)
    const offset = parse(p.date) + p.hour * 3600000 + p.minute * 60000 - (parse(date) + hour * 3600000)
    if (!offset) return value
    value -= offset
  }
  throw Error('Could not resolve check-in local time.')
}
function candidate(config, campaign, now) {
  const policy = config.schedule
  if (policy?.timezone !== 'America/Los_Angeles' || policy.intervalWeeks !== 2 || policy.windowCalendarDays !== 5 || ![policy.openingHour, policy.reminderHour].every(n => Number.isInteger(n) && n >= 0 && n <= 23)) throw Error('Invalid check-in schedule.')
  const anchor = config.campaigns[campaign]?.anchor
  const today = localParts(now, policy.timezone).date
  const elapsed = Math.floor((parse(today) - parse(anchor)) / DAY)
  if (elapsed < 0) return null
  const openDate = addDays(anchor, Math.floor(elapsed / 14) * 14)
  const lastDate = addDays(openDate, 4)
  if (policy.breaks?.some(b => openDate <= b.end && lastDate >= b.start)) return null
  const opensAt = localTimestamp(openDate, policy.openingHour, policy.timezone)
  const closesAt = localTimestamp(addDays(lastDate, 1), 0, policy.timezone)
  const reminderAt = localTimestamp(lastDate, policy.reminderHour, policy.timezone)
  const backupHours = policy.backupDelayHours ?? 0
  if (![0,24].includes(backupHours)) throw Error('Invalid backup reminder delay.')
  const openingBackupAt = backupHours ? opensAt + backupHours * 3600000 : null
  const lastDayBackupAt = backupHours ? reminderAt + backupHours * 3600000 : null
  const endOfDay = timestamp => localTimestamp(addDays(localParts(timestamp, policy.timezone).date, 1), 0, policy.timezone)
  return { key: `${campaign}:${openDate}`, campaign, openDate, lastDate, opensAt, closesAt, reminderAt,
    openingEndsAt: endOfDay(opensAt), openingBackupAt, openingBackupEndsAt: openingBackupAt && endOfDay(openingBackupAt),
    lastDayEndsAt: endOfDay(reminderAt), lastDayBackupAt, lastDayBackupEndsAt: lastDayBackupAt && endOfDay(lastDayBackupAt) }
}
function occurrence(config, campaign, now) {
  const value = candidate(config, campaign, now)
  return value && now >= value.opensAt && now < value.closesAt ? value : null
}
function reminderOccurrence(config, campaign, now) {
  const value = candidate(config, campaign, now)
  const end = value && Math.max(value.closesAt, value.lastDayBackupEndsAt || 0)
  return value && now >= value.opensAt && now < end ? value : null
}
function reminderSlot(value, now) {
  if (now >= value.reminderAt && now < value.lastDayEndsAt) return { kind: 'last-day', backup: false }
  if (value.lastDayBackupAt && now >= value.lastDayBackupAt && now < value.lastDayBackupEndsAt) return { kind: 'last-day', backup: true }
  if (now >= value.opensAt && now < value.openingEndsAt) return { kind: 'opening', backup: false }
  if (value.openingBackupAt && now >= value.openingBackupAt && now < value.openingBackupEndsAt) return { kind: 'opening', backup: true }
  return null
}
module.exports = { addDays, localParts, localTimestamp, occurrence, reminderOccurrence, reminderSlot }
