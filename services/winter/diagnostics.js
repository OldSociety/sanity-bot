const { EmbedBuilder } = require('discord.js');
const { randomUUID } = require('node:crypto');
const MINUTE = 60000;
function validate(options) {
  if (!options || !['start', 'status', 'stop'].includes(options.mode)) throw Error('Choose start, status or stop.');
  if (options.speed !== undefined && ![1, 2, 5].includes(options.speed)) throw Error('Diagnostic speed must be 1, 2 or 5.');
  if (options.reportMinutes !== undefined && (!Number.isInteger(options.reportMinutes) || options.reportMinutes < 0 || options.reportMinutes > 1440)) throw Error('Report interval must be 0–1440 real minutes; 0 disables reports.');
  if (options.mode !== 'start' && (options.speed !== undefined || options.reportMinutes !== undefined)) throw Error('Speed and reporting options apply to start only.');
  if (options.mode === 'start' && (typeof options.channelId !== 'string' || !options.channelId)) throw Error('A report channel is required.');
}
function gameNow(saved, realNow) {
  return saved ? saved.gameAnchor + Math.max(0, realNow - saved.realAnchor) * saved.speed : realNow;
}
function snapshot({ player = {}, battle = {}, kitchen = {}, progress = {}, shopProgress = {}, tutorialGifts = {} }) {
  const result = {};
  const groups = {
    Resources: { Snow: player.snow, Diamonds: player.diamonds, Regular: player.snowballs, Spicy: kitchen.spicy,
      Dirty: battle.dirty, Sweat: battle.sweat, Buttons: battle.buttons, Peppers: kitchen.peppers, Rock: player.rock },
    Combat: Object.fromEntries(['defeated', 'losses', 'throws', 'hits', 'enemyAttacks', 'enemyHits', 'stunnedAttacks'].map(k => [k, battle[k]])),
    Training: battle.gym || {},
    'Snowman wins': battle.snowmanWins || {},
    Equipment: { shovelTier: player.shovelTier ?? (battle.ironShovelOwned ? 3 : player.tier), snowPerSecond: player.productionRate,
      outfitOwned: battle.outfitOwned, mittensOwned: battle.mittensOwned, fireFlowerOwned: battle.fireFlowerOwned, ironMaterial: battle.ironMaterial,
      queueCapacity: battle.queueCapacity, weightStage: battle.weightStage },
    Discoveries: { ...Object.fromEntries(['sturdyOwned', 'dirtyUnlocked', 'sweatUnlocked', 'trainUnlocked', 'gymVisited', 'hendrixUnlocked',
      'requiaUnlocked', 'nextChallengerUnlocked', 'secretRecipeFound', 'buttonsUnlocked', 'emporiumUnlocked'].map(k => [k, battle[k]])),
      spicyUnlocked: kitchen.spicyUnlocked, oldStone: kitchen.oldStone, snowballsUnlocked: progress.snowballsUnlocked,
      diamondsUnlocked: progress.diamondsUnlocked, roughSnowmanOwned: shopProgress.snowmanOwned, diamondGift: tutorialGifts.diamondGift },
  };
  for (const [group, values] of Object.entries(groups)) {
    for (const [name, value] of Object.entries(values)) if (Number.isFinite(value)) result[`${group}/${name}`] = value;
  }
  return result;
}
const number = n => Number.isInteger(n) ? String(n) : n.toFixed(2);
const signed = n => `${n >= 0 ? '+' : ''}${number(n)}`;
function report(saved, current, realNow, now) {
  const embed = new EmbedBuilder().setTitle('Winter Wars · Diagnostic progress').setColor(0xadd8e6)
    .setDescription(`Current development rules · ${saved.speed}× speed\n${number((realNow - saved.startedRealAt) / MINUTE)} real minutes · ${number((now - saved.startedGameAt) / MINUTE)} game minutes\nNet changes: since previous report / since diagnostic start.`);
  const groups = {};
  for (const [key, value] of Object.entries(current)) {
    const [group, name] = key.split('/');
    const last = value - (saved.previous[key] || 0), total = value - (saved.baseline[key] || 0);
    if (group === 'Discoveries' && !last && !total) continue;
    (groups[group] ||= []).push(`${name}: ${signed(last)} / ${signed(total)} · now ${number(value)}`);
  }
  for (const [name, lines] of Object.entries(groups)) {
    let part = '';
    for (const line of lines) {
      if ((part + line).length > 1000) { embed.addFields({ name, value: part }); part = ''; }
      part += line + '\n';
    }
    if (part) embed.addFields({ name, value: part });
  }
  embed.setFooter({ text: 'Development diagnostics · inventory figures are net balances, not gross earnings or spending.' });
  return { embeds: [embed.toJSON()], allowedMentions: { parse: [] } };
}
function status(receipt) {
  const d = receipt.diagnostic;
  const embed = new EmbedBuilder().setColor(0xadd8e6).setTitle('Winter Wars · Diagnostic mode')
    .setDescription(d?.enabled ? `Enabled at **${d.speed}×** speed for your profile.\nReports: ${d.reportMinutes ? `every **${d.reportMinutes} real minutes** in <#${d.channelId}>` : 'off'}.` : 'Diagnostic mode is off. Your profile runs at 1× speed.')
    .addFields({ name: 'Usage', value: '`/snow diagnostic mode:start speed:2 report_minutes:5`\nUse speed 5 for 5×; report_minutes 0 disables reports.\n`mode:stop` restores 1× and stops reports.\nCurrent development rules; proposed simulation balances are separate.' });
  return { content: '', embeds: [embed], components: [], attachments: [], files: [], allowedMentions: { parse: [] } };
}
async function initialize(query) {
  await query(`CREATE TABLE IF NOT EXISTS WinterDiagnostics (eventId TEXT NOT NULL,guildId TEXT NOT NULL,userId TEXT NOT NULL,
    enabled INTEGER NOT NULL,nextReportAt INTEGER NOT NULL,state TEXT NOT NULL,PRIMARY KEY(eventId,guildId,userId))`);
  await query(`CREATE TABLE IF NOT EXISTS WinterDiagnosticReports (id TEXT PRIMARY KEY,eventId TEXT NOT NULL,guildId TEXT NOT NULL,
    userId TEXT NOT NULL,channelId TEXT NOT NULL,status TEXT NOT NULL,payload TEXT NOT NULL)`);
}
async function read(query, identity) {
  const [[row]] = await query('SELECT state FROM WinterDiagnostics WHERE eventId=:eventId AND guildId=:guildId AND userId=:userId', identity);
  return row ? JSON.parse(row.state) : null;
}
async function save(query, identity, saved) {
  await query('INSERT OR REPLACE INTO WinterDiagnostics VALUES (:eventId,:guildId,:userId,:enabled,:nextReportAt,:state)',
    { ...identity, enabled: Number(saved.enabled), nextReportAt: saved.nextReportAt, state: JSON.stringify(saved) });
}
async function configure(query, identity, saved, options, receipt, realNow, now) {
  if (options.mode === 'status') return saved;
  const current = snapshot(receipt);
  const enabled = options.mode === 'start', speed = enabled ? options.speed ?? saved?.speed ?? 2 : 1;
  const reportMinutes = enabled ? options.reportMinutes ?? saved?.reportMinutes ?? 0 : 0;
  const updated = { enabled, speed, reportMinutes, channelId: options.channelId || saved?.channelId,
    realAnchor: realNow, gameAnchor: now, startedRealAt: realNow, startedGameAt: now,
    baseline: current, previous: current, nextReportAt: enabled && reportMinutes ? realNow + reportMinutes * MINUTE : 0 };
  await query("UPDATE WinterDiagnosticReports SET status='cancelled' WHERE eventId=:eventId AND guildId=:guildId AND userId=:userId AND status='pending'", identity);
  await save(query, identity, updated);
  return updated;
}
async function captureReport(query, identity, saved, receipt, realNow, now) {
  if (!saved?.enabled || !saved.reportMinutes || saved.nextReportAt > realNow) return;
  const current = snapshot(receipt), id = randomUUID();
  const payload = report(saved, current, realNow, now);
  payload.embeds[0].description = `Player: <@${identity.userId}>\n` + payload.embeds[0].description;
  await query('INSERT INTO WinterDiagnosticReports VALUES (:id,:eventId,:guildId,:userId,:channelId,:status,:payload)',
    { ...identity, id, channelId: saved.channelId, status: 'pending', payload: JSON.stringify(payload) });
  saved.previous = current;
  saved.nextReportAt = realNow + saved.reportMinutes * MINUTE;
  await save(query, identity, saved);
}
module.exports = { validate, gameNow, snapshot, report, status, initialize, read, configure, captureReport };
