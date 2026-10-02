// Old effects stored only ownership. Their atomic delivery intent is the only
// safe fallback; a new environment role must never replace restoration evidence.
async function originalCurseRole(models, ctx, userId, metadata) {
  if (metadata.roleId !== undefined) {
    if (typeof metadata.roleId !== 'string' || !metadata.roleId.trim()) throw new Error('Invalid original curse role')
    return metadata.roleId
  }
  const prior = await models.Delivery.findOne({ where: { ...ctx.scope, userId, kind: 'curse_role' }, transaction: ctx.transaction })
  if (typeof prior?.payload.roleId !== 'string' || !prior.payload.roleId.trim()) throw new Error('Original curse role requires delivery inspection')
  return prior.payload.roleId
}
module.exports = { originalCurseRole }
