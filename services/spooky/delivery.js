// Durable desired Discord state. Enqueue only inside a root economy transaction.
// Adapter methods run after commit and must use fresh Discord state, never cached roles.
const queues = new WeakMap()
const { serialize } = require('./economy')
function createDelivery({ models, adapter, read, canDeliver = async row => !['final_treat_role', 'final_trick_role', 'final_overall_role'].includes(row.kind) }) {
  const store = work => serialize(models.Delivery.sequelize, work)
  read ||= work => store(() => work())
  async function enqueue(ctx, userId, kind, payload) {
    if (!['curse_role', 'sweet_tooth_role', 'nickname', 'final_treat_role', 'final_trick_role', 'final_overall_role'].includes(kind)) throw new Error('Unknown delivery kind')
    const where = { ...ctx.scope, userId, kind }
    const row = await models.Delivery.findOne({ where, transaction: ctx.transaction })
    const values = { revision: ctx.operationId, payload, status: 'pending', lastError: null }
    if (row) await row.update(values, { transaction: ctx.transaction })
    else await models.Delivery.create({ ...where, ...values }, { transaction: ctx.transaction })
    await ctx.record({ userId, resource: `discord_intent:${kind}`, delta: 0, metadata: payload })
  }
  function reconcile(scope, { userId, deliveryId, kinds } = {}) {
    // Share serialization across reconstructed services on the same connection.
    const previous = queues.get(models.Delivery.sequelize) || Promise.resolve()
    const work = previous.catch(() => {}).then(async () => {
      const rows = await store(() => models.Delivery.findAll({ where: { ...scope, ...(userId && { userId }), ...(deliveryId !== undefined && { id: deliveryId }), status: 'pending' }, order: [['id', 'ASC']] }))
      const results = []
      for (const row of rows) {
        if (kinds && !kinds.includes(row.kind)) continue
        if (await canDeliver(row) !== true) { results.push({ userId: row.userId, kind: row.kind, status: 'blocked' }); continue }
        let status = 'done', lastError = null
        const isCurrent = async () => {
          const current = await read(transaction => models.Delivery.findByPk(row.id, { transaction }))
          return Boolean(current?.status === 'pending' && current.revision === row.revision &&
            JSON.stringify(current.payload) === JSON.stringify(row.payload) && await canDeliver(current) === true)
        }
        try {
          const current = await adapter.getMember(row.guildId, row.userId)
          if (!await isCurrent()) { results.push({ userId: row.userId, kind: row.kind, status: 'superseded' }); continue }
          if (row.kind === 'nickname') {
            const desired = row.payload.nickname
            if (current.nickname !== desired) {
              if (current.nickname !== row.payload.expectedNickname) status = 'conflict'
              else if (await adapter.setNickname(row.guildId, row.userId, desired, { isCurrent, expectedNickname: row.payload.expectedNickname }) === false) status = 'superseded'
            }
          } else {
            if (!row.payload.roleId) throw new Error('Missing role ID')
            const has = current.roleIds.includes(row.payload.roleId)
            if (has !== row.payload.present) {
              if (['final_treat_role', 'final_trick_role', 'final_overall_role'].includes(row.kind) &&
                (!adapter.checkRolePermission || await adapter.checkRolePermission(row.guildId, row.userId, row.payload.roleId) !== true)) throw new Error('Winner role permissions/hierarchy unavailable')
              if (await canDeliver(row) !== true) { results.push({ userId: row.userId, kind: row.kind, status: 'blocked' }); continue }
              if (!await isCurrent()) { results.push({ userId: row.userId, kind: row.kind, status: 'superseded' }); continue }
              if (await adapter.setRole(row.guildId, row.userId, row.payload.roleId, row.payload.present, { isCurrent }) === false) status = 'superseded'
            }
          }
        } catch (error) { status = error.code === 'NICKNAME_CONFLICT' ? 'conflict' : 'pending'; lastError = String(error.message).slice(0, 500) }
        // A newer intent arriving during network delivery stays pending for reconciliation.
        if (status !== 'superseded') await store(() => models.Delivery.update({ status, lastError }, { where: { id: row.id, revision: row.revision, status: 'pending' } }))
        results.push({ userId: row.userId, kind: row.kind, status })
      }
      return results
    })
    queues.set(models.Delivery.sequelize, work)
    return work
  }
  return { enqueue, reconcile }
}

async function checkTitleRolePermission(guild, userId, roleId) {
  const { PermissionFlagsBits } = require('discord.js')
  const [member, bot, roles] = await Promise.all([
    guild.members.fetch({ user: userId, force: true }), guild.members.fetchMe({ force: true }), guild.roles.fetch(),
  ])
  const role = roles.get(roleId)
  return Boolean(role && !role.managed && role.id !== guild.id &&
    member.id === userId && bot.permissions.has(PermissionFlagsBits.ManageRoles) &&
    bot.roles.highest.comparePositionTo(role) > 0)
}

module.exports = { createDelivery, checkTitleRolePermission }
