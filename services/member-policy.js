// The development guild deliberately uses the Bots role for test accounts.
// Production excludes both actual Discord bots and members of that role.
function excludedMember(member, { environment = process.env.NODE_ENV, botRoleId = process.env.BOTROLEID } = {}) {
  if (environment === 'development') return false
  const roles = member?.roles?.cache
  return Boolean(member?.user?.bot || member?.bot || (botRoleId && roles?.has(botRoleId)) ||
    (roles?.values && [...roles.values()].some(role => role.name?.trim().toLowerCase() === 'bots')))
}
function adminMember(member, adminRoleId = process.env.ADMINROLEID) {
  const roles = member?.roles?.cache
  return Boolean((adminRoleId && roles?.has(adminRoleId)) ||
    (roles?.values && [...roles.values()].some(role => role.name?.trim().toLowerCase() === 'admin')))
}
module.exports = { excludedMember, adminMember }
