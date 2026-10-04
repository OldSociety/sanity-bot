const fs = require('node:fs');
const environment = process.argv[2];
if (!['development','production'].includes(environment)) throw new Error('Explicit environment required');
const runtime = require('../../config/runtime').loadDiscordEnvironment(environment);
const Sqlite = require('sqlite3');
(async () => {
 const db = await new Promise((resolve,reject) => { const opened = new Sqlite.Database(runtime.database.storage,Sqlite.OPEN_READONLY,error => error ? reject(error) : resolve(opened)); });
 const all = (sql,...params) => new Promise((resolve,reject) => db.all(sql,params,(error,rows) => error ? reject(error) : resolve(rows)));
 try {
  const operations = await all("SELECT operationId, actorId, operationType, receipt, completedAt FROM SpookyOperations WHERE eventId=? AND guildId=? AND operationType IN ('spooky_trick','spooky_treat') AND completedAt IS NOT NULL ORDER BY completedAt DESC, operationId DESC LIMIT 100", 'spooky-2026',runtime.guildId);
  const rootIds = operations.map(r => r.operationId);
  const ledger = rootIds.length ? await all('SELECT operationId, userId, delta, relatedUserId, configVersion, metadata FROM SpookyLedger WHERE resource=? AND operationId IN (' + rootIds.map(() => '?').join(',') + ')', 'eyes', ...rootIds) : [];
  const describe = rows => {
   const ordered = [...rows].reverse(), counts = {};
   let run = 0, longest = 0, wins = 0;
   for (const row of ordered) {
    const receipt = JSON.parse(row.receipt), result = receipt.result || {}, outcome = receipt.outcome;
    counts[outcome] = (counts[outcome] || 0) + 1;
    const eyeOutcome = ['find_eye','steal_or_find_eye'].includes(outcome);
    if (eyeOutcome) { run++; longest = Math.max(longest,run); if (!result.noEffect) wins++; } else run = 0;
   }
   return { actions: rows.length, counts, EyeOutcomes: (counts.find_eye || 0) + (counts.steal_or_find_eye || 0), successfulEyeAwards: wins, longestConsecutiveEyeResults: longest };
  };
  const config19 = operations.filter(row => ledger.some(entry => entry.operationId === row.operationId && entry.configVersion ===19));
  // Use action-cost ledger too: actions without an Eye row must remain in the denominator.
  const versions = rootIds.length ? await all('SELECT DISTINCT operationId,configVersion FROM SpookyLedger WHERE operationId IN (' + rootIds.map(() => '?').join(',') + ')', ...rootIds) : [];
  const current = operations.filter(row => versions.some(entry => entry.operationId === row.operationId && entry.configVersion ===19));
  const audit = rows => {
   let checked = 0, mismatches = 0;
   for (const row of rows) {
    const receipt = JSON.parse(row.receipt), result = receipt.result || {};
    if (!['find_eye','steal_or_find_eye'].includes(receipt.outcome)) continue;
    checked++;
    const entries = ledger.filter(entry => entry.operationId === row.operationId), positives = entries.filter(e => e.delta > 0);
    const blocked = Boolean(result.noEffect), stolen = receipt.outcome ==='steal_or_find_eye' && result.stolen===1;
    if (positives.length !== (blocked ? 0 : 1) || positives.some(e => e.delta !==1 || e.userId !==row.actorId) ||
      (stolen && !entries.some(e => e.delta===-1 && e.relatedUserId===row.actorId)) ||
      (!stolen && positives.some(e => e.relatedUserId !==null))) mismatches++;
   }
   return { checkedEyeOperations: checked, awardAccountingMismatches: mismatches };
  };
  const report = { at:new Date().toISOString(),environment,readOnly:true, latest100:describe(operations),config19:describe(current), ownerConfig19:describe(current.filter(row => row.actorId===process.env.BOTADMINID)), accounting:audit(current) };
  fs.writeFileSync('artifacts/spooky-production-launch/eye-odds-' + environment + '.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  if (report.accounting.awardAccountingMismatches) process.exitCode=1;
 } finally { await new Promise((resolve,reject) => db.close(error => error ? reject(error) : resolve())); }
})().catch(error => { console.error(error.message);process.exitCode=1; });