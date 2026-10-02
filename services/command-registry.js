const fs = require('node:fs'), path = require('node:path')
const inactiveFiles = Object.freeze(['commands/Daily/Daily.js', 'commands/Help/Help.js', 'commands/Slots/Slots.js'])
const namePattern = /^[-_\u02BC\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u
function validateDefinition(data) {
  const name = value => typeof value === 'string' && namePattern.test(value) && value === value.toLowerCase()
  const description = value => typeof value === 'string' && value.length >= 1 && value.length <= 100
  // The runtime dispatches chat-input interactions only. Other command types
  // need a dispatcher as well as a definition before they can enter this list.
  if (!data || (data.type ?? 1) !== 1 || !name(data.name) || !description(data.description)) throw new Error('Invalid chat-input command definition')
  function options(list = [], parent = 0) {
    if (!Array.isArray(list) || list.length > 25 || new Set(list.map(item => item?.name)).size !== list.length) throw new Error('Duplicate or excessive command options')
    const nested = list.some(item => [1, 2].includes(item?.type))
    if (nested && list.some(item => ![1, 2].includes(item?.type))) throw new Error('Subcommands cannot mix with value options')
    if (parent === 2 && (!list.length || list.some(item => item?.type !== 1))) throw new Error('Invalid subcommand group')
    if (parent === 1 && nested) throw new Error('Subcommands cannot nest')
    let optional = false
    for (const item of list) {
      if (!item || !Number.isInteger(item.type) || item.type < 1 || item.type > 11 || !name(item.name) || !description(item.description)) throw new Error('Invalid command option')
      if (![1, 2].includes(item.type)) {
        if (item.required !== undefined && typeof item.required !== 'boolean') throw new Error('Invalid required option flag')
        if (item.required && optional) throw new Error('Required options must precede optional options')
        if (!item.required) optional = true
        if (item.options !== undefined) throw new Error('Value options cannot nest')
      } else if (item.required !== undefined) throw new Error('Subcommands cannot be required options')
      if (item.choices !== undefined) {
        if (![3, 4, 10].includes(item.type) || !Array.isArray(item.choices) || item.choices.length > 25 || item.autocomplete === true) throw new Error('Invalid choices')
        for (const choice of item.choices) {
          if (!description(choice.name) || (item.type === 3 ? typeof choice.value !== 'string' || choice.value.length > 100
            : !Number.isFinite(choice.value) || Math.abs(choice.value) > Number.MAX_SAFE_INTEGER || (item.type === 4 && !Number.isSafeInteger(choice.value)))) throw new Error('Invalid choice value')
        }
      }
      options(item.options, item.type)
    }
  }
  options(data.options)
}
function inventory(entries, { strictInactive = false } = {}) {
  const active = entries.filter(item => !item.inactive)
  if (new Set(active.map(item => item.name)).size !== active.length) throw new Error('Duplicate command names would overwrite runtime handlers or fail registration')
  const inactive = entries.filter(item => item.inactive).map(item => item.file.replaceAll('\\', '/'))
  if (strictInactive && inactive.some(file => !inactiveFiles.includes(file))) throw new Error('Unreviewed inactive command export')
  return { active, inactive }
}
function commandFiles(root) {
  return fs.readdirSync(path.join(root, 'commands'), { withFileTypes: true }).filter(item => item.isDirectory())
    .flatMap(folder => fs.readdirSync(path.join(root, 'commands', folder.name)).filter(name => name.endsWith('.js')).map(name => `commands/${folder.name}/${name}`)).sort()
}
function commandEntry(command, file) {
  if (command && typeof command === 'object' && Object.keys(command).length === 0) return { file, inactive: true }
  if (!command?.data || typeof command.data.toJSON !== 'function' || typeof command.execute !== 'function') throw new Error(`Incomplete command export: ${file}`)
  const definition = command.data.toJSON()
  validateDefinition(definition)
  return { file, name: definition.name, definition, command }
}
function loadRegistry(root, load = file => require(path.join(root, file))) {
  return inventory(commandFiles(root).map(file => commandEntry(load(file), file)), { strictInactive: true })
}
module.exports = { validateDefinition, inventory, commandFiles, commandEntry, loadRegistry }
