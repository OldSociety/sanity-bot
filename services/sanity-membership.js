const { excludedMember } = require('./member-policy')

function hasUnwantedRole(member, roleId = process.env.UNWANTEDROLEID) {
  if (!member || !roleId || member.user?.bot || member.bot || excludedMember(member)) return false
  const roles = member.roles
  return Boolean(roles?.cache?.has(roleId) || Array.isArray(roles) && roles.includes(roleId))
}
function identity(user, member) {
  return { userName: user?.username || member?.user?.username || null,
    displayName: member?.displayName || member?.nick || user?.globalName || user?.username || member?.user?.username || null }
}
module.exports = { hasUnwantedRole, identity }
