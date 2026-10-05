const test = require('node:test'), assert = require('node:assert/strict'), sharp = require('sharp')
const { balanceLabels, renderProfileCard } = require('../services/profile-card')
const { sanityStage, eyeSvg, stages } = require('../services/sanity-eye')

test('birthday snapshots surround the committed capped Bank credit', async t => {
  const Sequelize = require('sequelize')
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => db.close())
  const User = require('../Models/User/User')(db, Sequelize.DataTypes)
  await User.sync()
  await User.create({ user_id: 'birthday', user_name: 'Birthday', bank: 63, fate_points: 100 })
  const credit = require('../services/fate-wallet').creditBank
  const result = await credit(User, 'birthday', 10, { withSnapshot: true })
  assert.equal(result.before.bank, 63); assert.equal(result.after.bank, 73)
  await result.user.update({ bank: 98 })
  const capped = await credit(User, 'birthday', 10, { withSnapshot: true })
  assert.equal(capped.before.bank, 98); assert.equal(capped.after.bank, 100)
  assert.equal(capped.after.fate_points, 100)
})
test('occasion arrows reflect actual changes and cap-limited awards, with no invented adjustments on normal profiles', () => {
  assert.deepEqual(balanceLabels({ fate_points: 100, bank: 73 }, { fate_points: 100, bank: 63 }, 'birthday'), { fate: '100', bank: '63 → 73', total: '163 → 173' })
  assert.equal(balanceLabels({ fate_points: 100, bank: 100 }, { bank: 100 }, 'birthday').bank, '100')
  assert.equal(balanceLabels({ fate_points: 100, bank: 63 }, { fate_points: 98, bank: 63 }, 'level-up').fate, '98 → 100')
  assert.equal(balanceLabels({ fate_points: 100, bank: 73 }, { bank: 63 }).bank, '73')
})
test('background eye uses exact requested thresholds and all five transparent overlays render independently', async () => {
  assert.equal(sanityStage({ balance: 100, maximum: 100 }), 'steady')
  assert.equal(sanityStage({ balance: 0, maximum: 100 }), 'lost')
  assert.throws(() => sanityStage({ balance: -1, maximum: 100 }), /Invalid/)
  for (const [balance, stage] of [[0,'lost'],[1,'waning'],[24,'waning'],[25,'fraying'],[49,'fraying'],[50,'fading'],[69,'fading'],[70,'steady'],[100,'steady']]) assert.equal(sanityStage({ balance, maximum: 100 }), stage)
  assert.equal(new Set(stages.map(stage => eyeSvg(stage))).size, 5)
  for (const stage of stages) {
    const output = await sharp(Buffer.from(eyeSvg(stage))).png().toBuffer()
    const metadata = await sharp(output).metadata()
    assert.equal(metadata.width, 240); assert.equal(metadata.height, 160); assert.equal(metadata.hasAlpha, true)
    const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true })
    assert.equal(data[info.channels - 1], 0)
  }
})
test('level-up and birthday cards retain dimensions, Unicode names and only owned badges with Sanity artwork', async () => {
  for (const occasion of ['level-up', 'birthday']) {
    const output = await renderProfileCard({ displayName: '🧙🏽‍♀️ Player', occasion, before: { chat_level: 27, fate_points: 100, bank: 63 },
      user: { chat_level: 28, chat_exp: 10, fate_points: 100, bank: 73 }, sanity: { balance: 25, maximum: 100 }, badges: [] })
    const metadata = await sharp(output).metadata(); assert.equal(metadata.width, 1200); assert.equal(metadata.height, 480)
  }
})

test('changing Sanity changes the background-eye area without changing landscape or wallet content below it', async () => {
  const shared = { displayName: 'Player', username: 'player', user: { chat_level: 28, fate_points: 100, bank: 63 }, badges: [] }
  const clear = await renderProfileCard({ ...shared, sanity: { balance: 100, maximum: 100 } })
  const hollow = await renderProfileCard({ ...shared, sanity: { balance: 0, maximum: 100 } })
  const lower = input => sharp(input).extract({ left: 0, top: 180, width: 1200, height: 300 }).raw().toBuffer()
  assert.deepEqual(await lower(clear), await lower(hollow))
  const eye = input => sharp(input).extract({ left: 924, top: 18, width: 240, height: 160 }).raw().toBuffer()
  assert.notDeepEqual(await eye(clear), await eye(hollow))
})
test('automatic artwork remains development-only and uses committed snapshots rather than reading a new Fate balance', async () => {
  const { createProfileNotification } = require('../services/profile-notification')
  let captured
  const options = { User: { sequelize: {} }, guildId: 'guild', badgeService: { details: async () => [] },
    download: async () => null, render: async input => { captured = input; return Buffer.from('png') } }
  const member = { id: 'alice', displayName: 'Alice', user: { username: 'alice' }, displayAvatarURL: () => null }
  const request = { guild: { id: 'guild' }, member, user: { bank: 73, fate_points: 100 }, before: { bank: 63, fate_points: 100 }, occasion: 'birthday', sanity: null }
  assert.equal(await createProfileNotification({ ...options, environment: 'production' })(request), null)
  assert.equal(captured, undefined)
  const payload = await createProfileNotification({ ...options, environment: 'development' })(request)
  assert.deepEqual(captured.user, request.user); assert.deepEqual(captured.before, request.before)
  assert.equal(payload.files[0].name, 'profile-birthday.png')
})
