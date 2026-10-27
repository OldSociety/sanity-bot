const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { confirmationButtons } = require('../services/confirmation-controls')

test('shared confirmation controls are green Confirm left and red Cancel right with original action IDs', () => {
  const pair = confirmationButtons('accept-original-id', 'cancel-original-id').map(b => b.toJSON())
  assert.deepEqual(pair.map(b => [b.custom_id, b.label, b.style]), [['accept-original-id', 'Confirm', 3], ['cancel-original-id', 'Cancel', 4]])
})

test('Arena fighter picker follows confirmation policy without starting a fight', () => {
  const { screen } = require('../services/arena/interface')
  const { resolveCharacter } = require('../services/arena/characters')
  const payload = screen({ id: 'policy', revision: 0, character: resolveCharacter('maxim'), opponent: 'maxim', page: 'skins', level: 1, guildId: 'g' })
  const pair = payload.components.flatMap(r => r.toJSON().components).filter(b => /:confirmfighter$|:backcharacters$/.test(b.custom_id))
  assert.deepEqual(pair.map(b => [b.label, b.style]), [['Confirm', 3], ['Cancel', 4]])
})

test('achievement confirmation sites use the shared convention and Spooky keeps its already-correct pair', () => {
  const source = fs.readFileSync(path.join(__dirname, '../commands/Achievements/Achievements.js'), 'utf8')
  assert.match(source, /confirmationButtons\('confirm-delete', 'cancel-delete'\)/)
  assert.match(source, /confirmationButtons\('confirm-achievement', 'cancel-achievement'\)/)
  const { confirmationPayload } = require('../services/spooky/fate-confirmation')
  const { config } = require('../services/spooky/config')
  const payload = confirmationPayload({ id: 'policy', user: {} }, { candy: 0, eyes: 0, payment: { bankBefore: 20, bank: 10, fateBefore: 0, fatePoints: 0 } }, config)
  assert.deepEqual(payload.components[0].components.map(b => [b.label, b.style]), [['Confirm', 3], ['Cancel', 4]])
})
