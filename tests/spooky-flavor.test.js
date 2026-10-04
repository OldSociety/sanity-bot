const test = require('node:test')
const assert = require('node:assert/strict')
const { actionMessages } = require('../services/spooky/presentation')
const { variant } = require('../services/spooky/flavor')

test('Fate rewards use the Fate/Bank/Total design with committed cap-aware transitions', () => {
  const context = { actorId: 'alice', members: [{ userId: 'alice', displayName: 'Alice' }], registeredIds: new Set(['alice']) }
  const render = result => actionMessages({ action: 'treat', outcome: 'sweet_tooth', result }, context)[0].payload.embeds[0]
  assert.deepEqual(render({ crownWon: true, awardedUserId: 'alice', fateBonus: 5, fatePoints: 100, bankBefore: 71, bank: 76 }).fields,
    [{ name: 'Fate', value: '100', inline: true }, { name: 'Bank', value: '71 → 76', inline: true }, { name: 'Total', value: '171 → 176', inline: true }])
  assert.equal(render({ fateBonus: 1, fatePoints: 100, bankBefore: 99, bank: 100 }).fields[1].value, '99 → 100')
  assert.equal(render({ fateBonus: 0, fateEligible: true, bankBefore: 100, bank: 100 }).fields[0].value, '100 → 100')
  assert.equal(render({ fateBonus: 1 }).fields, undefined)
})

test('Fate-funded quarter shows its bank deduction once across duplicate reveals', () => {
  const context = { actorId: 'alice', members: [{ userId: 'alice', displayName: 'Alice' }], registeredIds: new Set(['alice']) }
  const piece = require('../services/spooky/config').pieces[0]
  const messages = actionMessages({ bankSpent: 10, bankBefore: 71, bank: 61, fatePoints: 100, awards: [piece, piece] }, context)
  assert.equal(messages.length, 2)
  assert.equal(messages[0].payload.embeds[0].fields[1].value, '71 → 61')
  assert.equal(messages[1].payload.embeds[0].fields, undefined)
})

test('legacy treat variants keep recipient safety, committed balances and avatar', () => {
  const context = { actorId: 'alice', members: [{ userId: 'alice', displayName: 'Alice' }, { userId: 'bob', displayName: '@everyone <@123>' }],
    registeredIds: new Set(['alice', 'bob']), avatarURL: 'https://cdn.discordapp.com/avatars/123/avatar.png', timestamp: '2026-10-02T18:00:00.000Z' }
  const receipt = { action: 'treat', outcome: 'standard_gift', candy: 7, eyes: 2, result: { gifts: [{ userId: 'bob', candy: 1 }], deliveredCandy: 1 } }
  const titles = new Set()
  for (let i = 0; i < 20; i++) {
    const options = { ...context, variantKey: 'interaction-' + i }, messages = actionMessages(receipt, options)
    const payload = messages[0].payload
    titles.add(payload.embeds[0].title)
    assert.deepEqual(messages, actionMessages(receipt, options))
    assert.deepEqual(payload.allowedMentions.users, [])
    assert.equal(payload.content, undefined)
    assert.match(payload.embeds[0].description, /<@bob>/)
    assert.equal(payload.embeds[0].footer.text, 'Available: 🍬 7 • 🧿 2')
    assert.equal(payload.embeds[0].thumbnail.url, context.avatarURL)
    const unregistered = actionMessages(receipt, { ...options, registeredIds: new Set() })[0].payload
    assert.equal(JSON.stringify(unregistered).includes('@everyone'), false)
    assert.deepEqual(unregistered.allowedMentions.users, [])
  }
  assert.ok(titles.has('🍰 Cake of Kindness!'))
  assert.ok(titles.has('🍩 Donut Delivery!'))
  assert.equal(variant(['one', 'two'], 'same'), variant(['one', 'two'], 'same'))
})

test('crown fallback is playful and promises only the committed fate consolation', () => {
  const context = { actorId: 'alice', members: [{ userId: 'alice', displayName: 'Alice' }], registeredIds: new Set(['alice']) }
  const render = result => actionMessages({ action: 'treat', outcome: 'sweet_tooth', candy: 7, eyes: 2, result }, context)[0]
  const bonus = render({ noEffect: 'no_role_recipient', fateBonus: 1 })
  assert.equal(bonus.public, true)
  assert.match(bonus.payload.embeds[0].description, /Alice.*Sweet Tooth.*didn't fit/)
  assert.match(bonus.payload.embeds[0].description, /\+1 FATE POINT.*consolation prize/)
  assert.doesNotMatch(bonus.payload.embeds[0].description, /Banked fate bonus|No one could wear/)
  const full = render({ noEffect: 'no_role_recipient', fateBonus: 0, fateEligible: true, bank: 100 })
  assert.match(full.payload.embeds[0].description, /already full/)
  assert.doesNotMatch(full.payload.embeds[0].description, /\+1/)
  assert.doesNotMatch(render({ noEffect: 'no_role_recipient', fateBonus: 0, fateEligible: false }).payload.embeds[0].description, /FATE POINT/)
})

test('Eye finds and self rewards are public while unrewarded personal failures stay private', () => {
  const context = { actorId: 'alice', members: [{ userId: 'alice', displayName: 'Alice' }], registeredIds: new Set(['alice']) }
  for (const receipt of [{ action: 'treat', outcome: 'find_eye', result: {} },
    { action: 'trick', outcome: 'steal_or_find_eye', result: { found: 1 } },
    { action: 'treat', outcome: 'sweet_tooth', result: { awardedUserId: 'alice' } }]) {
    const message = actionMessages(receipt, context)[0]
    if (receipt.result.awardedUserId) assert.equal(message.payload.embeds[0].title, '🦷 SWEET TOOTH!')
    assert.equal(message.public, true); assert.deepEqual(message.payload.allowedMentions.users, [])
  }
  assert.equal(actionMessages({ action: 'treat', outcome: 'lost_candy', result: {} }, context)[0].public, false)
  const spell = actionMessages({ action: 'trick', outcome: 'curse_target', result: { noEffect: 'role_permission' } }, context)[0]
  assert.match(spell.payload.embeds[0].description, /jack-o'-lantern/)
  assert.doesNotMatch(JSON.stringify(spell.payload), /Misfire|could not reach|permission/)
})


test('caught and dropped outcomes vary cosmetically without changing the one-candy meaning or private visibility', () => {
 for (const outcome of ['caught_stealing', 'lost_candy']) {
  const titles = new Set();
  for (let i = 0; i < 30; i++) {
   const receipt = { action: outcome === 'lost_candy' ? 'treat' : 'trick', outcome, candy: 9, eyes: 0, result: { failure: outcome } };
   const ctx = { actorId: 'alice', members: [{ userId: 'alice', displayName: 'Alice' }], registeredIds: new Set(), variantKey: String(i) };
   const messages = actionMessages(receipt, ctx); titles.add(messages[0].payload.embeds[0].title);
   assert.equal(messages[0].public, false); assert.deepEqual(actionMessages(receipt, ctx), messages);
   assert.doesNotMatch(messages[0].payload.embeds[0].description, /Effect unavailable/);
   assert.match(messages[0].payload.embeds[0].footer.text, /9/);
  }
  assert.equal(titles.size, 3);
 }
});
