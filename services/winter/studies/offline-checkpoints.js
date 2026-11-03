// Isolated simulation SQLite only. No environment, runtime models or live DB.
const sqlite3 = require('sqlite3');
const M = require('./early-progression');
const R = require('./simulation-rng');
const processing = require('../../../config/winter/studies/offline-processing.json');
function timestamp(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw Error('Invalid simulation timestamp.');
}
function fresh(seed, config = M.config, settings = processing) {
  return {
    version: 1,
    processing: settings.id,
    state: M.fresh(config),
    random: R.initial(seed),
    lastActivityAt: 0,
    nextCaptureAt: settings.captureIntervalMs ?? null,
    creditedMs: 0,
    discardedMs: 0,
    captureChunks: 0,
    hourlyCaptures: 0,
    revision: 0
  };
}
function discard(envelope, at) {
  const s = envelope.state,
    elapsed = at - s.now;
  if (elapsed < 0) throw Error('Cannot discard already processed time.');
  // Freeze the unprocessed tail; preserve remaining delays, not overdue events.
  s.nextPlayerAt += elapsed;
  s.nextEnemyAt += elapsed;
  s.now = at;
  envelope.discardedMs += elapsed;
  envelope.lastActivityAt = at;
  envelope.nextCaptureAt = at + processing.captureIntervalMs;
}
function captureChunk(envelope, now, config = M.config) {
  if (now < envelope.nextCaptureAt) return false;
  const h = processing.captureIntervalMs;
  const dueThrough = envelope.nextCaptureAt + Math.floor((now - envelope.nextCaptureAt) / h) * h;
  const through = Math.min(dueThrough, envelope.state.now + processing.maxChunkMs);
  const from = envelope.state.now;
  const result = M.settle(envelope.state, through, R.streams(envelope.random), config);
  if (!result.complete) throw Error('Candidate capture exceeded event budget.');
  envelope.creditedMs += through - from;
  envelope.hourlyCaptures += (through - from) / h;
  envelope.captureChunks++;
  envelope.nextCaptureAt = through + h;
  return true;
}
function settleReturnChunk(envelope, at, config, settings, metrics) {
  if (at <= envelope.state.now) return false;
  const from = envelope.state.now,
    through = Math.min(at, from + settings.maxChunkMs);
  const started = metrics?.measurePerformance ? performance.now() : null;
  const result = M.settle(envelope.state, through, R.streams(envelope.random), config);
  if (!result.complete) throw Error('On-return chunk exceeded event budget.');
  envelope.creditedMs += through - from;
  envelope.captureChunks++;
  if (metrics) {
    metrics.simulationCalls++;
    metrics.simulationEvents += result.events;
    if (started !== null)
      metrics.maxChunkComputeMs = Math.max(
        metrics.maxChunkComputeMs || 0,
        performance.now() - started
      );
  }
  return true;
}
async function open(
  storage,
  { config = M.config, beforeCommit = () => {}, settings = processing, metrics } = {}
) {
  if (
    settings.returnPolicy === 'settle-all-on-return' &&
    (!Number.isSafeInteger(settings.maxChunkMs) ||
      settings.maxChunkMs < 1 ||
      settings.maxChunkMs > 14400000)
  )
    throw Error('On-return chunks must be positive and at most four hours.');
  if (storage !== ':memory:' && !storage.endsWith('.winter-sim.sqlite'))
    throw Error('Use an explicit isolated .winter-sim.sqlite path.');
  const db = await new Promise((resolve, reject) => {
    const connection = new sqlite3.Database(storage, (error) =>
      error ? reject(error) : resolve(connection)
    );
  });
  db.configure('busyTimeout', 10000);
  const exec = (sql) =>
    new Promise((resolve, reject) => db.exec(sql, (error) => (error ? reject(error) : resolve())));
  const run = (sql, values = []) =>
    new Promise((resolve, reject) =>
      db.run(sql, values, (error) => (error ? reject(error) : resolve()))
    );
  const get = (sql, values = []) =>
    new Promise((resolve, reject) =>
      db.get(sql, values, (error, row) => (error ? reject(error) : resolve(row)))
    );
  const all = (sql, values = []) =>
    new Promise((resolve, reject) =>
      db.all(sql, values, (error, rows) => (error ? reject(error) : resolve(rows)))
    );
  let queue = Promise.resolve();
  if (metrics)
    Object.assign(metrics, {
      queued: 0,
      active: 0,
      peakQueued: 0,
      peakActive: 0,
      simulationCalls: 0,
      simulationEvents: 0
    });
  const serial = (work) => {
    if (metrics) {
      metrics.queued++;
      metrics.peakQueued = Math.max(metrics.peakQueued, metrics.queued);
    }
    const result = queue.then(async () => {
      if (metrics) {
        metrics.queued--;
        metrics.active++;
        metrics.peakActive = Math.max(metrics.peakActive, metrics.active);
      }
      try {
        return await work();
      } finally {
        if (metrics) metrics.active--;
      }
    });
    queue = result.catch(() => {});
    return result;
  };
  try {
    await exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS WinterSimPlayers (id TEXT PRIMARY KEY, envelope TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS WinterSimReceipts (playerId TEXT NOT NULL, commandId TEXT NOT NULL,
        payload TEXT NOT NULL, envelope TEXT NOT NULL, PRIMARY KEY(playerId,commandId));
      CREATE TABLE IF NOT EXISTS WinterSimCheckpoints (playerId TEXT NOT NULL, revision INTEGER NOT NULL,
        kind TEXT NOT NULL, fromAt INTEGER NOT NULL, throughAt INTEGER NOT NULL, delta TEXT NOT NULL,
        PRIMARY KEY(playerId,revision));`);
  } catch (error) {
    await new Promise((resolve) => db.close(resolve));
    throw error;
  }
  async function transaction(work) {
    await exec('BEGIN IMMEDIATE');
    try {
      const result = await work();
      await exec('COMMIT');
      return result;
    } catch (error) {
      await exec('ROLLBACK');
      throw error;
    }
  }
  async function step(id, at, command, apply) {
    timestamp(at);
    return transaction(async () => {
      if (command) {
        const receipt = await get(
          'SELECT * FROM WinterSimReceipts WHERE playerId=? AND commandId=?',
          [id, command.id]
        );
        if (receipt) {
          if (receipt.payload !== JSON.stringify(command.payload))
            throw Error('Simulation command identity mismatch.');
          return { done: true, envelope: JSON.parse(receipt.envelope) };
        }
      }
      const row = await get('SELECT envelope FROM WinterSimPlayers WHERE id=?', [id]);
      if (!row) throw Error('Unknown simulation player.');
      const envelope = JSON.parse(row.envelope),
        before = structuredClone(envelope);
      if (envelope.processing !== settings.id || envelope.state.ruleset !== config.id)
        throw Error('Checkpoint ruleset mismatch.');
      if (at < envelope.state.now) throw Error('Simulation clock moved backwards.');
      const onReturn = settings.returnPolicy === 'settle-all-on-return';
      const captured = onReturn
        ? settleReturnChunk(envelope, at, config, settings, metrics)
        : captureChunk(envelope, at, config);
      if (!captured && !command) return { done: true, envelope };
      const kind = captured ? 'capture' : 'command';
      if (!captured) {
        if (onReturn) envelope.lastActivityAt = at;
        else discard(envelope, at); // Historical discard candidate only.
        const result = apply(envelope.state, envelope, command.payload);
        if (result?.then) throw Error('Simulation commands must be synchronous.');
      }
      M.assertLedger(envelope.state, config);
      envelope.revision++;
      const delta = {
        creditedMs: envelope.creditedMs - before.creditedMs,
        discardedMs: envelope.discardedMs - before.discardedMs,
        ledger: Object.fromEntries(
          Object.keys(envelope.state.ledger).map((key) => [
            key,
            envelope.state.ledger[key] - before.state.ledger[key]
          ])
        )
      };
      const saved = JSON.stringify(envelope);
      await run('UPDATE WinterSimPlayers SET envelope=? WHERE id=?', [saved, id]);
      await run('INSERT INTO WinterSimCheckpoints VALUES (?,?,?,?,?,?)', [
        id,
        envelope.revision,
        kind,
        before.state.now,
        envelope.state.now,
        JSON.stringify(delta)
      ]);
      if (!captured)
        await run('INSERT INTO WinterSimReceipts VALUES (?,?,?,?)', [
          id,
          command.id,
          JSON.stringify(command.payload),
          saved
        ]);
      await beforeCommit({ kind, envelope });
      return { done: !captured, envelope };
    });
  }
  async function advance(id, at, command, apply) {
    let result;
    do {
      result = await step(id, at, command, apply);
      // Bound each simulation slice and let Discord/I/O callbacks run between
      // chunks, while the shared command queue preserves purchase ordering.
      if (!result.done && settings.returnPolicy === 'settle-all-on-return')
        await new Promise((resolve) => setImmediate(resolve));
    } while (!result.done);
    return result.envelope;
  }
  return {
    create: (id, seed, envelope = fresh(seed, config, settings)) =>
      serial(() =>
        transaction(async () => {
          M.assertLedger(envelope.state, config);
          await run('INSERT INTO WinterSimPlayers VALUES (?,?)', [id, JSON.stringify(envelope)]);
          return structuredClone(envelope);
        })
      ),
    read: (id) =>
      serial(async () => {
        const row = await get('SELECT envelope FROM WinterSimPlayers WHERE id=?', [id]);
        return row ? JSON.parse(row.envelope) : null;
      }),
    capture: (id, at) =>
      serial(() => {
        if (settings.returnPolicy === 'settle-all-on-return')
          throw Error('On-return mode has no background captures.');
        return advance(id, at);
      }),
    command: (id, at, commandId, payload, apply = () => {}) =>
      serial(() => {
        if (typeof commandId !== 'string' || !commandId)
          throw Error('Simulation command ID required.');
        return advance(id, at, { id: commandId, payload }, apply);
      }),
    // Explicit startup/reconnect catch-up. Longer gaps loop through committed
    // chunks; unfinished tails remain available for a later capture or discard.
    recover: (at) =>
      serial(async () => {
        if (settings.returnPolicy === 'settle-all-on-return') return 0;
        const rows = await all('SELECT id FROM WinterSimPlayers ORDER BY id');
        for (const row of rows) await advance(row.id, at);
        return rows.length;
      }),
    journal: (id) =>
      serial(() =>
        all('SELECT * FROM WinterSimCheckpoints WHERE playerId=? ORDER BY revision', [id])
      ),
    close: () =>
      serial(
        () =>
          new Promise((resolve, reject) => db.close((error) => (error ? reject(error) : resolve())))
      )
  };
}
module.exports = { processing, fresh, discard, captureChunk, settleReturnChunk, open };
