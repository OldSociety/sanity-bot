// Preserve the explicit October 18 profile for historical experiment regressions.
// New Hendrix/global Block tests exercise the current development profile.
module.exports = function historicalProfile() {
  require('../../config/arena-hendrix-development.json').enabled = false
  const loader = require('../../services/arena/balance-config'),
    original = loader.loadBalance
  loader.loadBalance = (...args) => {
    const balance = original(...args)
    delete balance.damageRules
    delete balance.damageRounding
    return balance
  }
}
