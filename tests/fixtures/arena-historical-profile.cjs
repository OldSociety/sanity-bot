// Preserve the explicit October 18 profile for historical experiment regressions.
// New Hendrix/global Block tests exercise the current development profile.
module.exports = function historicalProfile() {
  require('../../config/arena/characters/arena-classic-hendrix-development.json').enabled = false
  require('../../config/arena/characters/arena-template-development.json').identity =
    structuredClone(
      require('../../config/arena/arena-templates-production.json').characters
    )[0]
  const loader = require('../../services/arena/balance-config'),
    original = loader.loadBalance
  loader.loadBalance = (...args) => {
    const balance = original(...args)
    delete balance.damageRules
    delete balance.damageRounding
    delete balance.ai.deferFearSpending
    return balance
  }
}
