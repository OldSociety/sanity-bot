const data = require('../../config/community-leveling.json')
const rules = Object.freeze({ fateCap: 100, rerollCost: 10, levelReward: 5, levelRequirement: 300,
  userDailyCap: 4, guildDailyCap: 24, intervalMs: 30 * 60 * 1000 })
function selectConfig(environment = process.env.NODE_ENV, source = data) {
  const selected = source.environments?.[environment]
  if (!selected) return { enabled: false }
  if (typeof selected.enabled !== 'boolean') throw new Error('Invalid community activation')
  new Intl.DateTimeFormat('en', { timeZone: source.timezone }).format()
  for (const key of ['campaignRoleIds', 'excludedRoleIds', 'channelIds']) {
    if (!Array.isArray(selected[key]) || selected[key].some(id => typeof id !== 'string' || !id) || new Set(selected[key]).size !== selected[key].length) throw new Error(`Invalid community ${key}`)
  }
  if (selected.enabled && (!selected.guildId || !selected.campaignRoleIds.length || !selected.channelIds.length)) throw new Error('Community roles, guild and channels must be configured before enabling')
  return { ...selected, timezone: source.timezone, ...rules }
}
function dayKey(now, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-')
}
module.exports = { rules, selectConfig, dayKey }
