const columns = ['queueMs', 'ackMs', 'engineMs', 'renderMs', 'deliveryMs', 'totalMs'];
const aggregateSql = `SELECT kind,action,COUNT(*) AS samples,${columns.map(c => `AVG(${c}) AS ${c}`).join(',')},MAX(totalMs) AS maxMs FROM WinterPlaytestTimings WHERE runId=$run GROUP BY kind,action ORDER BY kind,action`;
function timingText(rows = []) {
  const buttons = rows.filter(r => r.kind === 'button').sort((a, b) => b.totalMs - a.totalMs || a.action.localeCompare(b.action));
  if (!buttons.length) return 'No completed button samples yet.';
  return buttons.map(r => `${r.action}: **${r.totalMs.toFixed(1)} ms** avg (${r.samples} samples; max ${r.maxMs.toFixed(1)} ms)\nQueue ${r.queueMs.toFixed(1)} · Ack ${r.ackMs.toFixed(1)} · Game ${r.engineMs.toFixed(1)} · Render ${r.renderMs.toFixed(1)} · Discord ${r.deliveryMs.toFixed(1)} ms`).join('\n');
}
module.exports = { columns, aggregateSql, timingText };
