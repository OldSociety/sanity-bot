// Called only inside a committed Trick/Treat operation's root transaction.
async function awardActionDrop({ User, ctx, userId, event, random = Math.random }) {
  const roll = random()
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error('Invalid Fate drop roll')
  if (roll >= event.fate.actionDropPercent / 100) return {}
  const user = await User.findByPk(userId, { transaction: ctx.transaction })
  if (!user || !Number.isSafeInteger(user.bank) || user.bank < 0) throw new Error('Invalid Fate drop wallet')
  const before = user.bank
  const credited = before < event.fate.bankCapacity ? 1 : 0
  if (credited) {
    await user.update({ bank: before + credited }, { transaction: ctx.transaction })
    await ctx.record({ userId, resource: 'bank', delta: credited, before, after: user.bank,
      metadata: { reason: 'spooky_action_drop' } })
  }
  return { fateDrop: credited, fateDropRolled: true, bank: user.bank, fatePoints: user.fate_points }
}
module.exports = { awardActionDrop }
