// Development Brown supply and hidden recipe. Combat RNG is never consumed here.
const generationMs = 672000;
const pieceChance = 0.01;
const damageMultiplier = 1.5;
const recipe = Object.freeze([
  'eggplant',
  'garlic',
  'cherry',
  'avocado',
  'garlic',
  'avocado',
  'pepper'
]);
const clues = Object.freeze([
  'This recipe shows an Eggplant at one of the two ends.',
  'This recipe shows the first Avocado to the right of the Cherry.',
  'This recipe shows the Pepper to the right of the second Avocado.',
  'This recipe shows the Pepper to the right of the Eggplant.',
  'This recipe shows the second Avocado to the right of the second Garlic.',
  'This recipe shows the first Garlic to the left of the Cherry.',
  'This recipe shows the second Garlic to the right of the first Avocado.'
]);
const notice =
  'A hidden message was found in the dirt. Use the /snow hidden command to discover what it was.';
const identity = Object.freeze({
  generationMs,
  pieceChance,
  damageMultiplier,
  recipe,
  clues,
  reward: 'nnorahc'
});
function ensure(s) {
  return (s.brown ||= {
    inventory: 0,
    generated: 0,
    spent: 0,
    remainderMs: 0,
    pieces: 0,
    read: 0,
    rng: (s.rng ^ 0x85ebca6b) >>> 0 || 1
  });
}
function accrue(s, elapsed) {
  if (s.tier < 3 || elapsed <= 0) return;
  const b = ensure(s),
    total = b.remainderMs + elapsed,
    n = Math.floor(total / generationMs);
  if (!Number.isSafeInteger(b.inventory + n) || !Number.isSafeInteger(b.generated + n))
    throw Error('Brown supply limit reached.');
  b.inventory += n;
  b.generated += n;
  b.remainderMs = total % generationMs;
}
function spend(s) {
  const b = s.brown;
  if (!b || b.inventory < 1) throw Error('No Brown snowballs are available.');
  b.inventory--;
  b.spent++;
  // Fixed clue order, one roll per actual throw, including misses and immunity.
  if (b.pieces >= clues.length) return false;
  let x = b.rng;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  b.rng = x >>> 0;
  if (b.rng / 4294967296 >= pieceChance) return false;
  b.pieces++;
  s.milestones[`hiddenClue${b.pieces}`] ??= s.now;
  return true;
}
function messages(s) {
  const found = clues.slice(0, s.brown?.pieces || 0);
  if (!found.length) return 'No hidden messages have been found yet.';
  return (
    'The recipe has seven ingredients. “First” and “second” mean their order from left to right. “Left” and “right” do not have to mean immediately beside.\n\n' +
    found.map((clue, i) => `${i + 1}. ${clue}`).join('\n')
  );
}
function read(s) {
  if (s.brown) s.brown.read = s.brown.pieces;
  return messages(s);
}
function validate(s) {
  const b = s.brown;
  if (!b) return;
  for (const key of ['inventory', 'generated', 'spent', 'remainderMs', 'pieces', 'read', 'rng'])
    if (!Number.isSafeInteger(b[key]) || b[key] < 0) throw Error('Invalid Brown checkpoint.');
  if (
    b.inventory !== b.generated - b.spent ||
    b.remainderMs >= generationMs ||
    b.pieces > clues.length ||
    b.read > b.pieces ||
    b.rng > 0xffffffff
  )
    throw Error('Invalid Brown ledger or clues.');
}
module.exports = {
  generationMs,
  pieceChance,
  damageMultiplier,
  recipe,
  clues,
  notice,
  identity,
  ensure,
  accrue,
  spend,
  messages,
  read,
  validate
};
