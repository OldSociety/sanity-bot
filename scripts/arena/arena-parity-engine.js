// In-memory adapters for offline parity analysis. Never imported by the bot.
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
function compile(
  relative,
  replacements,
  sourceTransform = (_, source) => source,
) {
  const filename = path.resolve(__dirname, '..', relative)
  let source = fs.readFileSync(filename, 'utf8')
  for (const [before, after] of replacements) {
    // Keep adapters stable across formatting-only line wrapping.
    const pattern = new RegExp(
      before
        .replace(/\s+/g, '')
        .split('')
        .map((char) => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('\\s*'),
    )
    if (!pattern.test(source))
      throw Error(`Parity adapter anchor missing: ${relative}: ${before}`)
    source = source.replace(pattern, () => after)
  }
  const instance = new Module(filename, module)
  instance.filename = filename
  instance.paths = Module._nodeModulePaths(path.dirname(filename))
  require.cache[filename] = instance
  instance._compile(sourceTransform(relative, source), filename)
  return instance.exports
}
function setup({
  policyDecorator = (policy) => policy,
  attackOutcomes,
  sourceTransform,
} = {}) {
  const build = (relative, replacements) =>
    compile(relative, replacements, sourceTransform)
  const loader = require('../../services/arena/balance-config')
  const balance = loader.loadBalance('development')
  if (attackOutcomes === false) delete balance.attackOutcomes
  loader.loadBalance = () => structuredClone(balance)
  // All four enemies now have native development combat support. Offline work
  // adapts only policy choice and any explicitly requested experimental payload.
  build('services/arena/rules.js', [])
  build('services/arena/damage.js', [])
  const tactics = build('services/arena/tactics.js', [
    [
      "!(fighter.kit === 'hellfed-marq' && slot && !definition?.rollBasic)",
      '!(!fighter.isAI && slot && !definition?.rollBasic)',
    ],
    [
      'of branches(fighter)) {',
      'of branches(definition?.guaranteedBasic && fighter.isAI ? { ...fighter, accuracy: 100 } : fighter)) {',
    ],
    [
      'if (actor.isAI) {\n    // Preserve',
      'if (false) {\n    // Offline: both roles use the same deterministic fallback.\n    // Preserve',
    ],
  ])
  const { createPolicy } = require('./arena-parity-policy')
  const policy = policyDecorator(createPolicy(tactics))
  tactics.decide = policy
  const combat = build('services/arena/combat.js', [])
  return { combat, policy, tactics, balance }
}
module.exports = { setup }
