// Compatibility for an older loaded actions module until its next reload.
// Random action rewards have been replaced by unique collection rewards.
async function awardActionDrop() { return {} }
module.exports = { awardActionDrop }
