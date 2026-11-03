// Diagnostic Pond. Weight is stored in tenths of a pound; RNG is independent.
const spots = {
  shallows: { label: 'Shallows', target: 3, escape: 0.1 },
  reeds: { label: 'Reeds', target: 4, escape: 0.15 },
  deep: { label: 'Deep Water', target: 5, escape: 0.2 }
};
function next(g) {
  let x = g.rng;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  g.rng = x >>> 0 || 1;
  return g.rng / 4294967296;
}
const pounds = (tenths) => (tenths / 10).toFixed(1);
function ensure(s) {
  const g = (s.garden ||= {
    phase: 'idle',
    rng: ((s.rng || 1) ^ 0xa511e9b3) >>> 0 || 1,
    held: 0,
    caught: 0,
    donated: 0,
    missed: 0,
    collection: {}
  });
  // Older Pond catches were not weighed. Preserve them without inventing weight.
  if (g.heldTenths === undefined) {
    g.heldTenths = 0;
    g.unweighedHeld = g.held || 0;
  }
  s.foodDonatedTenths ??= 0;
  if (g.phase === 'waiting' || g.phase === 'bite') g.phase = 'idle';
  return g;
}
function act(s, action, choice) {
  const g = ensure(s);
  if (action === 'garden-open')
    return g.phase === 'fight'
      ? 'Your fish is still on the line.'
      : 'Choose a spot and cast your line.';
  if (action === 'garden-cast') {
    if (g.phase !== 'idle') throw Error('Finish the current catch before casting again.');
    const spot = spots[choice];
    if (!spot) throw Error('Choose a fishing spot.');
    g.phase = 'fight';
    g.spot = choice;
    g.progress = 0;
    g.tension = 0;
    return `A fish bites in the ${spot.label}! Reel it in, but keep line tension below 6.`;
  }
  if (action === 'garden-reel') {
    if (g.phase !== 'fight') throw Error('Cast your line first.');
    g.tension += 2;
    if (g.tension > 5) {
      g.phase = 'idle';
      g.missed++;
      return 'The line snapped and the fish escaped!';
    }
    if (++g.progress < spots[g.spot].target) return 'You pulled the fish closer.';
    const roll = next(g),
      bonus = s.foodDonatedTenths >= 200 ? 0.1 : s.foodDonatedTenths >= 50 ? 0.05 : 0;
    const charChance = Math.min(0.75, { shallows: 0, reeds: 0.15, deep: 0.6 }[g.spot] + bonus);
    const fish =
      roll < charChance
        ? 'Arctic Char'
        : roll < charChance + (g.spot === 'shallows' ? 0.3 : g.spot === 'reeds' ? 0.55 : 0.3)
        ? 'Perch'
        : 'Trout';
    const range = { Trout: [10, 50], Perch: [5, 30], 'Arctic Char': [30, 100] }[fish];
    const weight = range[0] + Math.floor(next(g) * (range[1] - range[0] + 1));
    if (!Number.isSafeInteger(g.heldTenths + weight)) throw Error('Pond weight limit reached.');
    g.phase = 'idle';
    g.held++;
    g.caught++;
    g.heldTenths += weight;
    g.collection[fish] = (g.collection[fish] || 0) + 1;
    return `You caught ${
      fish === 'Arctic Char' ? 'an Arctic Char' : `a ${fish.toLowerCase()}`
    } that weighs ${pounds(weight)} lbs.`;
  }
  if (action === 'garden-slack') {
    if (g.phase !== 'fight') throw Error('Cast your line first.');
    if (!g.tension) throw Error('The line has no tension yet.');
    if (next(g) < spots[g.spot].escape) {
      g.phase = 'idle';
      g.missed++;
      return 'The fish escaped while the line was slack.';
    }
    g.tension = Math.max(0, g.tension - 3);
    return 'You eased the line without losing the fish.';
  }
  if (action === 'garden-donate') {
    if (!g.held) throw Error('Catch a fish before donating.');
    if (!Number.isSafeInteger(s.foodDonatedTenths + g.heldTenths))
      throw Error('Donation weight limit reached.');
    const weight = g.heldTenths,
      unweighed = g.unweighedHeld || 0;
    s.foodDonatedTenths += weight;
    g.donated += g.held;
    g.held = 0;
    g.heldTenths = 0;
    g.unweighedHeld = 0;
    return `You donated ${pounds(weight)} lbs to the Soup Kitchen.${
      unweighed ? ' Earlier catches were not weighed, so their weight is not included.' : ''
    }`;
  }
  throw Error('This Pond control has expired. Open the Pond again.');
}
module.exports = { act, spots, pounds };
