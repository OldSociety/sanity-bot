function fateReminderSettings({ channelId, roleId }) {
  return { enabled: Boolean(channelId && roleId), timezone: 'America/Los_Angeles', everyDays: 7,
    channelId: channelId || null, roleIds: roleId ? [roleId] : [], localTime: '12:00' }
}
module.exports = { fateReminderSettings }
