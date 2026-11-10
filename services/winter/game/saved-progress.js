const { Transaction } = require('sequelize');
const { serialize } = require('../../spooky/economy');
const { randomBytes, randomUUID } = require('node:crypto');
const M = require('./game');
const { buildRecap } = require('./recaps');
const { isAdminAction } = require('./admin');
const { columns: timingColumns, aggregateSql } = require('./response-times');
const tutorial = require('./tutorial');
const { unavailable } = require('./dialogue');
const clone = (value) => JSON.parse(JSON.stringify(value));
const balances = (state) => ({
  ...state.wallet,
  sweat: state.wallet.sweat + (state.gymLessonReserve || 0)
});
function difference(a, b) {
  const result = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
    result[key] = (b[key] || 0) - (a[key] || 0);
  return result;
}
function summary(run) {
  const s = run.state,
    base = run.baseline;
  return {
    run: run.id,
    status: run.status,
    bookmark: run.bookmark,
    stopAt: run.stopAt,
    speed: run.speed,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    realElapsedMs: (run.endedAt ?? run.updatedAt) - run.startedAt,
    gameElapsedMs: s.now,
    chapter: s.chapter,
    milestones: s.milestones,
    gained: difference(base.ledger.gained, s.ledger.gained),
    spent: difference(base.ledger.spent, s.ledger.spent),
    sources: difference(base.ledger.sources, s.ledger.sources),
    balances: balances(s),
    spendableSweat: s.wallet.sweat,
    reservedSweat: s.gymLessonReserve || 0,
    net: difference(balances(base), balances(s)),
    snowRemainder: s.snowRemainder,
    sweatRemainder: s.sweatRemainder,
    tiers: s.tiers,
    tierChanges: Object.fromEntries(
      Object.entries(s.tiers).map(([tier, values]) => [
        tier,
        difference(base.tiers[tier] || {}, values)
      ])
    ),
    ...(s.brown ? { brown: clone(s.brown) } : {}),
    strength: s.strength,
    accuracy: s.accuracy,
    tier: s.tier,
    maxHp: M.maxHp(s),
    jacketOwned: Boolean(s.jacketOwned),
    fireFlowerOwned: Boolean(s.fireFlowerOwned),
    ...(s.garden ? { garden: clone(s.garden), foodDonatedTenths: s.foodDonatedTenths || 0 } : {}),
    fingerprint: s.fingerprint
  };
}
function createStore({
  sequelize,
  clock = Date.now,
  seed = () => randomBytes(4).readUInt32LE(0),
  beforeCommit = async () => {}
}) {
  let initialized;
  async function initialize() {
    if (!initialized)
      initialized = serialize(sequelize, () =>
        sequelize.transaction({ type: Transaction.TYPES.IMMEDIATE }, async (transaction) => {
          const sql = [
            `CREATE TABLE IF NOT EXISTS WinterPlaytestTimings (interactionId TEXT PRIMARY KEY,runId INTEGER NOT NULL REFERENCES WinterPlaytestRuns(id),guildId TEXT NOT NULL,userId TEXT NOT NULL,kind TEXT NOT NULL,action TEXT NOT NULL,outcome TEXT NOT NULL,queueMs REAL NOT NULL,ackMs REAL NOT NULL,engineMs REAL NOT NULL,renderMs REAL NOT NULL,deliveryMs REAL NOT NULL,totalMs REAL NOT NULL)`,
            'CREATE INDEX IF NOT EXISTS WinterPlaytestTimingsRun ON WinterPlaytestTimings(runId,kind,action)',
            'CREATE TABLE IF NOT EXISTS WinterPlaytestProfiles (guildId TEXT NOT NULL,userId TEXT NOT NULL,state TEXT NOT NULL,anchor INTEGER NOT NULL,PRIMARY KEY(guildId,userId))',
            'CREATE TABLE IF NOT EXISTS WinterPlaytestCharacterUnlocks (guildId TEXT NOT NULL,userId TEXT NOT NULL,characterId TEXT NOT NULL,unlockedAt INTEGER NOT NULL,runId INTEGER,PRIMARY KEY(guildId,userId,characterId))',
            `CREATE TABLE IF NOT EXISTS WinterPlaytestRuns (id INTEGER PRIMARY KEY AUTOINCREMENT,guildId TEXT NOT NULL,userId TEXT NOT NULL,status TEXT NOT NULL,
          startedAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL,endedAt INTEGER,speed INTEGER NOT NULL,bookmark TEXT NOT NULL,stopAt TEXT NOT NULL,
          reportMinutes INTEGER NOT NULL,channelId TEXT NOT NULL,lastReportAt INTEGER NOT NULL,state TEXT NOT NULL,baseline TEXT NOT NULL,configuration TEXT NOT NULL,result TEXT)`,
            'CREATE INDEX IF NOT EXISTS WinterPlaytestRunsOwner ON WinterPlaytestRuns(guildId,userId,id)',
            'CREATE TABLE IF NOT EXISTS WinterPlaytestSessions (guildId TEXT NOT NULL,userId TEXT NOT NULL,runId INTEGER REFERENCES WinterPlaytestRuns(id),PRIMARY KEY(guildId,userId))',
            `CREATE TABLE IF NOT EXISTS WinterPlaytestInteractions (id TEXT PRIMARY KEY,runId INTEGER REFERENCES WinterPlaytestRuns(id),guildId TEXT NOT NULL,userId TEXT NOT NULL,
          at INTEGER NOT NULL,receivedAt INTEGER NOT NULL,kind TEXT NOT NULL,action TEXT NOT NULL,request TEXT NOT NULL,outcome TEXT NOT NULL,beforeState TEXT,settledState TEXT,afterState TEXT,deltas TEXT,response TEXT NOT NULL)`,
            'CREATE INDEX IF NOT EXISTS WinterPlaytestInteractionsRun ON WinterPlaytestInteractions(runId,at)',
            `CREATE TABLE IF NOT EXISTS WinterPlaytestCheckpoints (id INTEGER PRIMARY KEY AUTOINCREMENT,runId INTEGER REFERENCES WinterPlaytestRuns(id),
          guildId TEXT NOT NULL,userId TEXT NOT NULL,at INTEGER NOT NULL,gameAt INTEGER NOT NULL,cause TEXT NOT NULL,state TEXT NOT NULL)`,
            `CREATE TABLE IF NOT EXISTS WinterPlaytestOutbox (id INTEGER PRIMARY KEY AUTOINCREMENT,runId INTEGER NOT NULL REFERENCES WinterPlaytestRuns(id),
          guildId TEXT NOT NULL,channelId TEXT NOT NULL,status TEXT NOT NULL,payload TEXT NOT NULL,error TEXT)`
          ];
          for (const statement of sql) await sequelize.query(statement, { transaction });
        })
      ).catch((error) => {
        initialized = null;
        throw error;
      });
    return initialized;
  }
  function parse(row) {
    return row
      ? { ...row, state: JSON.parse(row.state), baseline: JSON.parse(row.baseline) }
      : null;
  }
  async function execute(input) {
    for (const field of ['guildId', 'userId', 'id', 'action'])
      if (typeof input[field] !== 'string' || !input[field]) throw Error(`Missing ${field}.`);
    await initialize();
    return serialize(sequelize, () =>
      sequelize.transaction({ type: Transaction.TYPES.IMMEDIATE }, async (transaction) => {
        const query = async (sql, bind = {}) =>
          (await sequelize.query(sql, { bind, transaction }))[0];
        const getCounts = (id) =>
          query(
            `SELECT kind,action,outcome,COALESCE(json_extract(request,'$.raw.customId'),action) AS control,COUNT(*) AS count
        FROM WinterPlaytestInteractions WHERE runId=$id AND kind!='system' GROUP BY kind,action,outcome,control`,
            { id }
          );
        const identity = { guild: input.guildId, user: input.userId };
        const ownedCharacters = await query(
          'SELECT characterId FROM WinterPlaytestCharacterUnlocks WHERE guildId=$guild AND userId=$user',
          identity
        );
        const request = JSON.stringify({
          action: input.action,
          quantity: input.quantity ?? null,
          diagnostic: input.diagnostic ?? null,
          admin: input.admin === true,
          raw: input.raw ?? null,
          expectedRun: input.expectedRun ?? null,
          kind: input.kind || 'slash',
          denied: input.denied || null
        });
        const prior = (
          await query('SELECT * FROM WinterPlaytestInteractions WHERE id=$id', { id: input.id })
        )[0];
        if (prior) {
          if (
            prior.guildId !== input.guildId ||
            prior.userId !== input.userId ||
            prior.request !== request
          )
            throw Error('Interaction replay identity mismatch.');
          const cached = JSON.parse(prior.response);
          if (cached.exportRunId) {
            const saved = parse(
              (
                await query(
                  'SELECT * FROM WinterPlaytestRuns WHERE id=$id AND guildId=$guild AND userId=$user',
                  { ...identity, id: cached.exportRunId }
                )
              )[0]
            );
            cached.export = {
              run: saved,
              interactions: await query(
                'SELECT * FROM WinterPlaytestInteractions WHERE runId=$id ORDER BY at,id',
                { id: saved.id }
              ),
              checkpoints: await query(
                'SELECT * FROM WinterPlaytestCheckpoints WHERE runId=$id ORDER BY id',
                { id: saved.id }
              ),
              counts: await getCounts(saved.id)
            };
            cached.export.timings = await query(
              'SELECT * FROM WinterPlaytestTimings WHERE runId=$run ORDER BY interactionId',
              { run: saved.id }
            );
          }
          return cached;
        }
        const now = clock();
        if (!Number.isSafeInteger(now) || now < 0) throw Error('Invalid real clock.');
        const session = (
          await query(
            'SELECT * FROM WinterPlaytestSessions WHERE guildId=$guild AND userId=$user',
            identity
          )
        )[0];
        let run = session?.runId
          ? parse(
              (
                await query('SELECT * FROM WinterPlaytestRuns WHERE id=$id', { id: session.runId })
              )[0]
            )
          : null;
        if (
          input.expectedRun !== undefined &&
          String(input.expectedRun) !== String(run?.id ?? 'normal')
        )
          input = { ...input, denied: 'These controls belong to another test. Open /snow status.' };
        if (isAdminAction(input.action) && input.admin !== true)
          input = { ...input, denied: 'Development administrators only.' };
        let message = input.denied || null,
          outcome = input.denied ? 'denied' : 'ok',
          s,
          before,
          settled;
        let displayAction = null,
          tutorialView = null,
          redirected = false;
        let diagnostic = input.diagnostic;
        let mode = input.action === 'diagnostic' ? diagnostic?.mode : null;
        let resetFromRun = null;
        if (!input.denied && input.action === 'restart-confirm') {
          const profile = run
            ? run.state
            : JSON.parse(
                (
                  await query(
                    'SELECT state FROM WinterPlaytestProfiles WHERE guildId=$guild AND userId=$user',
                    identity
                  )
                )[0]?.state || 'null'
              );
          if (!profile?.restartToken || input.quantity !== profile.restartToken) {
            input = {
              ...input,
              denied: 'This reset confirmation expired. Open /snow admin and choose Reset again.'
            };
            message = input.denied;
            outcome = 'rejected';
          } else if (run) {
            resetFromRun = run.id;
            mode = 'start';
            diagnostic = {
              mode: 'start',
              speed: run.speed,
              bookmark: 'chapter0',
              stopAt: run.stopAt,
              reportMinutes: run.reportMinutes,
              channelId: run.channelId
            };
          }
        }
        if (!input.denied && mode === 'start') {
          const d = diagnostic;
          const invalid =
            ![1, 2, 5].includes(d.speed) ||
            !M.settings.bookmarks[d.bookmark] ||
            !M.settings.stopPoints.includes(d.stopAt) ||
            !Number.isInteger(d.reportMinutes) ||
            d.reportMinutes < 0 ||
            d.reportMinutes > 1440 ||
            !d.channelId
              ? 'Invalid diagnostic settings.'
              : d.bookmark === 's3' && d.stopAt !== 'none'
              ? 'The S3 diagnostic uses manual stop.'
              : d.stopAt === 'stone' && d.bookmark !== 'chapter0'
              ? 'The Stone stop point requires the Chapter 0 bookmark.'
              : d.stopAt === 'iron' && d.bookmark === 'iron'
              ? 'The Iron bookmark has already reached the Iron stop point.'
              : null;
          if (invalid) {
            input = { ...input, denied: invalid };
            message = invalid;
            outcome = 'rejected';
          }
        }
        const endedRuns = [];
        const finish = (r, status) => {
          r.status = status;
          r.endedAt = now;
          r.updatedAt = now;
          r.state.active = false;
          endedRuns.push(r);
        };
        const saveRun = async (r) => {
          await query(
            `UPDATE WinterPlaytestRuns SET status=$status,updatedAt=$updated,endedAt=$ended,state=$state,result=$result,lastReportAt=$report WHERE id=$id`,
            {
              id: r.id,
              status: r.status,
              updated: r.updatedAt,
              ended: r.endedAt,
              state: JSON.stringify(r.state),
              result: JSON.stringify(summary(r)),
              report: r.lastReportAt
            }
          );
        };
        const advance = (r) => {
          if (r.status === 'active') {
            M.settle(r.state, Math.max(r.state.now, (now - r.startedAt) * r.speed));
            r.updatedAt = now;
          }
        };
        if (!input.denied && mode === 'start') {
          const d = diagnostic;
          if (run && resetFromRun) delete run.state.restartToken;
          if (run?.status === 'active') {
            advance(run);
            finish(run, resetFromRun ? 'reset' : 'superseded');
            await saveRun(run);
          } else if (run && resetFromRun) await saveRun(run);
          s = M.fresh(d.bookmark, seed());
          s.liveRules = true;
          if (d.bookmark === 'chapter0') s.tutorialFlow = 2;
          if (d.bookmark === 'chapter1') {
            s.gymUnlocked = true;
            s.gymEntered = true;
            s.strength = 3;
            s.owned[1] = true;
            s.tiers[1].wins = 1;
            s.enemyHp = M.enemy(s).hp;
            s.milestones.firstWinS1 = 0;
            s.milestones.gym = 0;
            s.milestones.strength3 = 0;
          }
          if (d.bookmark !== 'chapter0') s.spicyShopGiftClaimed = true;
          await query(
            `INSERT INTO WinterPlaytestRuns (guildId,userId,status,startedAt,updatedAt,endedAt,speed,bookmark,stopAt,reportMinutes,channelId,lastReportAt,state,baseline,configuration)
          VALUES ($guild,$user,'active',$now,$now,NULL,$speed,$bookmark,$stopAt,$minutes,$channel,$now,$state,$state,$configuration)`,
            {
              ...identity,
              now,
              speed: d.speed,
              bookmark: d.bookmark,
              stopAt: d.stopAt,
              minutes: d.reportMinutes,
              channel: d.channelId,
              state: JSON.stringify(s),
              configuration: JSON.stringify({
                rules: M.rules,
                settings: M.settings,
                emporium: M.emporium,
                s4: M.s4,
                bookmarks: require('../../../config/winter/testing/bookmarks.json'),
                fingerprint: M.fingerprint
              })
            }
          );
          const id = (await query('SELECT last_insert_rowid() AS id'))[0].id;
          await query(
            'INSERT INTO WinterPlaytestSessions (guildId,userId,runId) VALUES ($guild,$user,$id) ON CONFLICT(guildId,userId) DO UPDATE SET runId=excluded.runId',
            { ...identity, id }
          );
          run = {
            id,
            guildId: input.guildId,
            userId: input.userId,
            state: s,
            baseline: clone(s),
            status: 'active',
            startedAt: now,
            updatedAt: now,
            endedAt: null,
            speed: d.speed,
            bookmark: d.bookmark,
            stopAt: d.stopAt,
            reportMinutes: d.reportMinutes,
            channelId: d.channelId,
            lastReportAt: now,
            configuration: {
              rules: M.rules,
              settings: M.settings,
              emporium: M.emporium,
              s4: M.s4,
              bookmarks: require('../../../config/winter/testing/bookmarks.json'),
              fingerprint: M.fingerprint
            }
          };
          before = clone(s);
          settled = clone(s);
          message = resetFromRun
            ? `Run #${resetFromRun} was saved. New Run #${id} starts fresh at Chapter 0.`
            : `Diagnostic Run #${id} started.`;
        } else {
          if (run) s = run.state;
          else {
            const profile = (
              await query(
                'SELECT * FROM WinterPlaytestProfiles WHERE guildId=$guild AND userId=$user',
                identity
              )
            )[0];
            s = profile ? JSON.parse(profile.state) : M.fresh('chapter0', seed());
            s.profileAnchor = profile?.anchor ?? now;
          }
          before = clone(s);
          if (!input.denied && (!run || run.status === 'active')) {
            s.liveRules = true;
            // Chapter pauses belong to diagnostic runs, including older saves.
            if (!run && s.chapter0Pending && s.oldStone) {
              s.chapter0Pending = false;
              s.chapter = Math.max(1, s.chapter);
              s.tutorialStage = null;
            }
            if (!s.oldStone && s.chapter === 0) s.tutorialFlow = 2;
            if (s.tutorialFlow === 2 && !s.oldStone && s.gymEntered && !s.tutorialStage) {
              s.tutorialStage = s.strength >= 3 ? 'stone' : 'gym';
              s.active = false;
            }
            if (!s.gymUnlocked && s.tiers[1].wins > 0) {
              s.gymUnlocked = true;
              if (s.tutorialFlow === 2) {
                s.tutorialStage = s.gymEntered && s.strength >= 3 ? 'stone' : 'gym';
                s.active = false;
              }
            }
            if (s.tutorialFlow === 2 && s.gymUnlocked && !s.gymEntered && !s.tutorialStage) {
              s.tutorialStage = 'gym';
              s.active = false;
            }
          }
          if (!input.denied) {
            if (run) advance(run);
            else {
              M.settle(s, s.now + Math.max(0, now - s.profileAnchor));
              s.profileAnchor = now;
            }
          }
          settled = clone(s);
          if (!input.denied) {
            try {
              if (mode) {
                if (!['status', 'stop', 'review', 'export'].includes(mode))
                  throw Error('Unknown diagnostic mode.');
                if (mode === 'stop') {
                  if (!run || run.status !== 'active') throw Error('No active diagnostic run.');
                  finish(run, 'stopped');
                  message = `Run #${run.id} stopped and saved.`;
                } else if (!run && !input.diagnostic?.runId)
                  message = 'No diagnostic run yet. Start from a bookmark to begin.';
              } else if (isAdminAction(input.action)) {
                if (input.action === 'admin')
                  message = 'Development testing controls for your own Winter profile.';
                else if (input.action === 'restart') {
                  s.restartToken = randomUUID();
                  message =
                    'Reset your development Winter profile to Chapter 0? Diagnostic history will be preserved.';
                } else if (input.action === 'restart-cancel') {
                  if (!s.restartToken || input.quantity !== s.restartToken)
                    throw Error('This reset prompt expired. Open /snow admin.');
                  delete s.restartToken;
                  message = 'Reset cancelled.';
                } else if (input.action === 'restart-confirm') {
                  s = M.fresh('chapter0', seed());
                  s.profileAnchor = now;
                  message =
                    'Your development profile has been reset to Chapter 0 with 10 snow. Use /snow throw to begin.';
                } else {
                  if (run && run.status !== 'active')
                    throw Error(
                      'This test is finished. Reset or start a new run before adding resources.'
                    );
                  if (input.action === 'grant-sweat') M.change(s, 'sweat', 100, 'admin-grant');
                  if (input.action === 'grant-snow')
                    M.change(s, 'snow', M.rate(s) * 3600, 'admin-grant');
                  if (input.action === 'grant-ammo')
                    for (const type of ['regular', 'red', 'ice'])
                      M.change(s, type, 10, 'admin-grant');
                  M.validate(s);
                  message =
                    'Testing resources added. Recipe and progression requirements still apply.';
                }
              } else if (input.kind !== 'system') {
                if (run && run.status !== 'active')
                  message = `Run #${run.id} is ${run.status}. Its saved test is frozen. Start a new diagnostic run to play again.`;
                else {
                  const required = tutorial.step(s);
                  if (unavailable(s, input.action))
                    throw Error('You’re not ready for that yet. Continue your current path.');
                  if (
                    required &&
                    input.action !== 'hidden' &&
                    !(run && run.status === 'active' && input.action.startsWith('garden-')) &&
                    !required.actions.has(input.action === 'gym' ? 'train' : input.action)
                  ) {
                    displayAction = required.page;
                    tutorialView = required.view;
                    redirected = true;
                    if (!tutorial.navigation.has(input.action)) {
                      outcome = 'rejected';
                      message = 'Complete the current tutorial step before using this control.';
                    }
                  } else {
                    message = M.action(s, input.action, input.quantity, {
                      shopCurrency: 'diamonds',
                      diagnostic: Boolean(run && run.status === 'active'),
                      wallNow: now,
                      secretCharacterOwned: ownedCharacters.some((c) => c.characterId === 'nnorahc')
                    });
                    if (input.action === 'throw' && s.jacketIntroPending) {
                      displayAction = 'emporium';
                      redirected = true;
                    }
                    if (run && input.action === 'buy-old-stone') {
                      s.chapter0Pending = true;
                      s.tutorialStage = 'chapter0-end';
                      s.chapter = 0;
                      s.active = false;
                    }
                    if (input.action === 'shop' && s.redRecipe && !s.spicyShopGiftClaimed) {
                      M.change(s, 'red', 10, 'requia-spicy-gift');
                      s.spicyShopGiftClaimed = true;
                      message =
                        "Looks like you unlocked a new type of weapon. I really shouldn't but here's a few on the house.";
                    }
                  }
                }
              }
            } catch (error) {
              s = clone(settled);
              if (run) run.state = s;
              message = error.message;
              outcome = 'rejected';
            }
          }
        }
        if (!input.denied && (!run || run.status === 'active' || endedRuns.includes(run)))
          s.tutorialCheckpoint = tutorial.step(s)?.id ?? null;
        if (
          !input.denied &&
          outcome === 'ok' &&
          (!run || run.status === 'active') &&
          s.secretCharacters?.nnorahc
        ) {
          await query(
            'INSERT OR IGNORE INTO WinterPlaytestCharacterUnlocks VALUES ($guild,$user,$character,$at,$run)',
            { ...identity, character: 'nnorahc', at: now, run: run?.id ?? null }
          );
        }
        if (run && run.status === 'active' && !input.denied) {
          if (
            run.stopAt !== 'none' &&
            s.milestones[run.stopAt] !== undefined &&
            !(run.stopAt === 'stone' && s.chapter0Pending)
          ) {
            finish(run, 'completed');
            message = `Run #${run.id} completed at ${
              s.chapter === 2 ? 'Chapter 1 / S3 purchase' : run.stopAt
            }. Results saved; this test is frozen.`;
          }
        }
        if (run && !input.denied) await saveRun(run);
        else if (!run && !input.denied)
          await query(
            `INSERT INTO WinterPlaytestProfiles (guildId,userId,state,anchor) VALUES ($guild,$user,$state,$anchor)
        ON CONFLICT(guildId,userId) DO UPDATE SET state=excluded.state,anchor=excluded.anchor`,
            { ...identity, state: JSON.stringify(s), anchor: s.profileAnchor ?? now }
          );
        const counts = run ? await getCounts(run.id) : [];
        let presentationView = null;
        if (
          !input.denied &&
          !s.wooden &&
          s.dummyHp > 0 &&
          !s.uiWelcomed &&
          ['throw', 'status', 'help'].includes(displayAction || input.action)
        ) {
          presentationView = 'welcome';
          s.uiWelcomed = true;
          s.tutorialCheckpoint = tutorial.step(s)?.id ?? null;
          // Persist only this presentation flag; no tutorial action or resources
          // are replayed when the player opens the welcome screen again.
          if (run) await saveRun(run);
          else
            await query(
              'UPDATE WinterPlaytestProfiles SET state=$state WHERE guildId=$guild AND userId=$user',
              { ...identity, state: JSON.stringify(s) }
            );
        }
        if (!input.denied && !before.gymUnlocked && s.gymUnlocked && input.action === 'throw')
          presentationView = 'battle-defeat';
        if (input.kind !== 'system') {
          const control = input.raw?.customId || input.action;
          const found = counts.find(
            (r) =>
              r.kind === (input.kind || 'slash') &&
              r.action === input.action &&
              r.outcome === outcome &&
              r.control === control
          );
          if (found) found.count++;
          else
            counts.push({
              kind: input.kind || 'slash',
              action: input.action,
              outcome,
              control,
              count: 1
            });
        }
        let response = {
          state: s,
          run: run ? summary(run) : null,
          counts,
          message,
          outcome,
          action: input.action,
          admin: input.admin === true,
          resetFromRun,
          presentationView,
          displayAction,
          tutorialView,
          redirected
        };
        response.selectorPage =
          input.action === 'snowmen-page' && outcome === 'ok' ? Number(input.quantity) : 0;
        response.secretCharacters = await query(
          'SELECT characterId,unlockedAt,runId FROM WinterPlaytestCharacterUnlocks WHERE guildId=$guild AND userId=$user ORDER BY characterId',
          identity
        );
        if (!input.denied && before.target === s.target && !resetFromRun) {
          const old = before.tiers[s.target],
            latest = s.tiers[s.target];
          if (old && latest)
            response.combatUpdate = {
              target: s.target,
              attacks: latest.attacks - old.attacks,
              hits: latest.hits - old.hits,
              enemyAttacks: latest.enemyAttacks - old.enemyAttacks,
              enemyHits: latest.enemyHits - old.enemyHits
            };
        }
        if (!input.denied && ['review', 'export'].includes(mode) && input.diagnostic?.runId) {
          const selected = parse(
            (
              await query(
                'SELECT * FROM WinterPlaytestRuns WHERE id=$id AND guildId=$guild AND userId=$user',
                { ...identity, id: input.diagnostic.runId }
              )
            )[0]
          );
          if (!selected) {
            response.message = 'Run not found for your account in this server.';
            response.outcome = 'rejected';
          } else {
            response = {
              ...response,
              state: selected.state,
              run: summary(selected),
              counts: await getCounts(selected.id)
            };
            if (mode === 'export')
              response.export = {
                run: selected,
                interactions: await query(
                  'SELECT * FROM WinterPlaytestInteractions WHERE runId=$id ORDER BY at,id',
                  { id: selected.id }
                ),
                checkpoints: await query(
                  'SELECT * FROM WinterPlaytestCheckpoints WHERE runId=$id ORDER BY id',
                  { id: selected.id }
                )
              };
          }
        } else if (!input.denied && mode === 'export' && run)
          response.export = {
            run,
            interactions: await query(
              'SELECT * FROM WinterPlaytestInteractions WHERE runId=$id ORDER BY at,id',
              { id: run.id }
            ),
            checkpoints: await query(
              'SELECT * FROM WinterPlaytestCheckpoints WHERE runId=$id ORDER BY id',
              { id: run.id }
            )
          };
        if (response.export) response.exportRunId = response.run.run;
        if (response.run)
          response.run.timings = await query(aggregateSql, { run: response.run.run });
        const deltas = {
          gained: difference(before.ledger.gained, s.ledger.gained),
          spent: difference(before.ledger.spent, s.ledger.spent),
          net: difference(balances(before), balances(s)),
          ...(input.action === 'restart-confirm' && !input.denied
            ? { reset: true, resetFromRun }
            : {})
        };
        await query(
          `INSERT INTO WinterPlaytestInteractions (id,runId,guildId,userId,at,receivedAt,kind,action,request,outcome,beforeState,settledState,afterState,deltas,response)
        VALUES ($id,$run,$guild,$user,$at,$received,$kind,$action,$request,$outcome,$before,$settled,$after,$deltas,$response)`,
          {
            ...identity,
            id: input.id,
            run: run?.id ?? null,
            at: now,
            received: input.receivedAt ?? now,
            kind: input.kind || 'slash',
            action: input.action,
            request,
            outcome: response.outcome,
            before: JSON.stringify(before),
            settled: JSON.stringify(settled),
            after: JSON.stringify(s),
            deltas: JSON.stringify(deltas),
            response: JSON.stringify({ ...response, export: undefined })
          }
        );
        // An export includes its own request in the deliverable while keeping the
        // stored dedupe receipt small (the complete immutable audit remains in SQLite).
        if (response.export) {
          response.export.interactions = await query(
            'SELECT * FROM WinterPlaytestInteractions WHERE runId=$id ORDER BY at,id',
            { id: response.run.run }
          );
          response.export.counts = response.counts;
        }
        if (!input.denied) {
          await query(
            'INSERT INTO WinterPlaytestCheckpoints (runId,guildId,userId,at,gameAt,cause,state) VALUES ($run,$guild,$user,$at,$game,$cause,$state)',
            {
              ...identity,
              run: run?.id ?? null,
              at: now,
              game: s.now,
              cause: input.action,
              state: JSON.stringify(s)
            }
          );
          if (
            run &&
            run.status === 'active' &&
            run.reportMinutes > 0 &&
            now >= run.lastReportAt + run.reportMinutes * 60000 &&
            !['review', 'export', 'status'].includes(mode)
          ) {
            const previous = run.lastReportAt;
            run.lastReportAt = now;
            // Completed runs report once, at the committing transition only.
            if (
              run.status === 'active' ||
              before.active ||
              mode === 'stop' ||
              input.action === 'buy-old-stone' ||
              input.action === 'buy-s3' ||
              input.action === 'iron'
            ) {
              await query(
                "INSERT INTO WinterPlaytestOutbox (runId,guildId,channelId,status,payload) VALUES ($id,$guild,$channel,'pending',$payload)",
                {
                  id: run.id,
                  guild: input.guildId,
                  channel: run.channelId,
                  payload: JSON.stringify({
                    ...summary(run),
                    timings: await query(aggregateSql, { run: run.id }),
                    counts,
                    previousReportAt: previous,
                    reportedAt: now
                  })
                }
              );
            }
            await saveRun(run);
          }
        }
        for (const ended of endedRuns) {
          const logs = await query(
            'SELECT beforeState,afterState,request FROM WinterPlaytestInteractions WHERE runId=$id ORDER BY at,rowid',
            { id: ended.id }
          );
          const name =
            input.raw?.displayName ||
            logs
              .map((log) => JSON.parse(log.request).raw?.displayName)
              .filter(Boolean)
              .at(-1);
          const recap = buildRecap(ended, summary(ended), logs, await getCounts(ended.id), name);
          recap.timings = await query(aggregateSql, { run: ended.id });
          // Always queue the public final recap, even with periodic reports off.
          // Finishing, saving rewards, and queuing it are one atomic transaction.
          await query(
            "INSERT INTO WinterPlaytestOutbox (runId,guildId,channelId,status,payload) VALUES ($id,$guild,$channel,'pending',$payload)",
            {
              id: ended.id,
              guild: ended.guildId,
              channel: ended.channelId,
              payload: JSON.stringify(recap)
            }
          );
        }
        await beforeCommit({ input, response, transaction });
        if (response.run) response.counts = await getCounts(response.run.run);
        if (response.export) {
          response.export.timings = await query(
            'SELECT * FROM WinterPlaytestTimings WHERE runId=$run ORDER BY interactionId',
            { run: response.run.run }
          );
          response.export.counts = response.counts;
          response.export.checkpoints = await query(
            'SELECT * FROM WinterPlaytestCheckpoints WHERE runId=$id ORDER BY id',
            { id: response.run.run }
          );
        }
        await query('UPDATE WinterPlaytestInteractions SET response=$response WHERE id=$id', {
          id: input.id,
          response: JSON.stringify({ ...response, export: undefined })
        });
        return response;
      })
    );
  }
  async function due() {
    await initialize();
    return serialize(
      sequelize,
      async () =>
        (
          await sequelize.query(
            "SELECT id,guildId,userId,lastReportAt FROM WinterPlaytestRuns WHERE status='active' AND reportMinutes>0 AND $now>=lastReportAt+reportMinutes*60000 ORDER BY id LIMIT 10",
            { bind: { now: clock() } }
          )
        )[0]
    );
  }
  async function claimReport() {
    await initialize();
    return serialize(sequelize, () =>
      sequelize.transaction({ type: Transaction.TYPES.IMMEDIATE }, async (transaction) => {
        const [rows] = await sequelize.query(
          "SELECT * FROM WinterPlaytestOutbox WHERE status='pending' ORDER BY id LIMIT 1",
          { transaction }
        );
        if (!rows[0]) return null;
        await sequelize.query("UPDATE WinterPlaytestOutbox SET status='sending' WHERE id=$id", {
          bind: { id: rows[0].id },
          transaction
        });
        return { ...rows[0], payload: JSON.parse(rows[0].payload) };
      })
    );
  }
  async function delivered(id, error = null, messageId = null) {
    return serialize(sequelize, () =>
      sequelize.query(
        "UPDATE WinterPlaytestOutbox SET status=$status,error=$error,payload=CASE WHEN $message IS NULL THEN payload ELSE json_set(payload,'$.messageId',$message) END WHERE id=$id AND status='sending'",
        { bind: { id, status: error ? 'failed' : 'sent', error, message: messageId } }
      )
    );
  }
  async function recordTiming(input) {
    if (timingColumns.some((key) => !Number.isFinite(input[key]) || input[key] < 0))
      throw Error('Invalid response timing.');
    await initialize();
    return serialize(sequelize, () =>
      sequelize.transaction({ type: Transaction.TYPES.IMMEDIATE }, async (transaction) => {
        const bind = Object.fromEntries(
          ['id', 'guildId', 'userId', ...timingColumns].map((key) => [key, input[key]])
        );
        await sequelize.query(
          `INSERT OR IGNORE INTO WinterPlaytestTimings (interactionId,runId,guildId,userId,kind,action,outcome,${timingColumns.join(
            ','
          )})
        SELECT id,runId,guildId,userId,kind,action,outcome,${timingColumns
          .map((c) => '$' + c)
          .join(
            ','
          )} FROM WinterPlaytestInteractions WHERE id=$id AND guildId=$guildId AND userId=$userId AND runId IS NOT NULL AND kind!='system'`,
          { bind, transaction }
        );
        const [[saved]] = await sequelize.query(
          'SELECT runId FROM WinterPlaytestTimings WHERE interactionId=$id AND guildId=$guildId AND userId=$userId',
          { bind: { id: input.id, guildId: input.guildId, userId: input.userId }, transaction }
        );
        if (!saved) return;
        const [rows] = await sequelize.query(aggregateSql, {
          bind: { run: saved.runId },
          transaction
        });
        // Include the stop command's completed delivery measurement in its recap
        // before the runtime drains the committed outbox.
        await sequelize.query(
          "UPDATE WinterPlaytestOutbox SET payload=json_set(payload,'$.timings',json($timings)) WHERE runId=$run AND status='pending'",
          { bind: { run: saved.runId, timings: JSON.stringify(rows) }, transaction }
        );
      })
    );
  }
  return { initialize, execute, due, claimReport, delivered, recordTiming };
}
module.exports = { createStore, summary, difference };
