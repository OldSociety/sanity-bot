const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { createHash } = require('node:crypto')
const fs = require('node:fs/promises')
const sharp = require('sharp')
const { createClickResponse } = require('../services/arena/click-response')
const {
  createMessageTransport,
} = require('../services/arena/message-transport')
const { createTiming } = require('../services/arena/timing')
const { measureRest, stopRestTiming } = require('../services/arena/rest-timing')
const { artFiles, framedArtFiles } = require('../services/arena/art')
const { resolveCharacter } = require('../services/arena/characters')
const { recapText } = require('../services/arena/battle-report')

test('deadline and result racing never send two initial callbacks', async () => {
  let guard, ack, release
  const calls = []
  const response = createClickResponse(
    {
      update: async (payload) => {
        calls.push(['update', payload])
        await new Promise((resolve) => {
          release = resolve
        })
      },
      editReply: async (payload) => {
        calls.push(['webhook', payload])
        return {}
      },
    },
    {
      locked: { components: [] },
      setTimer: (work) => {
        guard = work
        return 1
      },
      clearTimer() {},
    }
  )
  ack = guard()
  await new Promise((resolve) => setImmediate(resolve))
  const final = response.send({ content: 'result' }, () => {
    throw Error('bot fallback')
  })
  release()
  await ack
  await final
  assert.deepEqual(
    calls.map(([kind]) => kind),
    ['update', 'webhook']
  )
  response.cancel()
})

test('failed slow acknowledgement falls back to bot edit without reusing initial callback', async () => {
  let guard,
    callbacks = 0,
    botEdits = 0
  const response = createClickResponse(
    {
      update: async () => {
        callbacks++
        throw Error('offline')
      },
      editReply: async () => {
        throw Error('must not use unacknowledged webhook')
      },
    },
    {
      locked: {},
      setTimer: (work) => {
        guard = work
        return 1
      },
      clearTimer() {},
    }
  )
  await guard()
  await response.send({ content: 'result' }, async () => {
    botEdits++
    return {}
  })
  assert.equal(callbacks, 1)
  assert.equal(botEdits, 1)
  response.cancel()
})

test('already delayed interactions acknowledge immediately instead of waiting another guard interval', async () => {
  const calls = []
  const response = createClickResponse(
    {
      createdTimestamp: Date.now() - 2000,
      update: async () => {
        calls.push('ack')
      },
      editReply: async () => {
        calls.push('webhook')
      },
    },
    {
      locked: {},
      setTimer: () => {
        throw Error('must acknowledge now')
      },
    }
  )
  await response.send({}, () => {
    throw Error('unexpected fallback')
  })
  assert.deepEqual(calls, ['ack', 'webhook'])
  response.cancel()
})

test('callback without message metadata learns attachment IDs from the next click without fetching', async () => {
  let last
  const message = {
    id: 'm',
    attachments: new Map([['1', { id: '1', name: 'legend.png' }]]),
    edit: async (payload) => {
      last = payload
      return message
    },
  }
  const transport = createMessageTransport(message)
  await transport.send(
    {},
    [
      { name: 'card-a.png', attachment: Buffer.from('a') },
      { name: 'legend.png', attachment: Buffer.from('l') },
    ],
    {
      send: async (payload) => {
        last = payload
        return { interaction: {} }
      },
    }
  )
  assert.equal(last.files.length, 1)
  const fresh = {
    id: 'm',
    attachments: new Map([
      ['1', { id: '1', name: 'legend.png' }],
      ['2', { id: '2', name: 'card-a.png' }],
    ]),
  }
  transport.observe(fresh)
  await transport.send({}, [
    { name: 'card-b.png', attachment: Buffer.from('b') },
    { name: 'legend.png', attachment: Buffer.from('l') },
  ])
  assert.deepEqual(last.attachments, [{ id: '1', filename: 'legend.png' }])
  assert.equal(last.files[0].name, 'card-b.png')
})

test('REST phases count attempts and rate limits without saving URLs or tokens; concurrent scopes stay separate', async () => {
  const rest = new EventEmitter()
  const original = async (name) => {
    if (name === 'secret-one') rest.emit('rateLimited', { timeToReset: 20 })
    await new Promise((resolve) => setImmediate(resolve))
    return { status: 200 }
  }
  rest.options = { makeRequest: original }
  const a = createTiming({ logger: {}, sample: false }),
    b = createTiming({ logger: {}, sample: false })
  try {
    await Promise.all([
      measureRest(
        rest,
        async () => {
          await rest.options.makeRequest('secret-one')
          await rest.options.makeRequest('secret-one')
        },
        a
      ),
      measureRest(rest, () => rest.options.makeRequest('secret-two'), b),
    ])
    const first = a.finish(),
      second = b.finish()
    assert.equal(first.restAttempts, 2)
    assert.equal(first.restRateLimits, 2)
    assert.equal(first.restAdvertisedWaitMs, 40)
    assert.equal(second.restAttempts, 1)
    assert.equal(second.restRateLimits, 0)
    assert.ok(first.restHttpHeadersMs >= 0)
    assert.doesNotMatch(
      JSON.stringify([first, second]),
      /secret-one|secret-two/
    )
  } finally {
    stopRestTiming(rest)
  }
  assert.equal(rest.options.makeRequest, original)
})

test('selection pages reuse an identical portrait attachment name', () => {
  const character = resolveCharacter('marq')
  assert.equal(
    artFiles(character, 'maxim', 'characters')[0].name,
    artFiles(character, 'maxim', 'skins')[0].name
  )
})

test('selection banner is bounded to 800 pixels and original art stays unchanged', async () => {
  const character = resolveCharacter('marq')
  const source = artFiles(character, 'maxim', 'prefight')[0]
  const original = await fs.readFile(source.attachment)
  const hash = (buffer) => createHash('sha256').update(buffer).digest('hex')
  const [file] = await framedArtFiles(character, 'maxim', 'prefight')
  const meta = await sharp(file.attachment).metadata()
  assert.ok(meta.width <= 800)
  assert.ok(file.attachment.length < original.length)
  assert.equal(hash(await fs.readFile(source.attachment)), hash(original))
  assert.equal(file.name, source.name)
})

test('recap includes character-selection and navigation timings as well as rounds', () => {
  const battle = {
    tick: 0,
    status: 'quit',
    player: { name: 'A' },
    enemy: { name: 'B' },
    history: [],
  }
  const text = recapText(battle, [], {
    interactions: [
      { action: 'open', totalMs: 3000, renderMs: 40, deliveryMs: 2500 },
      {
        action: 'chooseskin',
        totalMs: 3100,
        responseMode: 'direct-update',
        restHttpHeadersMs: 3050,
      },
    ],
  })
  assert.match(text, /INTERACTION TIMINGS/)
  assert.match(text, /Character select: \(3000ms\)/)
  assert.match(text, /Choose skin: \(3100ms\)/)
  assert.ok(text.indexOf('INTERACTION TIMINGS') < text.indexOf('ROUND LOG'))
})
