const sqlite = require('sqlite3')
const { randomUUID } = require('node:crypto')

// Check-ins use environment-separated storage, never the player/economy DBs.
function createStore(filename = ':memory:') {
  const db = new sqlite.Database(filename)
  const run = (sql, ...args) => new Promise((resolve, reject) => db.run(sql, args, function(error) { error ? reject(error) : resolve({ changes: this.changes }) }))
  const all = (sql, ...args) => new Promise((resolve, reject) => db.all(sql, args, (error, rows) => error ? reject(error) : resolve(rows)))
  const one = async (sql, ...args) => (await all(sql, ...args))[0]
  const ready = new Promise((resolve, reject) => db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL, campaign TEXT NOT NULL,
      status TEXT NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS active_conversation ON submissions(owner)
      WHERE status IN ('INVITED','IN_PROGRESS');
    CREATE TABLE IF NOT EXISTS events (
      source TEXT PRIMARY KEY, submission TEXT NOT NULL, at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS deliveries (
      key TEXT PRIMARY KEY, submission TEXT NOT NULL, kind TEXT NOT NULL,
      destination TEXT NOT NULL, status TEXT NOT NULL, message TEXT,
      error TEXT, payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS occurrences (key TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS recipients (id TEXT PRIMARY KEY, occurrence TEXT NOT NULL, owner TEXT NOT NULL,
      data TEXT NOT NULL, UNIQUE(occurrence, owner));
  `, error => error ? reject(error) : resolve()))
  let tail = ready
  function serialized(work) { const result = tail.then(work); tail = result.catch(() => {}); return result }
  async function transaction(work) {
    await run("BEGIN IMMEDIATE")
    try { const result = await work(); await run("COMMIT"); return result }
    catch (error) { await run("ROLLBACK"); throw error }
  }
  const get = async id => {
    await ready
    const row = await one('SELECT data FROM submissions WHERE id=? UNION ALL SELECT data FROM recipients WHERE id=?', id, id)
    return row ? JSON.parse(row.data) : null
  }
  const put = record => run(`INSERT INTO submissions VALUES (?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET status=excluded.status, revision=excluded.revision, data=excluded.data`,
    record.id, record.owner, record.campaign, record.status, record.revision, JSON.stringify(record))
  const queue = async (record, kind, destination, payload, suffix = '') => {
    const key = `${record.id}:${kind}:${suffix}`
    await run('INSERT OR IGNORE INTO deliveries (key,submission,kind,destination,status,payload) VALUES (?,?,?,?,?,?)',
      key, record.id, kind, destination, 'pending', JSON.stringify(payload))
    return key
  }
  return {
    ready, get, queue, enqueue: (...args) => serialized(() => queue(...args)),
    list: async () => { await ready; return (await all("SELECT data FROM submissions ORDER BY rowid")).map(row => JSON.parse(row.data)) },
    create(input, source, invitation) {
      return serialized(() => transaction(async () => {
        const replay = await one('SELECT submission FROM events WHERE source=?', source)
        if (replay) return get(replay.submission)
        if (input.occurrenceKey) {
          const existing = (await all('SELECT data FROM submissions WHERE owner=?', input.owner)).map(r => JSON.parse(r.data))
            .find(r => r.occurrenceKey === input.occurrenceKey && !r.isTest)
          if (existing) return existing
        }
        const old = await one("SELECT id FROM submissions WHERE owner=? AND status IN ('INVITED','IN_PROGRESS')", input.owner)
        if (old) return get(old.id)
        const record = { ...input, id: randomUUID(), status: 'INVITED', revision: 0, question: 1, answers: {}, createdAt: Date.now() }
        await put(record)
        await run('INSERT INTO events VALUES (?,?,?)', source, record.id, Date.now())
        await queue(record, 'invite', `user:${record.owner}`, invitation(record))
        return record
      }))
    },
    async completedFor(owner, occurrenceKey) {
      await ready
      return (await all('SELECT data FROM submissions WHERE owner=?', owner)).map(r => JSON.parse(r.data))
        .some(r => !r.isTest && r.occurrenceKey === occurrenceKey && r.submittedAt && ['PENDING','ACCEPTED','DENIED'].includes(r.status))
    },
    async occurrence(key) { await ready; const row = await one('SELECT data FROM occurrences WHERE key=?', key); return row ? JSON.parse(row.data) : null },
    reserveOccurrence(record, recipients) {
      return serialized(() => transaction(async () => {
        if (await one('SELECT key FROM occurrences WHERE key=?', record.key)) return
        await run('INSERT INTO occurrences VALUES (?,?)', record.key, JSON.stringify(record))
        for (const recipient of recipients) await run('INSERT INTO recipients VALUES (?,?,?,?)', recipient.id, record.key, recipient.owner, JSON.stringify(recipient))
      }))
    },
    async recipients(key) { await ready; return (await all('SELECT data FROM recipients WHERE occurrence=?', key)).map(r => JSON.parse(r.data)) },
    async recipient(owner, key) { await ready; const row = await one('SELECT data FROM recipients WHERE occurrence=? AND owner=?', key, owner); return row ? JSON.parse(row.data) : null },
    reserveBackup(record, kind, payload, extendUntil) {
      return serialized(() => transaction(async () => {
        const primary = await one('SELECT status FROM deliveries WHERE key=?', `${record.id}:${kind}:`)
        if (primary && ['sent','sending','uncertain'].includes(primary.status)) return false
        if (await one('SELECT key FROM deliveries WHERE key=?', `${record.id}:${kind}:backup`)) return false
        if (kind === 'last-day' && extendUntil) {
          const current = await get(record.id)
          current.extendedClosesAt = extendUntil
          await run('UPDATE recipients SET data=? WHERE id=?', JSON.stringify(current), record.id)
          for (const row of await all('SELECT data FROM submissions WHERE owner=?', record.owner)) {
            const submission = JSON.parse(row.data)
            if (submission.isTest || submission.occurrenceKey !== record.occurrenceKey || submission.submittedAt) continue
            submission.closesAt = extendUntil
            submission.lateReminderExtension = true
            if (submission.status === 'EXPIRED') {
              submission.status = submission.expiredFrom || (submission.startedAt ? 'IN_PROGRESS' : 'INVITED')
              submission.needsResumePrompt = true
              delete submission.expiredFrom
            }
            await put(submission)
          }
        }
        await queue(record, kind, `user:${record.owner}`, payload, 'backup')
        return true
      }))
    },
    resumePrompt(id, render) {
      return serialized(() => transaction(async () => {
        const record = await get(id)
        if (!record?.needsResumePrompt || !['INVITED','IN_PROGRESS'].includes(record.status)) return record
        const kind = record.status === 'INVITED' ? 'invite' : 'prompt'
        await queue(record, kind, `user:${record.owner}`, render(record), kind === 'invite' && record.revision === 0 ? '' : String(record.revision))
        delete record.needsResumePrompt
        await put(record)
        return record
      }))
    },
    expire(now, { backupHold = false } = {}) {
      return serialized(() => transaction(async () => {
        for (const row of await all("SELECT data FROM submissions WHERE status IN ('INVITED','IN_PROGRESS')")) {
          const record = JSON.parse(row.data)
          if (record.isTest || !record.closesAt || now < record.closesAt) continue
          if (backupHold && record.lastDayBackupEndsAt && now < record.lastDayBackupEndsAt) {
            const primary = await one('SELECT status FROM deliveries WHERE key=?', `notice:${record.occurrenceKey}:${record.owner}:last-day:`)
            if (!primary || !['sent','sending','uncertain'].includes(primary.status)) continue
          }
          record.expiredFrom = record.status
          record.status = 'EXPIRED'; record.revision++
          await put(record)
          for (const delivery of await all("SELECT * FROM deliveries WHERE submission=? AND kind IN ('invite','prompt') AND status='sent'", record.id)) {
            await queue(record, 'prompt-clear', `user:${record.owner}`, { messageId: delivery.message }, delivery.message)
          }
        }
      }))
    },
    cleanupPrompts() {
      return serialized(() => transaction(async () => {
        for (const row of await all('SELECT data FROM submissions')) {
          const record = JSON.parse(row.data)
          for (const delivery of await all("SELECT * FROM deliveries WHERE submission=? AND kind IN ('invite','prompt') AND status='sent'", record.id)) {
            const current = delivery.kind === 'invite' ? record.status === 'INVITED' && delivery.key === `${record.id}:invite:${record.revision > 0 ? record.revision : ''}`
              : record.status === 'IN_PROGRESS' && delivery.key === `${record.id}:prompt:${record.revision}`
            if (!current) await queue(record, 'prompt-clear', `user:${record.owner}`, { messageId: delivery.message }, delivery.message)
          }
        }
      }))
    },
    change(id, revision, source, mutate) {
      return serialized(() => transaction(async () => {
        const record = await get(id)
        if (!record) throw Error('This check-in was not found.')
        if (await one('SELECT source FROM events WHERE source=?', source)) return record
        if (record.revision !== revision) throw Error('This prompt has changed. Use the most recent message or /checkin-test to resume.')
        record.revision++
        await mutate(record)
        await put(record)
        await run('INSERT INTO events VALUES (?,?,?)', source, id, Date.now())
        return record
      }))
    },
    async pending() { await ready; return all("SELECT * FROM deliveries WHERE status='pending' ORDER BY rowid") },
    claim(key) { return serialized(async () => (await run("UPDATE deliveries SET status='sending' WHERE key=? AND status='pending'", key)).changes === 1) },
    finish(key, status, message, error) {
      return serialized(() => run("UPDATE deliveries SET status=?,message=?,error=? WHERE key=? AND status='sending'", status, message || null, error || null, key))
    },
    recover() { return serialized(() => run("UPDATE deliveries SET status='uncertain',error='Interrupted send; inspect destination before retrying' WHERE status='sending'")) },
    async deliveries(id) { await ready; return all('SELECT key,kind,status,message,error FROM deliveries WHERE submission=?', id) },
    close() { return serialized(() => new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()))) },
  }
}
module.exports = { createStore }
