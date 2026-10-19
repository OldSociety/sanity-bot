process.env.NODE_ENV = process.argv[2]
const path = require('node:path')
const root = path.resolve(process.argv[3] || path.join(__dirname, '../..'))
const fromRoot = require('node:module').createRequire(
  path.join(root, 'package.json')
)
const { characters, isSelectable } = fromRoot('./services/arena/characters')
const { newBattle, takeTurn } = fromRoot('./services/arena/combat')
const { balance } = fromRoot('./services/arena/rules')
const { roster } = fromRoot('./services/arena/selection')
const { availableOpponents } = fromRoot('./services/arena/opponents')
const { screen } = fromRoot('./services/arena/interface')
const { cardData } = fromRoot('./services/arena/health-card')
const fighters = characters.filter(isSelectable),
  states = [],
  views = [],
  cards = []
for (const character of fighters)
  for (const opponent of fighters) {
    const b = newBattle(6, { character, opponent: opponent.id })
    b.player.hp = 100
    b.player.stress = b.player.maxStress ? 3 : 0
    b.player.basicHits = 20
    b.player.focusHits = 20
    b.enemy.hp = 150
    b.enemy.stress = b.enemy.maxStress ? 3 : 0
    b.enemy.fear = 5
    if (b.player.maxRage) b.player.rage = 2
    if (b.enemy.maxRage) b.enemy.rage = 2
    const session = {
      id: 'parity',
      revision: 0,
      character,
      opponent: opponent.id,
      level: 1,
      manualOpponentSelection: true,
    }
    views.push(screen(session))
    cards.push(cardData({ ...session, battle: b }))
    for (const action of ['basic', 'special1', 'special2', 'special3'])
      for (const dice of [
        [8, 4],
        [1, 2],
        [6, 6],
      ]) {
        let i = 0,
          j = 0
        states.push(
          takeTurn(
            structuredClone(b),
            action === 'special3' ? { special3: true, choice: 3 } : action,
            () => [2, 1][j++ % 2],
            () => dice[i++ % dice.length],
            () => 0,
            () => (dice[0] === 1 ? 99 : 0),
            () => (dice[0] === 6 ? 0 : 99),
            () => 0,
            {
              aiPolicy: 'legacy',
              rollRecovery: () => 99,
              rollFinisher: () => 40,
            }
          )
        )
      }
  }
const normalize = (value) =>
  typeof value === 'string'
    ? value.replaceAll(root, '<ROOT>')
    : Array.isArray(value)
    ? value.map(normalize)
    : value && typeof value === 'object'
    ? Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, normalize(v)])
      )
    : value
process.stdout.write(
  JSON.stringify(
    normalize({
      balance,
      fighters: fighters.map((c) => c.id),
      families: roster.map((c) => c.id),
      opponents: availableOpponents().map((c) => c.id),
      states,
      views,
      cards,
    })
  ).replaceAll('production-current-2-5', 'development-2-5')
)
