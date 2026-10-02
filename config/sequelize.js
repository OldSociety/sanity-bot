const Sequelize = require('sequelize')
const { resolveRuntime } = require('./runtime')

module.exports = new Sequelize(resolveRuntime(process.env.NODE_ENV).database)
