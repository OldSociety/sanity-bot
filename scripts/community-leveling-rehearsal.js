async function rehearse() {
  const Sequelize = require('sequelize')
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  try {
    await require('../migrations/community-leveling').up(db.getQueryInterface())
    const models = require('../services/community-leveling/models').defineModels(db)
    const counts = Object.fromEntries(await Promise.all(Object.entries(models).map(async ([name, model]) => [name, await model.count()])))
    return { scope: 'isolated in-memory migration rehearsal', liveStorageOpened: false, counts }
  } finally { await db.close() }
}
if (require.main === module) rehearse().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1 })
module.exports = { rehearse }
