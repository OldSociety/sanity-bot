# Snowball Fight

Development-only replacement on the `snowball-fight` branch. The pre-implementation investigation is [../snowball-fight-audit.md](../snowball-fight-audit.md).
No live databases, Discord registrations, PM2 processes or production settings are changed by this implementation or its tests.

## Layout

- `commands/Winter/SnowballFight.js`: loader-compatible `/snowball-fight` schema (17 subcommands).
- `runtime.js`: environment, guild, bot-tests channel, target membership and control ownership checks; Discord delivery.
- `store.js`: explicit actions, SQLite immediate transactions, receipts and audit ledger.
- `rules.js`: UTC quests, achievement definitions and deterministic encounter turns.
- `presentation.js`: Winter embeds, badge illustrations, shop/navigation and combat buttons.
- `config/winter/snowball-fight.json`: all initial rewards, prices, limits and character definitions.
- `migrations/snowball-fight.js`: additive, idempotent schema initialization on the first authorized development action.
- `tests/snowball-fight.test.js`: isolated regression tests; `scripts/winter/snowball-fight-study.js`: offline seeded combat and economy scenarios.

## Commands

All 17 handoff commands are implemented: `start`, `collect`, `throw target`, `stats`, `leaderboard metric page`, `daily`, `quests`, `claim`, `fight character`, `shop`, `collection`, `choose character`, `item-info item`, `gift target amount`, `achievements`, `news`, `help`.
Shop purchases and quest claims use buttons; leaderboards have navigation and an optional page; encounters use Throw snowball, Drink cocoa and red Cancel controls. No paired confirmation prompt is needed. Cancel retreats without rewards. Controls carry the owning player and encounter revision.

## Gameplay

Start with 10 snowballs, cap 50. Collect 2 every 60 seconds. Collection achievements count ammunition actually gained through collection, not starting, purchased, gifted or daily ammunition. Daily is once per UTC date: 10 snowballs (subject to space) and 20 Buttons. Full inventories do not prevent currency claims. Next reset is displayed.

PvP consumes 1 snowball per valid throw, has a 10-second cooldown and a 70% hit chance. Every hit counts, regardless of reward eligibility. A repeated target within 60 minutes, a reciprocal throw within 10 minutes or the 30-Button daily PvP cap suppresses the Button reward. All valid attempts, including misses and unrewarded hits, extend the repeated-target window. Misses reset the current streak. Async targets must be enrolled human members of the same server; they need not be online.

Two daily quests are always solo-friendly: collect 4 snowballs and take a character-fight turn. A third rotates across successful hits, three-hit streak, gifting, victory and general activity. Progress is persistent and resets on the UTC date. Claim awards each completed quest once. Nine achievements award 5 Buttons once each. Every Buttons or ammunition change has a ledger entry with interaction, player, reason, delta, balance and timestamp.

Shop: 10 snowballs for 5 Buttons; cocoa for 8 (cap 10); a cosmetic snowflake for 40 (one owned). Gifting is ammunition-only, atomic and bounded by recipient capacity. Badges and Buttons cannot be transferred. Special ammunition is deliberately deferred pending core testing.

## Character encounters and badges

Hendrix, Kylax and Azulis are enabled. Seven additional stable Classic IDs are registered but locked pending tested encounter definitions and missing artwork. Character stats and combat rules are snapshotted when a fight starts. One persistent fight per player; opening fight again resumes it. No turns occur without player input. Attack consumes one snowball; cocoa consumes a turn and one item, heals up to 10 HP and is limited to two uses. A fight ends on victory, defeat, Cancel, 12 turns or 30-minute expiry. Expiry never awards progress or currency and is recorded lazily on the next authorized action.

The first victory per character per UTC day grants 10 Buttons and one badge mark. Three marks unlock `snowball-fight:classic:<stable ID>` in the existing permanent `BadgeOwnership` table. Further same-day victories count in statistics but grant no marks or currency. Future-day victories can still grant daily currency after the badge is unlocked. Collection and equipment are cosmetic. Shared badge profile display also recognizes the new ownership IDs. No Arena combat, stats, ownership or configuration is changed.

The disabled historical daily implementation cannot be cleanly reused; the UTC transactional daily is new. The existing achievement preview has no tracker; its four-tile rendering was extracted into `services/achievement-progress.js`, shared by the preview and this feature, with a Unicode fallback when emojis are unavailable.

## Storage and retirement

New tables: `SnowFightPlayers`, `SnowFightReceipts`, `SnowFightLedger`, `SnowFightDaily`, `SnowFightQuestClaims`, `SnowFightAchievements`, `SnowFightCharacterDays`, `SnowFightBadgeProgress`, `SnowFightBattles`, `SnowFightEncounters`, `SnowFightThrows`, `SnowFightGifts`. Indexes support guild rankings and target-window checks. Composite keys prevent duplicate daily claims, quest rewards, achievements, character-day progress and badge ownership. Migration creates the shared badge table only if absent. There is no destructive down migration or historical data conversion.

All player and target changes, reward grants and receipts commit together. SQLite immediate transactions serialize writers across connections; the existing shared queue protects a single Sequelize connection. Reusing an interaction ID returns its committed receipt only if action identity matches. Battle revisions additionally reject stale controls with new interaction IDs. Discord delivery errors never rerun mutations. No crash-durability guarantee beyond SQLite's configured behavior is added.

With replacement enabled, development registration excludes `/snow`, old `snow:` controls reject before storage access, Winter maintenance returns before creating a worker, and the old development playtest runtime is disabled. Historical idle tables and source remain for recovery and tests. Production keeps `/snow` and existing maintenance selection; `/snowball-fight` cannot register or execute there. Do not use the old Winter rollout tools to activate the replacement.

## Verification and rollout

Run `npm run test:snowball-fight`, `npm run snowball-fight:study`, `npm run test:winter` and `npm test`. The study writes `artifacts/snowball-fight/study.json`, with source hashes, 5,000 baseline encounters per enabled character and seven-day casual/active scenarios using the real transactional store. It never opens a live database or contacts Discord. Use results alongside the stated assumptions; these are initial balance settings, not a claim of optimal play.

Source implementation does not change running bots. Both deployments use this checkout, so do not restart production from the development replacement branch. For a future development activation, first preserve current source and a consistent development database backup, review the environment-specific command deployment plan (remove `/snow`, add `/snowball-fight`, preserve all other commands), then use the existing guarded registration workflow and a controlled development reload. Schema initialization occurs only after an authorized replacement action. No production reload is authorized by the handoff. Human Discord visual and interaction acceptance remains a rollout check.
