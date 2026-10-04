const { spookyCommand } = require('../../services/spooky/command-definition')
module.exports = spookyCommand(require('../../services/spooky/runtime'))
