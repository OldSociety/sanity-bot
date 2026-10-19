// Shared by resolution, previews and descriptions. Omitted amounts retain the
// original one-point effect; zero disables removal without changing its chance.
function stressRemovalAmount(ability) {
  const amount = ability?.stressRemovalAmount ?? 1
  if (!Number.isInteger(amount) || amount < 0)
    throw new RangeError('stressRemovalAmount must be a nonnegative integer')
  return amount
}
module.exports = { stressRemovalAmount }
