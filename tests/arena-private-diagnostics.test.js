// Fixed reports and mocked Discord only. No combat engine or live sends.
const test = require('node:test')
const assert = require('node:assert/strict')
const { createPrivateDiagnosticReporter } = require('../services/arena/private-diagnostics')
const { damageLabels } = require('../services/arena/damage-labels')
const { actionLines } = require('../services/arena/interface')
const { reportLines } = require('../services/arena/battle-report')
const settings = { enabled: true, guildId: 'guild', channelId: 'personal' }
function report() {
  return {
    sessionId: 'session', fightNumber: 1, ownerId: 'player', guildId: 'guild', channelId: 'public', messageId: 'message',
    battle: {
      status: 'victory', tick: 1, player: { name: 'Marq', hp: 58, maxHp: 230 }, enemy: { name: 'Maxim', hp: 0, maxHp: 220 },
      statistics: { player: { damage: { basic: 7 }, hpDamage: 7 }, enemy: {} },
      history: [
        { kind: 'roll', tick: 1, hope: 10, fear: 2, total: 12, success: true, withHope: true },
        { kind: 'hit', tick: 1, actor: 'Marq', target: 'Maxim', outcome: 'block', damage: 7, stressedTargetMultiplier: 1.25 },
      ],
    },
    roundTimings: { 1: { totalMs: 2076 } },
    interactionTimings: [{ action: 'basic', round: 1, totalMs: 2076, combatMs: 108, deliveryMs: 1931 }],
  }
}
function client({ publicChannel = false, failure = false } = {}) {
  const calls = [], everyone = {}, user = {}
  return { calls, user, channels: { fetch: async (id) => {
    calls.push(['fetch', id])
    return {
      guildId: 'guild', guild: { roles: { everyone } }, isTextBased: () => true,
      permissionsFor: (who) => ({ has: () => who === everyone ? publicChannel : true }),
      send: async (payload) => { calls.push(['send', payload]); if (failure) throw Error('offline') },
    }
  } } }
}
test('production sends a full final diagnostic only to the private channel', async () => {
  const bot = client(), saved = []
  const send = createPrivateDiagnosticReporter({ settings, environment: () => 'production', persist: async (r, text) => { saved.push(text); return {name:'report.txt'} } })
  assert.equal(await send(report(), bot), true)
  assert.equal(bot.calls[0][1], 'personal')
  const payload = bot.calls[1][1], text = payload.files[0].attachment.toString()
  assert.match(text, /PRIVATE ARENA DIAGNOSTIC/)
  assert.match(text, /🟡10 \+ 🟣2/)
  assert.match(text, /\(2076ms\)/)
  assert.match(text, /deliveryMs=1931/)
  assert.match(text, /final player-update timing is included/)
  assert.deepEqual(payload.allowedMentions, { parse: [] })
  assert.equal(saved[0], text)
})
test('development never persists or sends a private production report', async () => {
  const bot = client()
  const send = createPrivateDiagnosticReporter({ settings, environment: () => 'development', persist: () => { throw Error('must not persist') } })
  assert.equal(await send(report(), bot), false)
  assert.deepEqual(bot.calls, [])
})
test('public diagnostic destination is rejected and no public fallback is sent', async () => {
  const bot = client({ publicChannel: true }), saved = []
  const send = createPrivateDiagnosticReporter({ settings, environment: () => 'production', persist: async (r,text) => { saved.push(text); return { name:'report.txt' } } })
  await assert.rejects(send(report(), bot), /not private/)
  assert.equal(saved.length, 1)
  assert.equal(bot.calls.filter(([kind]) => kind === 'send').length, 0)
})
test('failed private delivery preserves the report and never sends elsewhere', async () => {
  const bot = client({ failure: true }), saved = []
  const send = createPrivateDiagnosticReporter({ settings, environment: () => 'production', persist: async (r,text) => { saved.push(text); return { name:'report.txt' } } })
  await assert.rejects(send(report(), bot), /offline/)
  assert.equal(saved.length, 1)
  assert.deepEqual(bot.calls.filter(([kind]) => kind === 'fetch').map(([,id])=>id), ['personal'])
})
test('damage labels use actual recorded blocks, bleed, exposure, criticals and resistance in both log modes', () => {
  const event = { kind:'hit', tick:1, actor:'Hendrix', target:'Maxim', damage:19, outcome:'hit',
    strikes:[{outcome:'block',bleed:2},{outcome:'critical',bleed:4}], stressedTargetMultiplier:1.25 }
  for (const diagnostic of [true,false]) {
    const text = reportLines([event], actionLines, {diagnostic}).join(' ')
    assert.match(text, /damage \(block, crit\) \(bleed\) \(exposed\)/)
  }
  assert.equal(damageLabels({outcome:'hit',damage:7}), '')
  const final = {kind:'special',tick:1,actor:'Selene',name:"Storm's Eye",slot:'special3',type:'playerFinisher',choice:5,percent:55,damage:89,resisted:true,stressedTargetMultiplier:1.25,resource:'Hope',cost:5}
  for (const diagnostic of [true,false])
    assert.match(reportLines([final],actionLines,{diagnostic}).join(' '), /damage \(exposed\) \(resisted\)/)
})
