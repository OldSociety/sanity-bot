const ACTIONS = new Set(['admin', 'grant-sweat', 'grant-snow', 'grant-ammo', 'restart', 'restart-confirm', 'restart-cancel']);
const isAdminAction = action => ACTIONS.has(action);
module.exports = { isAdminAction };
