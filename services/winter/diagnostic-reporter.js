function createReporter({ getEconomy, getClient, allowed, claim, logger = console }) {
  let running = false;
  async function pulse() {
    if (running || !getClient()) return;
    running = true;
    try {
      const economy = getEconomy();
      for (const row of await economy.dueDiagnostics?.() || []) {
        if (!allowed(row)) continue;
        const release = claim(row.guildId, row.userId);
        if (!release) continue;
        try {
          await economy.execute({ guildId: row.guildId, userId: row.userId,
            interactionId: `winter-diagnostic:${row.userId}:${row.nextReportAt}`, action: 'diagnostic-report', admin: true });
        } finally { release(); }
      }
      for (const row of await economy.pendingDiagnosticReports?.() || []) {
        const report = await economy.claimDiagnosticReport(row.id);
        if (!report) continue;
        try {
          if (!allowed(report)) throw Error('Diagnostic destination is no longer permitted.');
          const channel = await getClient().channels.fetch(report.channelId);
          if (!channel || typeof channel.send !== 'function' || (channel.guildId || channel.guild?.id) !== report.guildId) throw Error('Diagnostic destination unavailable.');
          await channel.send(report.payload);
          await economy.finishDiagnosticReport(report.id, true);
        } catch (error) {
          await economy.finishDiagnosticReport(report.id, false);
          logger.error('Winter diagnostic report unavailable (not retried automatically):', error.message);
        }
      }
    } finally { running = false; }
  }
  return { pulse };
}
module.exports = { createReporter };
