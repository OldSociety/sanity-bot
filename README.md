# Roll For Sanity Bot

**Development is running (2026-10-02):** Authorized migrations/verified backup and fourteen-command registration completed; existing `/game` preserved. `SB-development` is online through PM2 in the development environment; production remains stopped. Gameplay activates only in development (`developmentEnabled=true`, global `enabled=false`); optional workers/access remain disabled. See [startup evidence and hands-on next steps](docs/spooky-development-live-session.md). Earlier offline-only statements below are historical.

Latest full suite: **252/252 pass**. Begin hands-on testing with `/spooky welcome`, `/spooky register`, `/spooky status` in the configured bot-test channel.

**Preparation update (2026-10-02):** The supplied development `CURSEDROLEID` is verified: `npm run spooky:check:dev` passes for all required role IDs and the bot-test channel. Server ownership/permissions still require live checks. No credentials were printed, databases opened or Discord calls made. See [acceptance gates](docs/spooky-development-acceptance.md).

Latest full offline suite: **250/250 pass**. All activation flags remain disabled.

Final preparation checks pass. The [development session plan](docs/spooky-development-session.md) records the target, reviewed migration/command sequence, tester needs and deferred features. Live execution has not begun.

Final preparation checks pass. The [development session plan](docs/spooky-development-session.md) records the target, reviewed migration/command sequence, tester needs and deferred features. Live execution has not begun.

**Spooky development status (2026-10-01): all nine audit findings fixed offline.** On `feature/S-1-spooky`, **244/244 tests pass**, including 20 positive audit regressions; static preflight/full registry review pass. See [fixes and remaining work](docs/spooky-audit-fixes.md), [the original audit](docs/spooky-feature-branch-audit.md) and [current handoff](docs/spooky-handoff.md). Member requests are shared/rate-aware, committed public rewards survive private reply failure, stale intents are guarded, and chat level/fate transitions are claimed once. Deployment now requires an explicitly reviewed registry hash. Gameplay/reminder/winner/access flags remain disabled; no real migration, login or registration occurred. Next is separately authorized development acceptance; public-launch balance, six artworks and optional settings remain open.

**Roll For Sanity** is a Discord bot designed to enhance server engagement through a leveling system, achievements, and role-based rewards. Built using `discord.js`, this bot provides a robust platform for tracking user interactions, managing achievements, and maintaining user balances of fate points, allowing for a dynamic and interactive community experience.

## Features

- **Fate Points System**: Track, add, and manage fate points for server users. Admins can also modify user balances.
- **Leveling System**: Engage users through conversation tracking and reward them based on their activity.
- **Achievements**: Spooky character sets award permanent badges in SQLite; `/badges`, profiles and level-ups share rendering. Implemented and audited offline; live acceptance remains pending.
- **Server Information**: Easily display details about the server.
- **User Profiles**: View individual user data, including fate points, achievements, and join date.

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/OldSociety/sanity-bot.git
cd sanity-bot
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

In the root of your project, create `.env.development` with the development bot credentials and channel/role IDs:

```env
TOKEN=your-discord-bot-token
CLIENTID=your-discord-application-id
HELLBOUNDCHANNELID=channel-id-for-commands
BOTTESTCHANNELID=channel-id-for-testing
ADMINROLEID=your-admin-role-id
BOOSTERROLEID=your-booster-role-id
UNWANTEDROLEID=role-id-for-banned-users
GUILDID=your-discord-guild-id
```

#### Production configuration

Production requires a separate `.env.production` and explicit `NODE_ENV=production`. The runtime does not load `.env` or use `DATABASE_URL`; see the database paths below. Development and production must use different guilds.

### 4. Running Migrations

```bash
npx sequelize-cli db:migrate --env development
```

### 5. Deploy Commands

```bash
npm run deploy:check:dev
# Only during an authorized development session: read/save the live registry plan.
npm run deploy:dev -- --plan
# Review listed removals and the saved snapshot, then supply its exact SHA-256.
npm run deploy:dev -- --apply REVIEWED_SHA256
```

### 6. Run the Bot

For development:

```bash
npm run start:dev
```

For production:

```bash
npm run start:prod
```

## Usage

The bot includes several commands for both users and admins to manage their experience on the server.

### Commands Overview

#### **Fate Points Management**: `/fate`
- Fate points are a currency for the Meridian Campaign setting and are used as a replacement for 5e's Heroic inspiration.

| Subcommand    | Description                                                | Permissions Required  |
| ------------- | ---------------------------------------------------------- | --------------------- |
| `add-fate`    | Adds fate points to yourself.                              | User                  |
| `reroll`        | Deducts 10 fate points or bank points automatically.       | User                  |
| `balance`     | Shows your current fate points and bank balance.           | User                  |
| `manage`      | Admins can manage the fate points or bank of any user.     | Admin Role            |

- Fate points cap at 100 per user. Excess points can be added to the bank for users with Booster or Admin roles.
- Rolling fate deducts points from the bank first, then from fate points if the bank is insufficient.

#### **Server Information**: `/server`

Displays server statistics, such as:
- Server name
- Total number of members

#### **User Information**: `/user`

Provides information about the user executing the command:
- Username of the user
- The date the user joined the server

---

## Halloween / Spooky 2026

Work remains on `feature/S-1-spooky`. Tasks 1–8, 10–17 and **18a maintenance/18b reminder worker/18c1 snapshots/18c2 winner delivery** are implemented offline. All nine audit fixes are complete; **244 tests pass**. Task 18 activation and Task 9 remaining six artworks/live badge checks stay open. Event/reminder/winner/access flags are **disabled**; no real migration, bot login, registration or deployment occurred. Live behavior is not yet validated.

Read [AGENTS.md](AGENTS.md), the [current handoff](docs/spooky-handoff.md), [rules](docs/spooky-rules.md), and [checklist](docs/spooky-implementation-checklist.md) before continuing. The [Task 17 balance report](docs/spooky-population-balance.md) and [seeded results](docs/spooky-population-results.json) evaluate the approved economy: casual/regular completion targets are not met, and theft plus gifted candy invalidate independent 13%-yield/80-action assumptions. Approved settings remain unchanged. Task 20a acceptance/storage preparation is complete; 20b status/backup/apply tooling and 20c scoped offline preflight are complete; next: **reviewed full command registry and settings, then authorized live development acceptance**; balance approval is required before enabling play. Delivery ambiguity is resolved through explicit audited admin decisions; there is no blind resend. Older audits/simulations contain superseded proposals; chronological checklist entries preserve historical evidence.

Run `node scripts/spooky-preflight.js` for offline configuration and scoped command checks; [saved results](docs/spooky-preflight-results.json) list remaining launch gates. It reads no credentials, opens no DB and contacts no Discord. The [storage guide](docs/spooky-storage-tools.md) documents development-only status/backup/plan/apply: mandatory verified backup, reviewed plan hash, atomic schema/tracking and explicit adoption. Nine new apply tests are included in the 208-test suite. Existing three migration up APIs now support injected transactions with unchanged DDL; no destructive down/restore CLI exists. These storage commands have not been run against the real development database.

### Commands and presentation

Local command definitions: `/spooky welcome`, `/spooky help`, `/spooky register`, `/spooky status`, `/spooky collection`, `/spooky trick`, `/spooky treat`, `/spooky fate`. They are not yet registered with Discord. The command wrapper routes through the new runtime; the old implementation is preserved at `docs/legacy/spooky-command.js` for reference and is not loaded.

Personal screens are ephemeral. Events involving another player are public and tag registered targets only; nonparticipants appear as plain names. Quarter and newly completed character reveals are prominent public notifications. Permanent ownership commits with completion; reveals distinguish newly unlocked from already retained badges. Selene is configured; other earned badges use medals while art is pending. Exact prestige weights stay out of player rendering.

Start with 10 candy, +10 per three elapsed hours, capacity 80. First economic touch starts the refill clock; registration reuses any victim balance. Every action costs exactly one. Capped surplus is discarded before spending, partial intervals below cap remain. No refill worker is required for accrual correctness. Five Eyes automatically award a quarter; five extras automatically award a uniformly random missing piece, preserving first copies. Ordinary rarity is approved 70% common / 22% rare / 8% legendary. Ten banked fate buys an extra quarter for any registered bank holder; no hard daily draw ceiling. Sweet Tooth's normal 5% treat branch additionally grants Unwanted callers +1 bank point, cap 100. Config version 4, scoring version 1. October boundaries use local Pacific time with no redemption grace.

Administrator source definitions: /spooky-admin player, /spooky-admin transactions, /spooky-admin config, /spooky-admin deliveries. All responses are private; fresh server authorization and configured guild/channel checks apply even while play is disabled. Inspection never refills or changes state. These commands are not registered with Discord. Repairs add `/spooky-admin adjust`, `grant-quarter`, and `remove-quarter`, requiring reasons and replay-safe ledger entries. Award notifications are public and belong to the repaired player. Controls add `/spooky-admin clear-effect`, `pause`, and `reset-development`; reset requires explicit confirmation, development environment and matching actual database path. Effect restoration is queued atomically and reconciled after commit for the selected user. Queue tools add `/spooky-admin resolve-notification` and `resolve-delivery`, with inspected-status/revision guards, trusted evidence and explicit duplicate-risk confirmation for uncertain resends. See the [admin tools guide](docs/spooky-admin.md) for options, last-copy intent, lifecycle restrictions, pagination and limits.

### Architecture and current limitations

| Files | Responsibility |
| --- | --- |
| `config/spooky-2026.json`, `config/spooky-pieces.json`, `services/spooky/config.js` | Versioned rules, lifecycle/approval validation, 28 stable piece IDs; no artwork imports |
| `services/spooky/models.js`, `economy.js`, `participants.js` | Injected seasonal models, atomic root operations/ledger/replay and lazy candy accrual |
| `services/spooky/collection.js`, `fate-purchases.js`, `progression.js` | Automatic draws/exchanges, bank-only purchases, Sweet Tooth bonus and separate prestige tracks |
| `services/spooky/actions.js`, `theft.js`, `effects.js`, `playful.js` | Outcome/cost selection, random scoped theft, protection, gifts, curses, nicknames and legacy Sweet Tooth |
| `services/spooky/controller.js`, `presentation.js`, `command-definition.js`, `runtime.js` | Private/public screens, persisted render/mention plans, complete member/permission snapshots, configured guild/channel gates |
| `services/spooky/delivery.js`, `notifications.js`, `cursed-messages.js` | Durable role/nickname intent, persistent public send tracking, safe grapheme-aware message replacement |
| `services/spooky/lifecycle.js`, maintenance in `runtime.js`/`app.js` | Injected minute/startup scheduler, atomic effect restoration and once-only closure marker; inventories retained |
| `config/spooky-winners.json`, `services/spooky/winner-snapshot.js`, `winner-awards.js` | Frozen once-only results and audited title intents/outbox from proof; disabled configuration, drift guards, role hierarchy and admin recovery |
| `config/spooky-reminders.json`, `services/spooky/reminders.js` | Optional three-Pacific-day recruitment reminders, latest-only downtime handling, role mention allowlist and durable guarded outbox |
| `services/spooky/admin.js`, `admin-repairs.js`, `admin-controls.js`, `admin-resolution.js`, `admin-command.js`, `admin-runtime.js`, `commands/Holiday/SpookyAdmin.js` | Private authorized inspection and audited balance/inventory corrections, replay binding and public award outbox; safe effect restoration, durable pause and guarded development reset; evidence-backed queue resolution and explicit resend copies |
| `services/fate-wallet.js` | Stale `/fate` update rejection and atomic level-up/booster/birthday credits |
| `services/guild-members.js`, `spooky/post-commit.js`, `spooky/pending-notifications.js`, `spooky/discord-adapter.js` | Shared complete roster/allowance, saved reply/public isolation, bounded pending recovery and fresh intent/hierarchy guards |
| `services/command-registry.js`, `deploy-commands.js` | Shared strict registry and hash-reviewed live plan/snapshot/apply |

All seasonal writes and effects share one root economy transaction; Discord writes occur after commit. Replays return saved outcomes rather than rerolling. Pending role updates retry with fresh Discord state; nickname restoration preserves independent changes. Cleanup runs on interaction entry/exit and, when enabled, immediately at startup and every minute. Closure atomically freezes a validated winner proof and sets archivedAt once without deleting inventory, scores, wallets or history. Disabled play creates no scheduler/storage access; disabling does not automatically restore effects. Invalid restoration metadata blocks cleanup safely for inspection. See the [lifecycle guide](docs/spooky-lifecycle.md). Frozen winner snapshots and title delivery worker are complete offline; final title names/role IDs/announcement channel and activation remain pending. See the [winner guide](docs/spooky-winners.md). Single bot process required; no distributed delivery lease.

Reminders are source wired after maintenance with an independent enabled=false operational file; channel ID, Resident role IDs and local HH:mm time are null/empty pending user input. `/spooky-admin config` includes these settings. Once configured and enabled, reminders occur every three Pacific calendar days, latest due slot only after downtime, during ACTIVE/unpaused/unarchived play. Older pending messages cancel with audit; ambiguous sends require inspection. Channel lookup/claim boundaries recheck eligibility and reminder failure does not block gameplay. See the [reminder guide](docs/spooky-reminders.md). No real reminders have been sent.

Public notifications persist pending/sending/sent/uncertain state and channel/message IDs. Sent rows never resend on delayed replay. Crashes or ambiguous network failures require inspection instead of blindly resending after Discord's short nonce window. Private inspection and reset cancellation exist; explicit ambiguous-send resolution is now implemented offline, with fresh evidence and audited confirmation. Cancelled replacements never authorize deletion of an original cursed message. Cursed messages only delete originals after confirmed delivery; attachments/replies remain intact, and mentions are disabled. Unsafe legacy delete-first code was replaced.

Covered bank writers use compare-and-swap or atomic SQL in the shared connection queue. Chat XP/level/timestamp and fate reward transition are claimed once; concurrent messages cannot award the same level twice. Booster join reward requires an actual role transition; birthday credits respect the bank cap. Legacy birthday/booster schedules still lack duplicate-job identity.

Required additive migrations, in order: `20261001000000-create-spooky-core.js`, `20261001000001-create-spooky-delivery.js`, `20261001000002-create-spooky-notifications.js`, `20261001000003-create-permanent-badges.js`. Only disposable test storage has run them. Keep dev/prod untouched until authorized acceptance/backup review. Permanent ownership is implemented; six artworks, public-launch balance, optional activation and live checks remain. No buttons/action batches yet; current UI uses slash commands.

### Offline balance simulation

`node scripts/spooky-population-simulation.js 40` reproduces eight seeded scenarios (40 guilds each, 6,720 player-months total) without a bot or real database. It writes `docs/spooky-population-results.json`; review the balance report for assumptions, conditional milestone timing, never-reached rates, duplicates/exchanges/theft, remaining resources and prestige distributions. A meaningful parity test compares the in-memory adapters against actual SQLite services. Simulation does not alter event settings or award permanent badges. It measures behavior under an explicitly heavy-activity population; it is not a forecast of actual server participation.

## Development Workflow

### Using `.env` Files for Different Environments

- **Development**: `.env.development` is required. Unset `NODE_ENV` defaults to development for both startup and deployment; `.env` is not a fallback.
- **Production**: explicitly select `NODE_ENV=production` and use `.env.production`.
- **Test**: `NODE_ENV=test` selects in-memory SQLite and rejects Discord startup/deployment.

Startup and deployment use the same loader in `config/runtime.js`. `TOKEN`, `CLIENTID`, and `GUILDID` must be present in the selected environment file; inherited shell credentials cannot substitute for missing values. Unknown environments and conflicting file environments are rejected. When both guild IDs are configured, development and production must target different guilds. Paths are resolved relative to this repository, independent of the terminal working directory.

You can switch between development and production environments using the commands:

- For development: `npm run start:dev`
- For production: `npm run start:prod`

This setup ensures that the bot uses the correct environment variables based on the environment it's running in.

### Offline checks before running the bot

```powershell
npm test
npm run check:dev
npm run deploy:check:dev
```

`npm test` uses Node's built-in test runner (Node 22) with `NODE_ENV=test`. Tests use fake credentials and disposable in-memory SQLite; the independent-connection contention test deliberately creates a uniquely named temporary SQLite file under the OS temp directory and removes it afterward. Neither `dev.sqlite` nor `prod.sqlite` is used. Temporary environment fixtures are also removed after tests. No additional packages were installed. The previous test command targeted a nonexistent `__tests__` directory.

`check:dev` verifies and displays the selected application/guild IDs and database path while withholding the token. `deploy:check:dev` inspects the deployment target **without loading commands, opening a database, or calling Discord**. These checks confirm configured targets, not whether the token belongs to the application or the bot has server permissions. Actual login/registration remains a later development acceptance task. `deploy:dev` and `deploy:prod` perform real command registration; they are not offline checks.

### Database Configuration

The runtime uses SQLite in each environment:

| Environment | Storage |
| --- | --- |
| Development | `<repository>/config/dev.sqlite` |
| Production | `<repository>/config/prod.sqlite` |
| Test | `:memory:` |

`config/sequelize.js` uses the environment selected by `config/runtime.js`; it no longer always opens the development database. Test storage is forced to memory. `DATABASE_URL` is not used by this runtime. The existing `config/config.json` remains for historical/tooling configuration, but runtime selection is controlled by `config/runtime.js`. No real database schema or data was modified during Task 2.

Winner delivery uses one scoped final-awards operation after CLOSED/archive, retaining proof and targets across restart. Titles retry from fresh Discord state; ambiguous announcements wait for inspection. Changing settings blocks old pending titles/announcements without minting another award. Invalid settings cannot block cleanup/archive. Sweet Tooth remains separate. Token artwork/permanent badges are implemented independently; read the [winner guide](docs/spooky-winners.md) before configuring delivery.


Development acceptance and recovery preparation is documented in the [runbook](docs/spooky-development-acceptance.md), with [saved synthetic storage evidence](docs/spooky-storage-rehearsal-results.json). Run `node scripts/spooky-storage-rehearsal.js` for a fresh disk/WAL backup → migrate → populate → reverse rollback/reapply → restore verification. It accepts no arguments/targets, opens only generated OS-temp SQLite files and removes them after checks. Development status/backup/plan/apply tooling is complete offline; live acceptance remains pending; no existing database was inspected or changed by this rehearsal.


The [storage tools guide](docs/spooky-storage-tools.md) documents guarded development-only status/backup/plan/apply. Apply requires reviewed hashes, stopped writers and verified backup; it is implemented/tested only on synthetic fixtures. No real DB was opened or backed up. Real application and restore require separate authorization; generated backups are excluded from Git.

## Historical milestone notes

These dated snapshots retain earlier evidence. Their test counts, deferred-art claims and next-step instructions are superseded by the current status and audit correction guide above.

Current token art state (2026-10-01): all 105 single/combined/full-circle PNGs are shipped; four-piece rewards and character completion show full circles. Hellfed Marq square artwork was edited into a circle with transparent exterior; other six full circles are unchanged. The token artwork guide records the built-in edit prompt, source mapping and durable attachment behavior. Permanent badge core/profile/level-up are implemented with Selene; audited backfill is complete offline; six artworks remain pending. Full224/224 tests and refreshed preflight pass; no real DB/Discord changes. Next review the full command registry, obtain badge artwork and resolve balance/operational/live gates.


Current badge state: [permanent badge guide](docs/badges.md) is authoritative. Task9a core and Selene first artwork implemented; 9b audited recompute/backfill is complete offline; six other badge artworks remain pending. New fourth migration creates permanent BadgeOwnership; guarded storage now requires all four groups for complete. Current disk/WAL rehearsal covers all four migrations and permanent ownership; older three-migration evidence is historical. New /badges view and /badges leaderboard share rendering with /user and level-ups; unowned = question mark, owned without emoji = medal, Selene resolves server emoji by name. Last full224/224; no real migrations, Discord registration or emoji verification. Keep all flags disabled. Offline full command registry review is complete. Exact next: resolve balance/server settings, then authorized live acceptance.


Badge emoji access update: [access guide](docs/badge-access.md) verifies Discord guild emoji role restrictions and implements seven independent cosmetic access roles projected from permanent ownership. Config enabled=false/all role IDs null; no live emoji/role changes. Explicit setup allows each badge role plus dedicated managed bot role for embeds. Post-commit gameplay and year-round badge/profile/leaderboard/level-up views reconcile roles; permission/channel-overwrite validation fails closed, errors preserve ownership. Four mocked tests; no new schema/dependency/gameplay odds/version. Next configure/test Selene first on the verified development server; permanent disk recovery and live acceptance gates remain. No periodic/member-join worker: rejoining repairs on next view/level-up/action.

## Task 9b — audited badge reconciliation (2026-10-01)

Complete offline on `feature/S-1-spooky`. `/spooky-admin recompute-badges player confirm:true reason` reconciles one existing event-registered participant's inventory with permanent ownership. Fresh admin/guild authorization, explicit confirmation and a private reason are required. The request is bound to its interaction ID; changed requests fail and replays return the committed receipt. Valid registration must fall inside October. Unknown pieces or invalid quantities reject the entire operation. This is a per-player backfill, not a bulk server scan or forced badge grant.

All four owned positions make a character eligible. New ownership, badge ledger, zero-delta reconciliation audit and public completion outbox commit together; finalization failure rolls all of them back. Only newly awarded badges queue big public completions mentioning the owner; repair reasons remain private. Already-owned badges survive missing quarters. Reconciliation is allowed while play is disabled/paused and after closure/archive, but not before opening. It does not reopen redemption or alter candy, Eyes, fate, quarters, prestige, event archive or frozen winner proof.

Private player inspection includes permanent ownership IDs, source event and award time even if seasonal participation no longer exists. Development reset verifies ownership before/after in its root transaction, records `badge_preservation` evidence, retains wallet and audit, and cancels pending recompute announcements. In-flight/uncertain announcements retain the existing inspection policy. Replaying an old reset cannot delete a newly registered participant. Admin grants and recomputes reconcile configured emoji-access roles after commit; role API failures leave durable ownership intact. Access remains disabled with null role IDs.

Changed: services/spooky/admin-badges.js (new), services/badges.js, services/spooky/admin.js, admin-controls.js, admin-command.js, admin-runtime.js, scripts/spooky-preflight.js, tests/spooky-admin.test.js, tests/spooky-admin-badges.test.js (new), preflight report and current documentation. No new schema, dependencies, gameplay version or odds. Verification: full suite 220/220 passed; the six-test badge-administration file subsequently passed, including one additional controller/replay test not present in that full run. Static preflight passes with eight player/thirteen admin subcommands plus /badges. No real database or Discord access, registration, migration or deployment occurred.

Permanent disk/WAL recovery now covers all four migrations, actual badge ownership and seasonal-reset retention. Offline full command registry review is complete. Exact next task: resolve launch settings and balance; obtain six remaining badge artworks, configure dedicated development access roles/Selene emoji permissions, settle balance and reminder/winner settings, and perform authorized live acceptance. Task9 overall remains open for live verification/artwork; the permanent disk recovery coverage gap is closed. Existing balance targets remain unmet; approved version4 is unchanged. All event/reminder/winner/access flags stay disabled.

## Permanent badge disk recovery — 2026-10-01

Complete offline on `feature/S-1-spooky`. The synthetic-only disk/WAL rehearsal now applies all four migrations, earns Selene through the real collection service in an economy transaction, and snapshots the independent BadgeOwnership table alongside seasonal state. Baseline and populated restore match full schema/data/index/AUTOINCREMENT hashes. Ownership IDs, source event and award time survive restore. Replaying the restored operation returns its stored receipt without awarding again. The actual admin development reset retains ownership, badge ledger and bank/fate balances, while preserving an uncertain announcement for inspection.

Removing the three seasonal schemas preserves permanent ownership. The fourth migration's destructive down is exercised separately only on generated synthetic storage to prove full schema rollback preserves preexisting User/server data; it is never a seasonal reset. All four can reapply cleanly. Cleanup is verified after interruptions at baseline backup, populated backup and restored badge/reset, plus parallel isolated runs. No real target/path arguments are accepted, no Discord calls occur, and no destructive production/development CLI was added.

Changed scripts/spooky-storage-rehearsal.js, tests/spooky-storage-rehearsal.test.js and docs/spooky-storage-rehearsal-results.json, plus README/AGENTS/current guides/checklist. The report includes four migration hashes and explicit badge restore/replay/reset/seasonal-schema retention evidence. No migration source, dependencies, odds, version4 or activation settings changed. Existing balance targets remain unmet, six badge artworks and live configuration/permission verification remain pending. All event/reminder/winner/access flags stay disabled.

Exact next task: review the full Discord command registry offline, including /badges and the thirteen /spooky-admin subcommands, for duplicate names, invalid definitions and unintended legacy command removal before any bulk registration. Then resolve approved balance and server settings, supply six badge artworks and configure/test Selene access on the development server as part of authorized live acceptance. No login, registration, real migration or deployment occurred in this task.

Recovery validation: focused disk rehearsal 3/3 passed; full npm test 221/221 passed; two changed JavaScript syntax checks and README diff whitespace check passed. Saved report confirms integrity ok, zero foreign-key violations and all generated temporary files removed.

## Full command registry review — 2026-10-01

Complete offline on feature/S-1-spooky. See [registry guide](docs/command-registry-audit.md) and docs/command-registry-audit-results.json (paths are relative to repository root). scripts/command-registry-audit.js validates all working-tree command definitions against local HEAD with inert substitutes for global models and execution-only imports. No credentials, DB, Discord or interaction execution. Thirteen active commands; three disabled files; no duplicate/invalid definitions or missing active HEAD commands. Deleted Halloween command was already commented out. Additions spooky/spooky-admin/badges plus preexisting Winter throw/slots are preserved. The report records definitions, hashes and baseline commit; full registry runtime handlers and server-only commands remain live acceptance work. Bulk PUT is still a replacement: compare live guild commands before registration.

Changed: new audit script, tests/command-registry-audit.test.js, registry guide/report, scripts/spooky-preflight.js, refreshed preflight report and current docs. Existing loaders, game config/version4/odds/schema/dependencies and disabled flags are unchanged. Next resolve launch settings and unmet balance targets with the user; then authorized development live registry/migration/interaction/access/recovery acceptance. Six badge artworks remain pending. Nothing was registered, deployed or migrated into real storage.

Registry validation: focused audit tests 3/3 passed; full npm test 224/224 passed; three changed JavaScript syntax checks, static preflight and README whitespace check passed.
