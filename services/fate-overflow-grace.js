const defaults = require('../config/fate-overflow-grace.json')
function validateGrace(policy) {
  if (!policy || typeof policy.enabled !== 'boolean') throw new Error('Invalid Fate overflow grace policy')
  if (!policy.enabled) return { ...policy }
  const start = Date.parse(policy.startsAt), end = Date.parse(policy.endsAt)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 63 * 86400000) throw new Error('Fate grace requires a bounded launch window')
  return { ...policy }
}
function selectedGrace(environment = process.env.NODE_ENV, source = defaults) {
  return validateGrace(source.environments?.[environment] || { enabled: false })
}
function activeGrace(now, policy = selectedGrace()) {
  const approved = validateGrace(policy), value = new Date(now).getTime()
  if (!Number.isFinite(value)) throw new Error('Invalid Fate grace timestamp')
  return approved.enabled && value >= Date.parse(approved.startsAt) && value < Date.parse(approved.endsAt)
}
// Prepare explicit rollout dates, preserving Pacific wall time across DST.
// This does not activate policy, rewrite config, or open player storage.
function launchWindow(now) {
  const start = new Date(now)
  if (!Number.isFinite(start.getTime())) throw new Error('Invalid launch date')
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(start).map(part => [part.type, part.value]))
  const monthStart = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1 + 2, 1))
  const lastDay = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate()
  const wall = Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), Math.min(Number(parts.day), lastDay), Number(parts.hour), Number(parts.minute), Number(parts.second), start.getUTCMilliseconds())
  let end = wall
  for (let i = 0; i < 3; i++) {
    const zone = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', timeZoneName: 'longOffset' }).formatToParts(end).find(part => part.type === 'timeZoneName').value
    const offset = /^GMT([+-])(\d{2}):(\d{2})$/.exec(zone)
    if (!offset) throw new Error('Pacific offset unavailable')
    end = wall - (offset[1] === '+' ? 1 : -1) * (Number(offset[2]) * 60 + Number(offset[3])) * 60000
  }
  return validateGrace({ enabled: true, startsAt: start.toISOString(), endsAt: new Date(end).toISOString() })
}
function graceNotice(banked, discarded = 0) {
  if (!banked) return null
  return `Launch protection: ${banked} Fate overflowed into your Bank. For the first two months after launch, earned Fate above 100 is banked, up to the Bank’s 100-point cap.${discarded ? ` ${discarded} additional Fate could not fit because both balances are full.` : ''}`
}
module.exports = { validateGrace, selectedGrace, activeGrace, launchWindow, graceNotice }
