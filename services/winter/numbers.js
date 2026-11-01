// Display one truncated decimal; accounting retains its original precision.
const { compactNumber: original } = require('../compact-number');
const compactNumber = value => original(value).replace(/(\.\d)\d+(?=[kmbtq]$)/, '$1').replace(/\.0(?=[kmbtq]$)/, '');
module.exports = { compactNumber };
