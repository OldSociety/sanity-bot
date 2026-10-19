const disabled = require('../config/commands/disabled-commands.json')
function disabledMessage(name) {
  return Object.hasOwn(disabled, name) ? disabled[name] : null
}
module.exports = { disabledMessage, disabledNames: Object.freeze(Object.keys(disabled)) }
