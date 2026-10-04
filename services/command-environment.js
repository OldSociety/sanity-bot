function commandEnabled(command, environment) {
  return !command.environments || command.environments.includes(environment)
}
module.exports = { commandEnabled }
