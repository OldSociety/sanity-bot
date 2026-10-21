// Offline roster study. Copies only combat dependencies; never starts the bot.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
process.env.NODE_ENV = 'development'
const root = path.resolve(__dirname, '../..')
const directory = path.join(root, 'artifacts/arena-roster-2026-10-20')
const model = path.join(directory, 'model')
const checksum = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'))
const write = (p, data) => fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n')
function load(base) {
  const tactics = require(path.join(base, 'services/arena/tactics'))
  const combat = require(path.join(base, 'services/arena/combat'))
  const rules = require(path.join(base, 'services/arena/rules'))
  const { characters, isSelectable } = require(path.join(base, 'services/arena/characters'))
  const parity = require(path.join(base, 'scripts/arena/arena-parity-policy')).createPolicy(tactics)
  return { tactics, combat, rules, parity, roster: characters.filter(isSelectable) }
}
function warm(api) {
  for (const player of api.roster) for (const enemy of api.roster) {
    const b = api.combat.newBattle(6, { character: player, opponent: enemy.id })
    for (const slot of [null, 'special1', 'special2', 'special3'])
      api.tactics.preview(b.player, b.enemy, slot)
    api.tactics.decide(b.enemy, b.player, { roll: () => 99 })
  }
}
function interval(wins, n) {
  const z = 1.959963984540054, p = wins / n, d = 1 + z * z / n
  const c = (p + z * z / (2 * n)) / d
  const r = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
  return [(c - r) * 100, (c + r) * 100]
}
function fight(api, player, enemy, policy, trial) {
  let seed = (271828 + Math.imul(trial + 1, 2654435761)) >>> 0
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const pct = () => random() * 100
  const die = sides => () => 1 + Math.floor(random() * sides)
  let b = api.combat.newBattle(0, { character: player, opponent: enemy.id })
  const paid = { player: 0, enemy: 0 }, zero = { player: false, enemy: false }
  let ledgers = 0
  while (b.status === 'playing') {
    assert(b.tick < 1000, `Nonterminating ${player.label}/${enemy.label}/${trial}`)
    const special = side => Object.entries(b.statistics[side].damage).filter(([k]) => k.startsWith('special')).reduce((n, [,v]) => n + v, 0)
    const context = { rounds: b.tick, ownSpecialDamage: special('player'), opponentSpecialDamage: special('enemy') }
    const decision = (policy === 'native' ? api.tactics.decide : api.parity)(b.player, b.enemy, { context })
    const action = decision.slot === 'special3' ? { special3: true, choice: 3 } : decision.slot || 'basic'
    const next = api.combat.takeTurn(b, action, die(4), die(12), pct, () => Math.floor(pct()), () => Math.floor(pct()), pct,
      { rollRecovery: pct, rollFinisher: () => 35 + Math.floor(random() * 11), rollBlock: pct, rollResistance: pct })
    assert.notEqual(next, b, 'Rejected valid player action')
    const events = next.history.slice(b.history.length)
    for (const side of ['player', 'enemy']) {
      const f = next[side], s = next.statistics[side], other = side === 'player' ? 'enemy' : 'player'
      const label = side === 'player' && b.player.name === b.enemy.name ? 'Your ' + f.name : f.name
      paid[side] += events.filter(e => e.kind === 'sacrifice' && e.actor === label).reduce((n, e) => n + e.hp, 0)
      assert.equal(f.maxHp + s.hpRestored - next.statistics[other].hpDamage - paid[side], f.hp, 'HP ledger')
      assert.equal(f.maxStress - s.stressSpent + s.stressRecovered - s.stressRemovedTaken, f.stress, 'Stress ledger')
      assert.equal(s.initial + s.generated - s.spent, s.remaining, 'Duality ledger')
      assert.equal(s.remaining, side === 'player' ? f.hope : f.fear)
      assert.equal(Object.values(s.hpDamageBySource).reduce((n,v) => n + v, 0), s.hpDamage)
      assert(f.hp >= 0 && f.hp <= f.maxHp && f.stress >= 0 && f.stress <= f.maxStress)
      if (f.kit === 'hellfed-marq') assert(f.rage >= 0 && f.rage <= 3)
      else zero[side] ||= f.stress === 0
      assert.equal(s.criticals.special2, 0)
      assert.equal(s.criticals.special3, 0)
      ledgers++
    }
    b = next
  }
  assert(['victory', 'defeat'].includes(b.status), 'Unexpected fight outcome')
  return { b, ledgers, zero, hash: checksum(JSON.stringify(b)) }
}
function cohort(api, job, trials) {
  const player = api.roster.find(c => c.id === job.player)
  const enemy = api.roster.find(c => c.id === job.enemy)
  const row = { ...job, playerLabel: player.label, enemyLabel: enemy.label, fights: trials.length, wins: 0, rounds: 0, pacing: 0, ledgers: 0, histogram: {}, samples: {}, playerMetrics: {}, enemyMetrics: {} }
  const replayTrials = new Set([0, Math.floor(job.count / 2), job.count - 1])
  for (const trial of trials) {
    const { b, ledgers, zero, hash } = fight(api, player, enemy, job.policy, trial)
    row.wins += Number(b.status === 'victory')
    row.rounds += b.tick
    row.pacing += Number(b.tick >= 10 && b.tick <= 20)
    row.ledgers += ledgers
    row.histogram[b.tick] = (row.histogram[b.tick] || 0) + 1
    if (replayTrials.has(trial)) row.samples[trial] = hash
    for (const side of ['player', 'enemy']) {
      const s = b.statistics[side], f = b[side], metrics = row[side + 'Metrics']
      const values = { healing: s.hpRestored, hpRemaining: f.hp, stressSpent: s.stressSpent, zeroStressFight: Number(zero[side]),
        s1: s.uses.special1, s2: s.uses.special2, s3: s.uses.special3, dualitySpent: s.spent,
        basicDamage: s.damage.basic, specialDamage: s.damage.special1 + s.damage.special2 + s.damage.special3,
        wardPrevented: f.kylaxMetrics?.wardPrevented || 0, wallPrevented: s.selene?.wallDamagePrevented || 0 }
      for (const [k,v] of Object.entries(values)) metrics[k] = (metrics[k] || 0) + v
    }
  }
  row.winPercent = row.wins / row.fights * 100
  row.ci95 = interval(row.wins, row.fights)
  row.averageRounds = row.rounds / row.fights
  row.pacingPercent = row.pacing / row.fights * 100
  row.rangeStatus = row.winPercent >= 40 && row.winPercent <= 60 ? 'inside' : 'outside'
  row.evidenceStatus = row.ci95[0] > 60 || row.ci95[1] < 40 ? 'clearly-outside' : row.ci95[0] >= 40 && row.ci95[1] <= 60 ? 'clearly-inside' : 'boundary-uncertain'
  return row
}
async function main() {
  const mode = process.argv[2]
  if (mode === 'worker' || mode === 'replay') {
    const api = load(model), manifest = read(path.join(directory, 'manifest.json'))
    const index = Number(process.argv[3] || 0), rows = []
    const sourceCheck = () => {
      for (const [p,h] of Object.entries(manifest.hashes)) assert.equal(checksum(fs.readFileSync(path.join(model,p))), h, 'Frozen input changed: ' + p)
    }
    sourceCheck()
    for (const job of manifest.jobs.filter((_, i) => i % 4 === index)) {
      const trials = mode === 'replay' ? [0, Math.floor(job.count / 2), job.count - 1] : Array.from({ length: job.count }, (_,i) => i)
      const row = cohort(api, job, trials)
      rows.push(row)
      write(path.join(directory, `${mode}-${index}-progress.json`), rows)
      console.log(`${mode} ${index}: ${job.policy}: ${row.playerLabel} vs ${row.enemyLabel}: ${row.winPercent.toFixed(1)}% (${rows.length})`)
      sourceCheck()
    }
    write(path.join(directory, `${mode}-${index}.json`), rows)
    return
  }
  assert(!fs.existsSync(path.join(directory, 'manifest.json')), 'Report exists; use a new directory')
  fs.mkdirSync(directory, { recursive: true })
  const api = load(root)
  warm(api)
  const paths = Object.keys(require.cache).filter(p => p.startsWith(root + path.sep) && !p.includes(path.sep + 'node_modules' + path.sep) && p !== __filename)
  const extra = ['config/arena/arena-balance-production.json', 'config/arena/arena-builds-production.json']
  const relative = [...new Set([...paths.map(p => path.relative(root,p)), ...extra])]
  const hashes = {}
  for (const p of relative) {
    const bytes = fs.readFileSync(path.join(root,p))
    hashes[p] = checksum(bytes)
    fs.mkdirSync(path.dirname(path.join(model,p)), { recursive: true })
    fs.writeFileSync(path.join(model,p),bytes)
  }
  const jobs = []
  for (const [policy,count] of [['native',1000], ['cheapest-reliable',250]])
    for (const player of api.roster) for (const enemy of api.roster)
      jobs.push({ player: player.id, enemy: enemy.id, policy, count })
  const roster = api.roster.map(c => ({ id: c.id, label: c.label, kit: c.kit, stats: api.rules.statsForLevel(1,c.kit) }))
  write(path.join(directory, 'manifest.json'), { seed:271828, level:1, hashes, runnerHash:checksum(fs.readFileSync(__filename)), roster, jobs,
    rules:'Current development; native enemy tactical AI unmodified; start Hope/Fear0, native Stress/Rage; player Finisher choice3, native AI coefficient/range; no future RNG; full HP/Stress/Duality checks every turn.' })
  // Confirm that relocating the copied dependencies changes no combat results.
  const snapshot = load(model)
  for (const job of jobs.filter(j => j.policy === 'native')) {
    const p = api.roster.find(c => c.id === job.player), e = api.roster.find(c => c.id === job.enemy)
    const sp = snapshot.roster.find(c => c.id === job.player), se = snapshot.roster.find(c => c.id === job.enemy)
    assert.equal(fight(api,p,e,job.policy,0).hash, fight(snapshot,sp,se,job.policy,0).hash)
  }
  write(path.join(directory, 'snapshot-equivalence.json'), { exact:true, fights:49 })
  for (const stage of ['worker','replay']) {
    await Promise.all(Array.from({ length:4 }, (_,i) => new Promise((resolve,reject) => {
      const log = fs.openSync(path.join(directory, `${stage}-${i}.log`), 'a')
      const child = spawn(process.execPath,[__filename,stage,String(i)], { cwd:root, stdio:['ignore',log,log], windowsHide:true })
      child.on('error',reject)
      child.on('exit',code => { fs.closeSync(log); code === 0 ? resolve() : reject(Error(`${stage}-${i} exited ${code}`)) })
    })))
  }
  const rows = Array.from({length:4},(_,i) => read(path.join(directory,`worker-${i}.json`))).flat()
  const replay = Array.from({length:4},(_,i) => read(path.join(directory,`replay-${i}.json`))).flat()
  for (const row of rows) {
    const other = replay.find(r => r.policy === row.policy && r.player === row.player && r.enemy === row.enemy)
    assert.deepEqual(row.samples,other.samples,'Fresh-process replay mismatch')
  }
  for (const [p,h] of Object.entries(hashes)) assert.equal(checksum(fs.readFileSync(path.join(root,p))),h,'Original combat dependency changed during run: '+p)
  write(path.join(directory,'results.json'), { rows, fights:rows.reduce((n,r)=>n+r.fights,0), ledgers:rows.reduce((n,r)=>n+r.ledgers,0), replayPairs:rows.length*3, allReplayExact:true, originalInputsUnchanged:true })
  console.log('Complete. Frozen inputs, ledgers and fresh-process replays verified.')
}
main().catch(error => { console.error(error); process.exitCode=1 })
