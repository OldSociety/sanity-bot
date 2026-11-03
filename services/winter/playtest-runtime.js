const { AttachmentBuilder } = require('discord.js');
const { gzipSync } = require('node:zlib');
const { adminMember } = require('../member-policy');
const { withBotTests } = require('../command-channels');
const { createStore } = require('./playtest-store');
const { screen, diagnosticEmbed, viewFor } = require('./playtest-presentation');
const { recapMessage } = require('./playtest-recap');
const { isAdminAction } = require('./playtest-admin');
const { createControls } = require('./playtest-controls');
const settings = require('../../config/winter/development-playtest.json');
function enabled() { return process.env.NODE_ENV === 'development' && settings.enabled && process.env.GUILDID === settings.guildId; }
function createRuntime({ store, authorize = () => null, isAdmin = i => Boolean(adminMember(i.member) || i.memberPermissions?.has?.('Administrator')), allowedReport = () => true, controls = createControls(), measure = () => performance.now() } = {}) {
  let client, timer, busy = false, pulsing, nextReportCheck = 0, flushRequested = false, captureId = 0;
  const pending = new Map();
  function enqueue(key, task) {
    const result = (pending.get(key) || Promise.resolve()).catch(() => {}).then(task);
    pending.set(key, result);
    void result.finally(() => { if (pending.get(key) === result) pending.delete(key); }).catch(() => {});
    return result;
  }
  const isFight = receipt => Boolean(receipt.state.active && viewFor(receipt.displayAction || receipt.action) === 'throw' && (!receipt.run || receipt.run.status === 'active'));
  function handle(i) {
    const receivedAt = Date.now(), started = measure();
    const key = `${i.guildId}:${i.user.id}`;
    return enqueue(key, () => processInteraction(i, receivedAt, started));
  }
  async function processInteraction(i, receivedAt, started) {
    const processing = measure();
    const isButton = Boolean(i.isButton?.());
    let staleOwned = false;
    let action = isButton ? null : i.options.getSubcommand(), quantity, expectedRun, denied = authorize(i);
    if (isButton) {
      const parts = i.customId.split(':');
      if ([6, 7].includes(parts.length) && parts[0] === 'snow' && parts[2] === 'pt') {
        [, , , expectedRun, action, quantity] = parts;
        if (parts[1] !== i.user.id) denied ||= 'These controls belong to another player.';
        else if (!controls.accepts(i)) {
          staleOwned = !denied;
          denied ||= 'These Winter controls expired. Open the /snow command for the place you want to visit.';
        }
      } else { action = 'stale-control'; denied ||= 'These Winter controls expired. Open /snow status.'; }
    }
    const diagnostic = action === 'diagnostic';
    const administrator = isAdmin(i);
    if (isAdminAction(action) && !administrator) denied ||= 'Development administrators only.';
    if (isAdminAction(action) && action !== 'admin' && !isButton) denied ||= 'Use the development admin controls.';
    let d;
    if (diagnostic) {
      if (!administrator) denied ||= 'Development administrators only.';
      d = { mode: i.options.getString('mode'), speed: i.options.getInteger('speed') ?? 1,
        bookmark: i.options.getString('bookmark') ?? 'chapter0', stopAt: i.options.getString('stop_at') ?? (i.options.getString('bookmark') === 's3' ? 'none' : 'chapter1'),
        reportMinutes: i.options.getInteger('report_minutes') ?? 0, channelId: i.channelId, runId: i.options.getInteger('run') ?? null };
    }
    // An unauthorized attempt is still an interaction in the actor's existing run.
    // Replies are private and never modify someone else's message.
    // Remove the screen from the expiry worker before the first Discord await.
    const retirement = !denied ? controls.retire(i, !isButton) : null;
    if (isButton && !denied) await i.deferUpdate(); else await i.deferReply({ ephemeral: true });
    const acknowledged = measure();
    try {
      // Old messages from before a restart have no in-memory handle. Clicking
      // one lets Discord remove its controls; never clear a newer screen when
      // a duplicate click arrives with the preceding token on that same message.
      if (staleOwned && i.message?.id && !controls.isCurrentMessage(i)) {
        try { await i.webhook?.editMessage(i.message.id, { components: [] }); } catch { /* Best-effort visual cleanup only. */ }
      }
      await retirement;
      const engineStart = measure();
      const receipt = await store.execute({ guildId: i.guildId, userId: i.user.id, id: i.id, action,
        quantity, expectedRun, diagnostic: d, denied, admin: administrator, receivedAt, kind: isButton ? 'button' : 'slash',
        raw: isButton ? { customId: i.customId, channelId: i.channelId, createdTimestamp: i.createdTimestamp ?? null, displayName: i.member?.displayName || i.user.globalName || i.user.username || i.user.id } : { options: i.options.data || [], channelId: i.channelId, createdTimestamp: i.createdTimestamp ?? null, displayName: i.member?.displayName || i.user.globalName || i.user.username || i.user.id } });
      const engineEnd = measure();
      const output = denied ? { content: receipt.message, embeds: [], components: [], allowedMentions: { parse: [] } } : screen(receipt, i.user.id, diagnostic);
      if (receipt.export) {
        let bytes = Buffer.from(JSON.stringify(receipt.export, null, 2)), name = `winter-run-${receipt.run.run}.json`;
        if (bytes.length > 7000000) { bytes = gzipSync(bytes); name += '.gz'; }
        output.files = [...(output.files || []), new AttachmentBuilder(bytes, { name })];
      }
      const ids = denied ? new Set() : controls.decorate(output);
      const rendered = measure();
      const result = await i.editReply(output);
      const delivered = measure();
      if (!denied) controls.remember(i, result, ids, { fight: isFight(receipt), run: String(receipt.run?.run ?? 'normal') });
      if (receipt.run && store.recordTiming) {
        try { await store.recordTiming({ id: i.id, guildId: i.guildId, userId: i.user.id,
          queueMs: processing - started, ackMs: acknowledged - processing, engineMs: engineEnd - engineStart,
          renderMs: rendered - engineEnd, deliveryMs: delivered - rendered, totalMs: delivered - started }); }
        catch (error) { console.error('Winter diagnostic timing:', error.message); }
      }
      // Drain committed reports promptly; the worker still recovers a queued
      // recap if interaction delivery fails or the process restarts here.
      flushRequested = true; void pulse();
      return result;
    } catch (error) {
      console.error('Winter Chapter 1 playtest:', error.message);
      return i.editReply({ content: 'This request could not finish. Open /snow status before repeating a purchase. Your saved run and committed rewards remain in SQLite.', embeds: [], components: [], allowedMentions: { parse: [] } });
    }
  }
  function pulse() {
    if (pulsing) return pulsing;
    pulsing = runPulse().finally(() => { pulsing = null; });
    return pulsing;
  }
  async function runPulse() {
    if (busy) return;
    busy = true;
    try {
      await controls.expire();
      if (!client?.isReady?.()) return;
      for (const entry of controls.live()) await enqueue(entry.key, async () => {
        if (!controls.current(entry)) return;
        controls.capturing(entry);
        const i = entry.interaction;
        const receipt = await store.execute({ guildId: i.guildId, userId: i.user.id, id: `winter-live:${entry.token}:${++captureId}`, action: 'capture', kind: 'system', expectedRun: entry.run });
        if (!controls.current(entry)) return;
        const view = { ...receipt, action: 'throw' }, output = screen(view, i.user.id);
        const ids = controls.decorate(output, entry.token);
        try { await i.editReply(output); controls.updated(entry, ids, isFight(view)); }
        catch { await controls.retire(i); }
      });
      // Only opted-in, due reports create work. Other profiles settle losslessly
      // on their next interaction, including after startup/reconnect.
      const reportSweep = Date.now() >= nextReportCheck;
      if (reportSweep) {
        nextReportCheck = Date.now() + settings.workerIntervalMs;
        for (const r of await store.due()) await store.execute({ guildId: r.guildId, userId: r.userId, id: `winter-report:${r.id}:${r.lastReportAt}`, action: 'capture', kind: 'system', expectedRun: String(r.id) });
      }
      if (!reportSweep && !flushRequested) return;
      flushRequested = false;
      for (let n = 0; n < 10; n++) {
        const report = await store.claimReport(); if (!report) break;
        try {
          if (!allowedReport(report)) throw Error('Report destination no longer allowed.');
          const channel = await client.channels.fetch(report.channelId);
          if (channel?.guildId !== report.guildId || !channel.isTextBased?.() || typeof channel.send !== 'function') throw Error('Report destination unavailable.');
          const sent = await channel.send(report.payload.kind === 'run-ended' ? recapMessage(report.payload) : { embeds: [diagnosticEmbed(report.payload, report.payload.counts)], allowedMentions: { parse: [] } });
          await store.delivered(report.id, null, sent?.id || null);
        } catch (error) { await store.delivered(report.id, error.message); }
      }
    } catch (error) { console.error('Winter diagnostic report:', error.message); }
    finally { busy = false; }
  }
  function start(value) { client = value; if (timer) return; timer = setInterval(() => void pulse(), 3000); timer.unref?.(); client.once?.('invalidated', stop); return pulse(); }
  function stop() { clearInterval(timer); timer = null; return pulsing || Promise.resolve(); }
  return { handle, start, stop, pulse };
}
let selected;
function runtime() {
  if (!enabled()) throw Error('Chapter 1 playtest is development-only.');
  return selected ||= createRuntime({ store: createStore({ sequelize: require('../../config/database/sequelize') }), authorize: require('./runtime').restriction,
    allowedReport: r => enabled() && r.guildId === settings.guildId && withBotTests([process.env.WINTERCHANNELID, process.env.BOTTESTCHANNELID], { guildId: r.guildId, environment: 'development' }).includes(r.channelId) });
}
module.exports = { enabled, createRuntime, runtime };
