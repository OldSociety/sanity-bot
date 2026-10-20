// An approved production snapshot stays independent of later development edits.
const settings = require('../../config/arena/arena-testing.json')
const productionPlaytest = Boolean(
  process.env.NODE_ENV === 'production' &&
  settings.productionEnabled &&
  settings.productionCurrentRules &&
  require('../../config/arena/arena-balance-production.json').developmentSnapshot
)
const buildFor = (name) => productionPlaytest
  ? require('../../config/arena/arena-builds-production.json')[name]
  : require('./character-config').sheets[name]
module.exports = { productionPlaytest, buildFor }
