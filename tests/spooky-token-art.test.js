const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { pieces } = require('../services/spooky/config')
const { tokenImage, preparePayload, evidenceEmbeds } = require('../services/spooky/token-art')
const { actionMessages } = require('../services/spooky/presentation')

test('every nonempty ownership set maps to its shipped PNG, independent of input order', () => {
  const positions = ['tl', 'tr', 'bl', 'br']
  const names = new Set()
  for (const id of new Set(pieces.map(piece => piece.characterId))) {
    for (let mask = 1; mask <= 15; mask++) {
      const owned = positions.filter((_, bit) => mask & (1 << bit))
      const name = tokenImage(id, [...owned].reverse())
      names.add(name)
      const payload = preparePayload({ files: [{ tokenAsset: name, name }] })
      const bytes = fs.readFileSync(payload.files[0].attachment)
      assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
      assert.equal(tokenImage(id, [...owned, owned[0]]), name)
    }
    assert.equal(tokenImage(id, positions), `${id}_tl_tr_bl_br.png`)
    assert.equal(tokenImage(id, []), null)
  }
  assert.equal(names.size, 105)
  assert.equal(tokenImage('mrq', ['tr', 'bl']), 'mrq_tr_bl.png')
})

test('attachment resolution rejects arbitrary paths and leaves durable payload JSON portable', () => {
  const payload = { embeds: [{ image: { url: 'attachment://mrq_tr_bl.png' } }], files: [{ tokenAsset: 'mrq_tr_bl.png', name: 'mrq_tr_bl.png' }] }
  const original = JSON.stringify(payload)
  assert.ok(preparePayload(payload).files[0].attachment.endsWith('mrq_tr_bl.png'))
  assert.equal(JSON.stringify(payload), original)
  for (const files of [[{ tokenAsset: '../../config/dev.sqlite', name: '../../config/dev.sqlite' }], [{ tokenAsset: 'mrq_tr_bl.png', name: 'wrong.png' }], []]) assert.throws(() => preparePayload({ files }), /descriptor/)
  assert.throws(() => tokenImage('marq', ['tr']), /ownership/)
})

test('public reveal uses saved cumulative ownership; duplicate keeps circle, old award has single-piece fallback', () => {
  const base = { actorId: 'alice', members: [{ userId: 'alice', displayName: 'Alice' }], registeredIds: new Set(['alice']) }
  const piece = pieces.find(piece => piece.id === 'mrq_bl')
  const message = award => actionMessages({ result: { awards: [award] } }, base)[1].payload
  assert.equal(message({ ...piece, ownedPositions: ['tr', 'bl'] }).embeds[0].image.url, 'attachment://mrq_tr_bl.png')
  assert.equal(message({ ...piece, ownedPositions: ['tr', 'bl'], duplicate: true }).files[0].name, 'mrq_tr_bl.png')
  assert.equal(message(piece).files[0].name, 'mrq_bl.png')
  assert.equal(message({ ...piece, ownedPositions: ['tl', 'tr', 'bl', 'br'] }).files[0].name, 'mrq_tl_tr_bl_br.png')
  const complete = actionMessages({ result: { newlyCompletedCharacters: ['mrq'] } }, base).at(-1).payload
  assert.equal(complete.embeds[0].image.url, 'attachment://mrq_tl_tr_bl_br.png')
})

test('admin acknowledgement resolves attachment CDN URLs only against trusted matching filenames', () => {
  const payload = { files: [{ tokenAsset: 'mrq_tr_bl.png', name: 'mrq_tr_bl.png' }] }
  const evidence = { embeds: [{ image: { url: 'https://cdn.discordapp.com/example.png' } }], attachments: [{ name: 'mrq_tr_bl.png', url: 'https://cdn.discordapp.com/example.png' }] }
  assert.equal(evidenceEmbeds(payload, evidence)[0].image.url, 'attachment://mrq_tr_bl.png')
  assert.deepEqual(evidenceEmbeds(payload, { ...evidence, attachments: [] }), [])
  assert.notEqual(evidenceEmbeds(payload, { ...evidence, embeds: [{ image: { url: 'wrong' } }] })[0].image.url, 'attachment://mrq_tr_bl.png')
})
