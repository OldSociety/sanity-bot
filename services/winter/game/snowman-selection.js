const { chapterTwo } = require('./progression');
const { ActionRowBuilder } = require('discord.js');
const row = (items) => new ActionRowBuilder().addComponents(...items);
function rows(items) {
  const result = [];
  for (let i = 0; i < items.length; i += 5) result.push(row(items.slice(i, i + 5)));
  return result;
}
function targets(s, rules) {
  return rules
    .filter(
      (r) =>
        s.owned[r.tier] &&
        (r.tier <= 2 || chapterTwo(s)) &&
        Number.isFinite(r.hp) &&
        r.hp > 0 &&
        Number.isFinite(r.damage)
    )
    .filter((r) => r.tier !== 2 || s.tiers[1].wins >= 100)
    .map((r) => r.tier);
}
function selector({ targets, page = 0, fight, back, optional = [], previous, next }) {
  const links = optional.slice(),
    budget = 10;
  while (targets.length + 1 + links.length > budget && links.length) links.pop();
  if (targets.length + 1 <= budget)
    return { components: rows([...targets.map(fight), ...links, back]), page: 0, pages: 1 };
  // Seven selections leave room for Back plus both page directions.
  const pageSize = 7,
    pages = Math.ceil(targets.length / pageSize),
    selected = Math.max(0, Math.min(page, pages - 1));
  const controls = targets.slice(selected * pageSize, (selected + 1) * pageSize).map(fight);
  if (selected > 0) controls.push(previous(selected - 1));
  if (selected + 1 < pages) controls.push(next(selected + 1));
  controls.push(back);
  return { components: rows(controls), page: selected, pages };
}
function fight(items) {
  const action = (b) => b.data.custom_id.split(':')[4];
  const isAmmo = (b) => action(b).startsWith('equip-') || action(b).startsWith('quick-buy-');
  const ammo = items.filter(isAmmo);
  const refresh = items.find((b) => b.data.label === 'Refresh');
  const navigation = items.filter((b) => !isAmmo(b) && b !== refresh);
  if (refresh) navigation.push(refresh);
  const result = [...rows(ammo), ...rows(navigation)];
  if (result.length > 5)
    throw Error('Throw controls exceed the message capacity. Add another equipment page.');
  return result;
}
module.exports = { rows, targets, selector, fight };
