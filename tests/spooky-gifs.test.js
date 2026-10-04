const test = require('node:test'), assert = require('node:assert/strict')
const { withActionGif, pools } = require('../services/spooky/gifs')
const message = (publicResult = true, image) => [{ public: publicResult, payload: { embeds: [{ title: 'Halloween', ...(image ? { image } : {}) }] } }]
test('GIF rate is stable near 10%; committed selection never consumes gameplay randomness', () => {
  const receipt = { action: 'treat', outcome: 'standard_gift', result: { deliveredCandy: 1 } }
  let shown = 0
  for (let i = 0; i < 10000; i++) if (withActionGif(receipt, message(), { operationId: `discord:${i}` })[0].payload.embeds[0].image) shown++
  assert.ok(shown > 900 && shown < 1100, String(shown))
  const first = withActionGif(receipt, message(), { operationId: 'discord:stable', routinePercent: 100 })
  assert.deepEqual(withActionGif(receipt, message(), { operationId: 'discord:stable', routinePercent: 100 }), first)
  assert.match(first[0].payload.embeds[0].image.url, /^https:\/\/media\.giphy\.com\/media\/\w+\/giphy\.gif$/)
  assert.equal(withActionGif(receipt, message(), { operationId: 'discord:none', routinePercent: 0 })[0].payload.embeds[0].image, undefined)
})

test('successful Crown theft always uses Rihanna; private/error/art messages never receive it', () => {
  const receipt = { action: 'trick', outcome: 'steal_crown', result: { crownWon: true, crownStolenFrom: 'bob' } }
  const options = { operationId: 'discord:crown', routinePercent: 0, excludedIds: pools.steal_crown }
  assert.equal(withActionGif(receipt, message(), options)[0].payload.embeds[0].image.url, 'https://media.giphy.com/media/FrnpqArQZtti8/giphy.gif')
  assert.equal(withActionGif(receipt, message(false), options)[0].payload.embeds[0].image, undefined)
  const image = { url: 'attachment://badge.png' }
  assert.deepEqual(withActionGif(receipt, message(true, image), options)[0].payload.embeds[0].image, image)
  assert.equal(withActionGif({ ...receipt, result: { noEffect: 'failed' } }, message(), options)[0].payload.embeds[0].image, undefined)
})
test('recent channel GIFs are avoided using the root transaction and durable outbox', async () => {
  const { withRecentActionGif } = require('../services/spooky/gifs')
  const receipt = { action: 'treat', outcome: 'standard_gift', result: { deliveredCandy: 1 } }
  const recentIds = pools.standard_gift.slice(0, 2)
  const transaction = {}, ctx = { transaction }
  let queries = 0
  const models = { Notification: { findAll: async query => {
    queries++
    assert.equal(query.transaction, transaction)
    assert.deepEqual(query.where, { channelId: 'spooky-channel' })
    assert.equal(query.limit, 100)
    assert.deepEqual(query.order, [['id', 'DESC']])
    return recentIds.map(id => ({ status: 'pending', payload: { embeds: [{ image: { url: `https://media.giphy.com/media/${id}/giphy.gif` } }] } }))
  } } }
  const options = { operationId: 'discord:recent', routinePercent: 100 }
  const result = await withRecentActionGif(receipt, message(), options, { models, ctx, channelId: 'spooky-channel' })
  assert.ok(!recentIds.some(id => result[0].payload.embeds[0].image.url.includes(`/media/${id}/`)))
  assert.deepEqual(await withRecentActionGif(receipt, message(), options, { models, ctx, channelId: 'spooky-channel' }), result)
  assert.equal(queries, 2)
  await withRecentActionGif(receipt, message(), { ...options, routinePercent: 0 }, { models, ctx, channelId: 'spooky-channel' })
  await withRecentActionGif(receipt, message(false), options, { models, ctx, channelId: 'spooky-channel' })
  await withRecentActionGif(receipt, message(true, { url: 'attachment://badge.png' }), options, { models, ctx, channelId: 'spooky-channel' })
  assert.equal(queries, 2)
  assert.ok(Object.entries(pools).filter(([key]) => key !== 'steal_crown').every(([, pool]) => new Set(pool).size >= 4))
})

test('cancelled GIFs and non-GIF artwork do not occupy recent rotation slots', async () => {
  const { withRecentActionGif } = require('../services/spooky/gifs')
  const receipt = { action: 'treat', outcome: 'standard_gift', result: {} }
  const options = { operationId: 'discord:rotation', routinePercent: 100 }
  const ordinary = withActionGif(receipt, message(), options)
  const models = { Notification: { findAll: async () => [
    { status: 'cancelled', payload: ordinary[0].payload },
    { status: 'sent', payload: { embeds: [{ image: { url: 'attachment://badge.png' } }] } },
  ] } }
  assert.deepEqual(await withRecentActionGif(receipt, message(), options, { models, ctx: { transaction: {} }, channelId: 'channel' }), ordinary)
})
test('significant results share the rate; private messages, fallbacks and art keep their design', () => {
  for (const outcome of ['great_heist','sweet_tooth','curse_target','curse_spread','curse_backfire','break_curse']) {
    const receipt = { action: 'trick', outcome, result: { freedUserId: 'bob' } }
    const opts = { operationId: 'discord:important', routinePercent: 100 }
    assert.equal(withActionGif(receipt, message(), { ...opts, routinePercent: 0 })[0].payload.embeds[0].image, undefined)
    assert.ok(withActionGif(receipt, message(), opts)[0].payload.embeds[0].image)
    assert.equal(withActionGif(receipt, message(false), opts)[0].payload.embeds[0].image, undefined)
    assert.equal(withActionGif({ ...receipt, result: { noEffect: 'permission' } }, message(), opts)[0].payload.embeds[0].image, undefined)
    const art = { url: 'attachment://sel_tl_tr.png' }
    assert.deepEqual(withActionGif(receipt, message(true, art), opts)[0].payload.embeds[0].image, art)
  }
  const opts = { operationId: 'discord:acquisition', routinePercent: 100 }
  assert.equal(withActionGif({ awards: [{}] }, message(), opts)[0].payload.embeds[0].image, undefined)
  assert.equal(withActionGif({ action: 'treat', outcome: 'break_curse', result: { gifts: [{}] } }, message(), { ...opts, routinePercent: 0 })[0].payload.embeds[0].image, undefined)
  const pages = [...message(), ...message(true, { url: 'attachment://badge.png' })]
  assert.deepEqual(withActionGif({ action: 'treat', outcome: 'sweet_tooth' }, pages, opts)[1], pages[1])
  assert.ok(Object.values(pools).every(pool => pool.length && pool.every(id => /^[A-Za-z0-9]+$/.test(id))))
})


test('new variety outcomes reuse reviewed GIF pools, honor the10% budget and rotate recent assets', async () => {
 for (const outcome of ['candy_raid', 'bag_swap', 'bag_explosion', 'sticky_fingers', 'reverse_robbery', 'candy_ransom', 'boo', 'candy_shakedown', 'trick_chain', 'marked_for_mischief']) {
  const receipt = { action: 'trick', outcome, result: {} }, options = { operationId: 'discord:variety-' + outcome, routinePercent: 100 };
  const image = withActionGif(receipt, message(), options)[0].payload.embeds[0].image;
  assert.ok(image, outcome); assert.equal(withActionGif(receipt, message(), { ...options, routinePercent: 0 })[0].payload.embeds[0].image, undefined);
  const rotated = await require('../services/spooky/gifs').withRecentActionGif(receipt, message(), options, { models: { Notification: { findAll: async () => [{ status: 'pending', payload: { embeds: [{ image }] } }] } }, ctx: {}, channelId: 'channel' });
  assert.notEqual(rotated[0].payload.embeds[0].image.url, image.url);
 }
 const repaired = { action: 'treat', outcome: 'break_curse', result: { bagRepairedUserId: 'bob' } };
 const url = withActionGif(repaired, message(), { operationId: 'repair', routinePercent: 100 })[0].payload.embeds[0].image.url;
 assert.ok(pools.break_curse.some(id => url.includes('/' + id + '/')));
});
