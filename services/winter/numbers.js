// Winter displays whole numbers; accounting retains its original precision.
const { compactNumber: original } = require('../compact-number');
const compactNumber = value => original(value).replace(/\.\d+(?=[kmbtq]$)/, '');
module.exports = { compactNumber };
