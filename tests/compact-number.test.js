const test = require('node:test')
const assert = require('node:assert/strict')
const { compactNumber } = require('../services/compact-number')
const { screen } = require('../services/winter/presentation')

test('compact quantities start at one thousand without rounding up balances or thresholds', () => {
  for (const [value, expected] of [[0,'0'],[999,'999'],[1000,'1k'],[1250,'1.25k'],[1500,'1.5k'],[10000,'10k'],[999999,'999.99k'],[1000000,'1m'],[1000000000,'1b'],[1000000000000,'1t'],[1000000000000000,'1q'],[Number.MAX_SAFE_INTEGER,'9q']]) assert.equal(compactNumber(value),expected)
  assert.equal(compactNumber(-1250),'-1.25k')
  assert.throws(()=>compactNumber(1.5),/safe integer/)
})

test('all Winter resource footer amounts and the named gym use compact formatting', () => {
  const receipt={player:{userId:'p',snow:1000,snowballs:1250,diamonds:1000,tier:2,rock:0},progress:{snowballsUnlocked:1,diamondsUnlocked:1,dummyHp:0},kitchen:{spicyUnlocked:1,spicy:1000000},battle:{sturdyOwned:1,idleStarted:1,sweatUnlocked:1,sweat:1500,trainUnlocked:1}}
  for(const view of ['status','shop','train','kitchen','diamonds','shovel']) assert.equal(screen(receipt,view).embeds[0].toJSON().footer.text,'Available: 1k❄️ · 1m🔴 · 1k💎 · 1.5k💦')
  const gym=screen(receipt,'train').embeds[0].toJSON()
  assert.equal(gym.title,'Hendrix’s Gym 💪🏽')
  assert.match(gym.fields[0].value,/HP/)
})
