const Sequelize = require('sequelize');
const config = require('./config.json')['development']; // Make sure it's the correct environment

const sequelize = new Sequelize({
  dialect: config.dialect,
  storage: config.storage,
});

module.exports = sequelize;
