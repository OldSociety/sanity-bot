const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const B = require('../../services/winter/battle'),
  G = require('../../services/winter/gym'),
  C = B.config;
const slotsRules = require('../../services/winter/slots');
const out = path.resolve(__dirname, '../../artifacts/winter-iron-progression-development-2026-10-27');
fs.mkdirSync(out, {
  recursive: true
});
function rng(seed) {
  let x = seed | 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}
function model(seed, levels = {}, outfit = false) {
  const state = B.freshBattle();
  Object.assign(state, {
    sturdyOwned: 1,
    trainUnlocked: 1,
    buttonsUnlocked: 1,
    emporiumUnlocked: 1,
    outfitOwned: Number(outfit),
    gym: {
      strength: 0,
      accuracy: 0,
      dodge: 0,
      speed: 0,
      ...levels
    },
    gymUnlocked: {
      strength: 1,
      accuracy: 1,
      dodge: 1,
      speed: 1
    }
  });
  const player = {
      snow: 0,
      remainder: 0,
      lastAccrual: 0,
      productionRate: C.stoneRate
    },
    kitchen = {
      spicy: 0
    },
    random = rng(seed),
    drop = rng(seed + 9000),
    slots = rng(seed + 19000);
  const ledger = {
    produced: 0,
    crafted: 0,
    slotsSpent: 0,
    ironSpent: 0,
    activeMs: 0,
    restarts: 0
  };
  function accrue(at) {
    at = Math.floor(at);
    const produced = (at - player.lastAccrual) * player.productionRate + player.remainder;
    const n = Math.floor(produced / 1000);
    player.snow += n;
    ledger.produced += n;
    player.remainder = produced % 1000;
    player.lastAccrual = at;
  }
  return {
    state,
    player,
    kitchen,
    random,
    drop,
    slots,
    ledger,
    accrue
  };
}
function combat(seed, levels, outfit, special) {
  const m = model(seed, levels, outfit);
  m.player.snow = 1e9;
  B.startBattle(m.state, 0);
  let now = 0;
  while (m.state.active && now < 7200000) {
    if (special && m.state.queue.length < m.state.queueCapacity) {
      if (!m.kitchen.spicy) {
        m.kitchen.spicy = 1;
        m.ledger.crafted++;
      }
      B.enqueue(m.state, 'spicy', m.kitchen);
    }
    now = Math.min(m.state.nextPlayerAt, m.state.nextEnemyAt, 7200000);
    B.advanceBattle(m.player, m.state, now, m.accrue, m.random, C, m.drop, false, m.kitchen);
  }
  const s = m.state,
    regular = m.ledger.produced + 1e9 - m.player.snow;
  return {
    victories: s.defeated,
    durationSeconds: now / 1000,
    censored: Boolean(s.active),
    sweatPerHour: s.sweat / (now / 3600000),
    snowPerHour: (regular + m.ledger.crafted * 100) / (now / 3600000),
    spicyPerHour: m.ledger.crafted / (now / 3600000)
  };
}
function progression(seed, hours, mixed) {
  const m = model(seed),
    s = m.state,
    p = m.player;
  let now = 0,
    ironAt = null,
    weightAt = null,
    outfitAt = null;
  for (let day = 0; day < 3; day++) {
    const start = day * 86400000,
      end = start + hours * 3600000;
    m.accrue(start);
    now = start;
    B.startBattle(s, now);
    while (now < end) {
      // A human chooses upgrades, re-enters after defeat in 60 seconds, and
      // attempts the 20 lb milestone. No gameplay parameter is auto-tuned.
      while (s.gym.strength < 20 && s.sweat >= s.gym.strength + 1) G.buyLevels(s, 'strength', '1');
      if (!s.weight20 && s.gym.strength >= 20 && s.sweat >= 50) {
        s.sweat -= 50;
        s.weight20 = 1;
        s.ironMaterial = 1;
        s.queueCapacity = 10;
        weightAt = now / 3600000;
      }
      if (!s.outfitOwned && p.snow > 1200000) {
        while (s.buttons < 100 && p.snow > 1000000) {
          p.snow -= 10000;
          m.ledger.slotsSpent += 10000;
          s.buttons += slotsRules.snowSpin(m.slots, C.snowSlotsRewards);
        }
        if (s.buttons >= 100) {
          s.buttons -= 100;
          s.outfitOwned = 1;
          outfitAt = now / 3600000;
        }
      }
      if (s.ironMaterial && !s.ironShovelOwned && p.snow >= C.ironSnowCost) {
        p.snow -= C.ironSnowCost;
        m.ledger.ironSpent += C.ironSnowCost;
        s.ironMaterial = 0;
        s.ironShovelOwned = 1;
        p.productionRate = C.ironRate;
        ironAt = now / 3600000;
      }
      if (!s.active) {
        now = Math.min(end, now + 60000);
        m.accrue(now);
        m.ledger.restarts++;
        B.startBattle(s, now);
      }
      if (mixed && s.throws % 4 === 0 && !s.queue.length && p.snow >= 100) {
        p.snow -= 100;
        m.kitchen.spicy++;
        m.ledger.crafted++;
        B.enqueue(s, 'spicy', m.kitchen);
      }
      const next = Math.min(s.nextPlayerAt, s.nextEnemyAt, end);
      if (next <= now && now === end) break;
      B.advanceBattle(p, s, next, m.accrue, m.random, C, m.drop, false, m.kitchen);
      m.ledger.activeMs += next - now;
      now = next;
    }
    if (s.active) {
      s.active = 0;
      s.phase = 'paused';
      s.pauseAt = now;
    }
  }
  m.accrue(72 * 3600000);
  return {
    ironHours: ironAt,
    weightHours: weightAt,
    outfitHours: outfitAt,
    sweat: s.sweat,
    strength: s.gym.strength,
    victories: s.defeated,
    snow: p.snow,
    ...m.ledger
  };
}
const mean = (a, key) => a.reduce((n, x) => n + x[key], 0) / a.length;
const scenarios = [['Untrained', {}, false], ['STR10', {
  strength: 10
}, false], ['STR20', {
  strength: 20
}, false], ['STR20 + outfit', {
  strength: 20
}, true], ['ACC20 isolated', {
  accuracy: 20
}, false], ['DGE20 isolated', {
  dodge: 20
}, false], ['SPD20 isolated', {
  speed: 20
}, false], ['All100 + outfit', {
  strength: 100,
  accuracy: 100,
  dodge: 100,
  speed: 100
}, true]];
const fights = [];
for (const [name, levels, outfit] of scenarios) for (const special of [false, true]) {
  const runs = Array.from({
    length: 100
  }, (_, i) => combat(314159 + i, levels, outfit, special));
  fights.push({
    name,
    special,
    n: 100,
    victories: mean(runs, 'victories'),
    durationSeconds: mean(runs, 'durationSeconds'),
    censored: runs.filter(x => x.censored).length,
    sweatPerHour: mean(runs, 'sweatPerHour'),
    snowPerHour: mean(runs, 'snowPerHour'),
    spicyPerHour: mean(runs, 'spicyPerHour')
  });
  console.log('Completed combat', name, special ? 'Spicy' : 'Regular');
}
const progressionResults = [];
for (const [name, hours] of [['Casual', .5], ['Regular', 3], ['Five-hour target check', 5], ['Highly active', 12]]) for (const mixed of [false, true]) {
  const runs = Array.from({
      length: 100
    }, (_, i) => progression(271828 + i, hours, mixed)),
    success = runs.filter(r => r.ironHours !== null).map(r => r.ironHours).sort((a, b) => a - b);
  progressionResults.push({
    name,
    hoursPerDay: hours,
    mixed,
    n: 100,
    ironBy72Hours: success.length,
    earliestIronHours: success[0] ?? null,
    medianIronHours: success.length ? success[Math.floor(success.length / 2)] : null,
    meanVictories: mean(runs, 'victories'),
    meanCraftedSpicy: mean(runs, 'crafted'),
    meanSnowAt72Hours: mean(runs, 'snow'),
    runs
  });
  console.log('Completed progression', name, mixed ? 'Mixed' : 'Regular');
}
const baseline = fights.find(r => r.name === 'Untrained' && !r.special).sweatPerHour;
const month = [];
for (const hours of [.5, 3, 12]) for (const rate of [1, 2, 3, 5, 8, 13]) {
  const perDay = baseline * hours * rate;
  month.push({
    hoursPerDay: hours,
    sweatPerVictory: rate,
    sweatPerDay: perDay,
    strength20Days: 210 / perDay,
    strength100Days: 5050 / perDay,
    all20Days: 840 / perDay,
    all100Days: 20200 / perDay,
    snow31Days: C.stoneRate * 86400 * 31
  });
}
const slotCounts = {
    0: 0,
    2: 0,
    5: 0,
    14: 0
  },
  slotRng = rng(98765);
let slotTotal = 0;
for (let i = 0; i < 100000; i++) {
  let x = slotRng() * 100;
  for (const r of C.snowSlotsRewards) {
    x -= r.weight;
    if (x < 0) {
      slotCounts[r.buttons]++;
      slotTotal += r.buttons;
      break;
    }
  }
}
const sourceHashes = Object.fromEntries(['services/winter/battle.js', 'services/winter/gym.js', 'config/winter/combat.json', 'services/winter/slots.js','services/winter/economy.js','scripts/winter/iron-balance.js'].map(p => [p, crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '../..', p))).digest('hex')]));
const result = {
  empiricalSlots: {
    spins: 100000,
    counts: slotCounts,
    meanButtons: slotTotal / 100000
  },
  seeds: [314159, 271828],
  combatSamples: 1600,
  progressionSamples: 800,
  censorSeconds: 7200,
  policy: 'Stone-start; casual 0.5h/day, regular 3h/day, highly active 12h/day; 60s restart delay; STR to20 then weight20; clothing slots spend only snow above1m; mixed queues one Spicy per four attempts; no balancing edits',
  fights,
  progression: progressionResults,
  month,
  slotProbabilities: C.snowSlotsRewards.map(r => ({
    ...r,
    probability: r.weight / 100
  })),
  expectedButtonsPerSpin: C.snowSlotsRewards.reduce((n, r) => n + r.buttons * r.weight / 100, 0),
  sourceHashes
};
fs.writeFileSync(path.join(out, 'simulation.json'), JSON.stringify(result, null, 2));
let report = '# Native Winter balance study\n\nAll simulations call the production Winter combat engine. 100 seeds per case. Survival is restricted to two hours; censored cases are not a claim of average time to death. Isolated ACC/DGE/SPD cases are controlled comparisons, not reachable untrained builds.\n\n|Build|Mode|Wins/run|Duration seconds (2h cap)|Censored /100|Sweat/h|Snow/h incl used ammo|Spicy/h|\n|---|---|---:|---:|---:|---:|---:|---:|\n';
for (const r of fights) report += '|' + [r.name, r.special ? 'Continuous Spicy' : 'Regular', r.victories.toFixed(2), r.durationSeconds.toFixed(1), r.censored, r.sweatPerHour.toFixed(2), r.snowPerHour.toFixed(0), r.spicyPerHour.toFixed(1)].join('|') + '|\n';
report += '\n## 72-hour Stone-to-Iron progression\n\nSessions begin at hours 0,24,48; snow accrues continuously. Milestone results are policy-dependent and conditional on already owning Stone. They do not include onboarding time. Median is among seeds reaching Iron by 72h, with completion fraction shown.\n\n|Activity|Mode|Iron by72h /100|Earliest hour|Median completed hour|Mean wins|Mean Spicy crafted|Snow at72h|\n|---|---|---:|---:|---:|---:|---:|---:|\n';
for (const r of progressionResults) report += '|' + [r.name, r.mixed ? 'Mixed' : 'Regular only', r.ironBy72Hours, r.earliestIronHours?.toFixed(2) ?? 'Not reached', r.medianIronHours?.toFixed(2) ?? 'Not reached', r.meanVictories.toFixed(1), r.meanCraftedSpicy.toFixed(1), r.meanSnowAt72Hours.toFixed(0)].join('|') + '|\n';
report += '\n## Slot payouts\n\n10,000 snow per spin. 0 Buttons:40%; 2:30%; 5:20%; 14:10%. Exact expectation=3 Buttons/spin. 100/3=33.33 spins is a rough average-cost estimate; overshoot and variance mean it is not an exact first-outfit stopping time.\n\n## Month projections\n\nThe JSON contains projections for 1,2,3,5,8,13 Sweat/victory using measured untrained regular-combat victory rate. These are linear comparisons, not invented future opponent stats or forecasts of trained builds. Stone generates 96,422,400 snow in31 days; Iron generates 578,534,400 before spending. See JSON for milestones and active hours.\n';
report += '\n## Regular-player month projection (3 active hours/day)\n\n|Sweat/victory|Sweat/day|STR20 days|STR100 days|All20 days|All100 days|\n|---:|---:|---:|---:|---:|---:|\n';
for (const r of month.filter(r => r.hoursPerDay === 3)) report += '|' + [r.sweatPerVictory, r.sweatPerDay.toFixed(1), r.strength20Days.toFixed(1), r.strength100Days.toFixed(1), r.all20Days.toFixed(1), r.all100Days.toFixed(1)].join('|') + '|\n';
report += '\nEmpirical Snow Slots: ' + slotTotal / 100000 + ' Buttons/spin over100,000 seeded spins; exact table expectation remains3. Combat comparisons assume sufficient stored snow and ammo. Continuous Spicy cases surviving the2h cap demonstrate a survival/resource concern, not proof of infinite survival. At100% hit,80 HP and10 damage, eight queued Spicy hits take24s and the enemy deals at most6 damage before a10HP victory heal. Queue refill requires human inputs. No values were tuned to obtain these results.\n';
fs.writeFileSync(path.join(out, 'balance.md'), report);
console.log(JSON.stringify({
  fights: fights.length,
  progression: progressionResults.map(({
    runs,
    ...r
  }) => r),
  expectedButtonsPerSpin: 3
}));
