// Display only: keep resource accounting in exact integers. Truncate rather
// than round up to a balance or unit threshold the player has not reached.
function compactNumber(value) {
  if (typeof value !== 'bigint' && !Number.isSafeInteger(value)) throw Error('Compact amounts require a safe integer.')
  const number = BigInt(value), negative = number < 0n
  const amount = negative ? -number : number
  const units = ['', 'k', 'm', 'b', 't', 'q']
  let divisor = 1n, unit = 0
  while (amount >= divisor * 1000n && unit < units.length - 1) { divisor *= 1000n; unit++ }
  if (!unit) return String(number)
  const hundredths = amount * 100n / divisor
  const fraction = String(hundredths % 100n).padStart(2, '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}${hundredths / 100n}${fraction ? '.' + fraction : ''}${units[unit]}`
}
module.exports = { compactNumber }
