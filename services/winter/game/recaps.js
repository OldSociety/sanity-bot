const { EmbedBuilder, escapeMarkdown } = require('discord.js');
const number = (value) => (value || 0).toLocaleString('en-US');
const resourceNames = {
  snow: 'Snow',
  diamonds: 'Diamonds',
  regular: 'Regular snowballs',
  red: 'Spicy snowballs',
  ice: 'Ice balls',
  sweat: 'Sweat',
  buttons: 'Buttons',
  peppers: 'Peppers'
};
const shovelNames = ['Hands', 'Wooden', 'Stone', 'Iron', 'Golden'];
const time = (ms) => {
  let seconds = Math.floor(Math.max(0, ms) / 1000);
  const days = Math.floor(seconds / 86400);
  seconds %= 86400;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;
  return [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}m`, `${seconds}s`]
    .filter(Boolean)
    .join(' ');
};
const unlocks = [
  ['wooden', 'Wooden shovel', 'wooden'],
  ['diamondGift', 'First diamond / Diamond Press', 'diamondGift'],
  ['roughOwned', 'Rough Snowman purchased', 'roughOwned'],
  ['redRecipe', 'Spicy recipe discovered', 'spicyRecipe'],
  ['oldStone', 'Old Stone purchased → Stone shovel / Chapter 1', 'stone'],
  ['gymUnlocked', 'Gym unlocked after first defeat', 'firstLoss'],
  ['gymEntered', 'Gym introduction / STR1 + 5 Sweat', 'gym'],
  ['ironMaterial', 'Iron lift material', 'ironMaterial'],
  ['iceRecipe', 'Ice recipe purchased', 'iceRecipe'],
  ['dirtyRecipeUnlocked', 'Dirty Snowball recipe discovered', 'dirtyRecipe'],
  ['emporiumIntroduced', 'Met Azule at the Emporium', 'emporiumIntro'],
  ['jacketOwned', 'Free jacket equipped — +50 HP', 'jacket'],
  ['fireFlowerOwned', 'Fire Flower purchased — 5 Spicy per fireball / 5× damage', 'fireFlower'],
  ['reinforcedJacketOwned', 'Reinforced jacket purchased — +50 maximum HP', 'reinforcedJacket'],
  ['soupKitchenOwned', 'Soup Kitchen fund supported', 'soupKitchen'],
  ['goldenIdolOwned', 'Golden Idol purchased', 'goldenIdol']
];
const milestoneNames = {
  nnorahc: "Secret character N'norah'c discovered",
  ...Object.fromEntries(
    Array.from({ length: 7 }, (_, i) => [
      `hiddenClue${i + 1}`,
      `Hidden message ${i + 1} discovered`
    ])
  ),
  chapter0: 'Chapter 0 complete',
  emporiumIntro: 'Met Azule at the Emporium',
  jacket: 'Free jacket equipped — +50 HP',
  fireFlower: 'Fire Flower purchased — 5 Spicy per fireball / 5× damage',
  reinforcedJacket: 'Reinforced jacket purchased',
  soupKitchen: 'Soup Kitchen fund supported',
  goldenIdol: 'Golden Idol purchased',
  goldenShovel: 'Golden Shovel purchased',
  strength3: 'Gym lessons complete — STR3',
  strength25: 'STR25 / Accuracy training available',
  iron: 'Iron shovel purchased',
  firstWinS1: 'First S1 victory',
  clearS1: '100 S1 victories',
  firstWinS2: 'First S2 victory',
  clearS2: '100 S2 victories',
  firstWinS3: 'First S3 victory',
  clearS3: '100 S3 victories',
  firstWinS4: 'First S4 victory',
  clearS4: '100 S4 victories',
  purchaseS4: 'S4 purchased',
  firstButton: 'First Button earned',
  purchaseS1: 'S1 purchased',
  purchaseS2: 'S2 unlocked',
  purchaseS3: 'S3 purchased / Chapter 1 complete'
};
function buildRecap(run, totals, logs, counts, displayName) {
  const baseline = run.baseline,
    final = run.state,
    timeline = new Map();
  const add = (key, name, at) => {
    if (!timeline.has(key)) timeline.set(key, { name, gameAt: at, realElapsedMs: at / run.speed });
  };
  // Milestones retain the exact simulated event time even if an absence was
  // settled much later. Snapshot diffs fill in legacy tutorial unlocks.
  const unlockName = (field, name, state) =>
    field === 'gymUnlocked' && state.liveRules
      ? 'Gym unlocked after first S1 victory'
      : field === 'gymEntered' && state.gymStarterFromVictory
      ? 'Gym introduction / STR1'
      : field === 'oldStone' && state.liveRules
      ? 'Old Stone purchased → Stone shovel'
      : name;
  for (const [key, name] of Object.entries(milestoneNames))
    if (baseline.milestones[key] === undefined && final.milestones[key] !== undefined)
      add(
        key,
        key === 'firstWinS1' && final.gymStarterFromVictory
          ? 'First S1 victory — 5 Sweat awarded'
          : name,
        final.milestones[key]
      );
  for (const log of logs) {
    const before = JSON.parse(log.beforeState),
      after = JSON.parse(log.afterState);
    for (const [field, name, key] of unlocks)
      if (!before[field] && after[field]) {
        const liveGym = field === 'gymUnlocked' && after.liveRules;
        add(
          liveGym ? 'gymUnlock' : key,
          unlockName(field, name, after),
          after.milestones[liveGym ? 'firstWinS1' : key] ?? after.now
        );
      }
    if (before.dummyHp > 0 && after.dummyHp === 0)
      add('dummy', 'Training dummy defeated', after.now);
    if (before.roughOwned && before.roughHp > 0 && after.roughHp === 0)
      add('rough', 'Rough Snowman defeated', after.now);
  }
  const inherited = unlocks
    .filter(([field]) => baseline[field])
    .map(([field, name]) => unlockName(field, name, baseline));
  if (baseline.tier === 3) inherited.unshift('Iron shovel');
  for (const tier of [1, 2, 3])
    if (baseline.owned[tier])
      inherited.push(`S${tier} owned (${number(baseline.tiers[tier]?.wins)} previous wins)`);
  return {
    ...totals,
    kind: 'run-ended',
    label: `WINTER-RUN-${String(run.id).padStart(6, '0')}`,
    userId: run.userId,
    displayName: displayName || run.userId,
    counts,
    startingBalances: baseline.wallet,
    start: {
      chapter: baseline.chapter,
      tier: baseline.tier,
      strength: baseline.strength,
      accuracy: baseline.accuracy
    },
    inherited,
    timeline: [...timeline.values()].sort((a, b) => a.gameAt - b.gameAt),
    end: {
      target: final.target,
      playerHp: final.playerHp,
      maxHp: require('./game').maxHp(final),
      enemyHp: final.enemyHp,
      penalized: final.penalized,
      dummyHp: final.dummyHp,
      roughHp: final.roughHp,
      roughOwned: final.roughOwned,
      owned: final.owned,
      equipped: final.equipped
    },
    tutorialDefeats: {
      dummy: baseline.dummyHp > 0 && final.dummyHp === 0 ? 1 : 0,
      rough:
        (!baseline.roughOwned || baseline.roughHp > 0) && final.roughOwned && final.roughHp === 0
          ? 1
          : 0
    }
  };
}
function recapMessage(run) {
  const status =
    {
      completed: 'Completed',
      stopped: 'Stopped manually',
      superseded: 'Ended when a new run started',
      reset: 'Reset by administrator'
    }[run.status] || run.status;
  const who = escapeMarkdown(run.displayName)
    .replace(/[\r\n]/g, ' ')
    .slice(0, 100);
  const embed = new EmbedBuilder()
    .setColor(run.status === 'completed' ? 0x2ecc71 : 0xe6a23c)
    .setTitle(`Winter Wars • Run #${run.run} • ${status}`)
    .setDescription(
      `**${who}** · Player ID: ${run.userId}\nBookmark: **${run.bookmark}** → stop point: **${
        run.stopAt
      }**\n**${time(run.realElapsedMs)} real** / **${time(run.gameElapsedMs)} game time**, at ${
        run.speed
      }× speed.\nStarted <t:${Math.floor(run.startedAt / 1000)}:F> · Ended <t:${Math.floor(
        run.endedAt / 1000
      )}:F>`
    )
    .setFooter({
      text: `${run.label} • Saved in SQLite • /snow diagnostic mode:export run:${run.run}`
    });
  const fields = [];
  const add = (name, value, inline = false) => {
    const lines = value.split('\n');
    let text = '',
      part = 1;
    for (const line of lines) {
      if (text.length + line.length + 1 > 1000 && text) {
        fields.push({ name: part === 1 ? name : `${name} (continued)`, value: text, inline });
        text = '';
        part++;
      }
      text += `${text ? '\n' : ''}${line}`;
    }
    fields.push({ name: part === 1 ? name : `${name} (continued)`, value: text || 'None', inline });
  };
  const resources = (values) =>
    Object.entries(resourceNames)
      .map(([key, name]) => `${name}: **${number(values[key])}**`)
      .join('\n');
  add('Resources supplied at the bookmark', resources(run.startingBalances), true);
  add('Resources gained during this run', resources(run.gained), true);
  add('Resources spent during this run', resources(run.spent), true);
  add('Resources remaining', resources(run.balances), true);
  add(
    'Where the progress came from',
    `Snow gathered: **${number(run.sources['gathering:snow:gained'])}**\nCombat Sweat: **${number(
      run.sources['combat:sweat:gained']
    )}**\nPassive Sweat: **${number(
      run.sources['passive:sweat:gained']
    )}**\nSweat spent training: **${number(
      run.sources['training:sweat:spent']
    )}**\nGains include currency conversions and tutorial gifts; supplied bookmark resources are excluded.`,
    true
  );
  add(
    'Progress made',
    `Shovel: **${shovelNames[run.start.tier]} → ${shovelNames[run.tier]}**\nStrength: **${
      run.start.strength
    } → ${run.strength}** · Accuracy: **${run.start.accuracy} → ${run.accuracy}**\nChapter: **${
      run.start.chapter
    } → ${run.chapter}**${run.chapter === 2 ? ' (Chapter 1 complete)' : ''}\n${
      run.end.owned[1]
        ? `Stopped fighting S${run.end.target}: player ${number(run.end.playerHp)}/${
            run.end.maxHp || 50
          } HP, snowman ${number(run.end.enemyHp)} HP.${
            run.end.penalized ? ' Defeat accuracy penalty active.' : ''
          }`
        : `Practice targets remaining: dummy ${run.end.dummyHp}/5 HP; Rough ${
            run.end.roughOwned ? `${run.end.roughHp}/50 HP` : 'not purchased'
          }.`
    }`
  );
  const combat = [];
  if (run.tutorialDefeats.dummy || run.tutorialDefeats.rough)
    combat.push(
      `Practice targets defeated: ${run.tutorialDefeats.dummy} dummy, ${run.tutorialDefeats.rough} Rough Snowman.`
    );
  for (const [tier, changes] of Object.entries(run.tierChanges)) {
    combat.push(
      `**S${tier}: ${number(changes.wins)} wins, ${number(
        changes.losses
      )} defeats** in this run (${number(run.tiers[tier].wins)} lifetime wins; level ${number(
        run.tiers[tier].wins + 1
      )}).`,
      `Throws: ${number(changes.attacks)} (${number(changes.hits)} hits). Used ${number(
        changes.regular
      )} regular / ${number(changes.red)} Spicy / ${number(
        changes.ice
      )} Ice. Enemy attacks: ${number(changes.enemyAttacks)} (${number(changes.enemyHits)} hits).`
    );
  }
  add('Enemies defeated and combat progress', combat.join('\n'));
  if (run.brown)
    add(
      'Brown snowballs and hidden messages',
      `Generated: **${number(run.brown.generated)}** · Thrown: **${number(
        run.brown.spent
      )}** · Remaining: **${number(run.brown.inventory)}**\nHidden messages discovered: **${
        run.brown.pieces
      }/7**`
    );
  if (run.garden)
    add(
      'Pond 🐟',
      `Food donated: **${((run.foodDonatedTenths || 0) / 10).toFixed(1)} lbs** · Fish held: **${(
        (run.garden.heldTenths || 0) / 10
      ).toFixed(1)} lbs**\n${
        Object.entries(run.garden.collection)
          .map(([name, count]) => `${name}: ${number(count)}`)
          .join(' · ') || 'No fish caught yet.'
      }`
    );
  add(
    'Unlocks and milestones — elapsed game / real time',
    run.timeline
      .map((e) => `**${time(e.gameAt)} / ${time(e.realElapsedMs)}** — ${e.name}`)
      .join('\n') || 'No new unlocks or milestones reached.'
  );
  if (run.inherited.length) add('Already unlocked at the bookmark', run.inherited.join(' · '));
  const grouped = new Map();
  for (const row of run.counts) {
    const key = `${row.kind === 'button' ? 'Button' : 'Command'} ${row.action}`;
    grouped.set(key, (grouped.get(key) || 0) + row.count);
  }
  add(
    'Player interactions',
    `${number(run.counts.reduce((n, row) => n + row.count, 0))} total, including ${number(
      run.counts.filter((r) => r.outcome !== 'ok').reduce((n, r) => n + r.count, 0)
    )} rejected/denied attempts.\n${[...grouped]
      .map(([name, count]) => `${name}: ${number(count)}`)
      .join('\n')}`
  );
  add(
    'Button response times · real milliseconds',
    require('./response-times').timingText(run.timings)
  );
  // Leave room for Discord's 6,000-character aggregate embed limit. With future
  // chapters, overflow continues in a readable attachment instead of failing the
  // public recap or dropping recorded history.
  const fullText = fields.map((f) => `${f.name}\n${f.value}`).join('\n\n');
  let length = embed.length;
  for (const field of fields) {
    if (length + field.name.length + field.value.length > 5700 || embed.data.fields?.length >= 24)
      break;
    embed.addFields(field);
    length += field.name.length + field.value.length;
  }
  const files = [];
  if ((embed.data.fields?.length || 0) < fields.length) {
    embed.addFields({
      name: 'Full readable recap',
      value:
        'The attached text file contains the complete recap, including all unlocks and interaction totals.'
    });
    files.push({
      attachment: Buffer.from(
        `${run.label} — ${run.displayName}\n${status}\nReal: ${time(
          run.realElapsedMs
        )} / Game: ${time(run.gameElapsedMs)}\n\n${fullText}`,
        'utf8'
      ),
      name: `${run.label}-recap.txt`
    });
  }
  return {
    content: `Winter Wars diagnostic recap | ${run.label} | Run #${run.run} | ${who} | Player ${run.userId} | ${status}`,
    embeds: [embed],
    files,
    allowedMentions: { parse: [] }
  };
}
module.exports = { buildRecap, recapMessage, time };
