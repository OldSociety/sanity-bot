# Spooky development acceptance and storage recovery

**Live setup completed (2026-10-02):** Human authorized migrations/registration/development PM2 startup. Four migrations, verified backup, permissions/intents and fourteen registered commands pass; SB-development online with development-only gameplay. Production and optional workers/access unchanged. See [session evidence](spooky-development-live-session.md). Hands-on player matrix remains pending; earlier no-live-operation statements describe prior preparation. Do not execute stopped-writer storage commands while the bot is running.

Latest full isolated suite **252/252 pass**; live setup is verified, player interaction/visibility/recovery acceptance still needs human testing.

Subsequent onboarding change: **253/253 pass**, seven-subcommand definition registered and development restarted. Register now includes introduction/avatar/🍬 and 🧿 footer; no separate welcome. Test that repeat registration preserves balances and inspect avatar/footer on Discord.

**Preparation update (2026-10-02): 250/250 offline tests pass.** The human supplied development CURSEDROLEID and `npm run spooky:check:dev` now passes for all required roles and bot-test channel. No live/database action occurred; all flags remain disabled. Next is an authorized live session with guild/permission/intents/storage/registry verification. Earlier 244-test counts are the audit milestone.

**Audit corrections complete offline (2026-10-01): 244/244 tests and 20 positive regressions pass.** Read [fix evidence](spooky-audit-fixes.md) and [current handoff](spooky-handoff.md). The nine source/adapter defects are fixed; this matrix still requires explicit live-session authorization and actual server evidence. All flags remain disabled; no real storage/network setup has occurred. Dated notes below are historical.

Task 20a preparation completed offline on `feature/S-1-spooky`, 2026-10-01. This is a runbook and synthetic storage rehearsal, not completed development-server acceptance. Tasks 18 and 20 remain unchecked. Event, reminders and winner delivery remain disabled; permanent badges are implemented offline; six badge artworks and live verification remain pending.

## Recorded offline evidence

Run from the repository root:

```powershell
npm test
npm run check:dev
npm run spooky:check:dev
npm run deploy:check:dev
node scripts/spooky-storage-rehearsal.js
```

The first command runs disposable fixtures/mocked Discord. The two target checks read the selected environment configuration without opening its database or contacting Discord. The last command accepts **no arguments or database paths**: it creates synthetic OS-temp databases, prints a JSON report and removes its own files/connections, including tested interruption paths. It never imports the global database or Discord runtime. No dependency installation is required.

Current full suite: **244/244 pass**, including 20 audit regressions and all existing storage/WAL coverage. Positive audit runner 20/20, static preflight/full registry, 33 syntax checks and both offline target checks pass. Restored AUTOINCREMENT high-water marks preserve removed participant generations, so their identity is not recycled after restore.

Saved [storage rehearsal results](spooky-storage-rehearsal-results.json) record SQLite 3.44.2, the exact four migration hashes, WAL journal mode, consistent `VACUUM INTO` backups, successful integrity/foreign-key checks, reverse schema rollback and reapplication. Restored baseline and populated databases match their logical schema/data hashes. Existing synthetic User bank 73/unbanked fate 12 survives unchanged; operation receipts, inventory/effects, pending role intent and uncertain notification survive populated restore. Queue states are preserved rather than falsely marked delivered. Synthetic data includes the actual User model and a legacy-data sentinel, not a clone or inspection of the real development database. Logical hashes vary between runs because synthetic timestamps vary; migration hashes identify the recorded schema inputs.

Read-only target checks on 2026-10-01 confirmed development application `1291847176569360476`, guild `684459745167671453`, and `<repository>/config/dev.sqlite`, with a distinct configured production guild. Token values were withheld. These checks do not prove bot token ownership, live permissions, command visibility or server behavior.

## Gates before a live development session

| Item | Current state | Required evidence |
| --- | --- | --- |
| Branch and work | Feature branch; uncommitted implementation plus earlier holiday/haiku/package work | Preserve all changes; record reviewed source revision/snapshot before deployment |
| Branch audit | All nine findings fixed offline; 244-test audit milestone and 20 positive regressions pass | Verify live adapter behavior in the matrix; retain one-writer and ambiguous-send constraints |
| Development runtime settings | Offline check passes after human supplied CURSEDROLEID; required roles and bot-test channel valid, production guild distinct | Verify guild ownership, permissions, hierarchy and portal intents live |
| Economy balance | Task 17 targets unmet; approved v4 unchanged | Core development testing can use current settings; resolve balance before public event activation |
| Reminders | Disabled; channel/Resident IDs/Pacific time pending | Exact supplied destination/allowlist/time, development-server validation |
| Final titles | Disabled; names/role IDs/announcement channel pending | Distinct supplied roles/names, destination, hierarchy and permissions verified |
| Artwork/badges | Permanent ownership and Selene implemented offline; six artworks missing | Test acquisition, profiles and leaderboard now with generic medals; verify Selene live; remaining art does not block core testing |
| Migration tooling | Task 20b status/backup/plan/apply complete offline; destructive restore CLI absent | Review real target and fresh plan hash with writers stopped before authorized application |
| Discord session | Not authorized/executed in this offline step | Explicit authorization for real development migration/login/registration/test messages; production remains separate |

Use one bot writer. Prepare the configured Spooky/bot-test channels, an administrator, two registered human test players and an unregistered test member. Runtime needs complete GuildMembers fetch, MessageContent for curse behavior, and relevant channel permissions. Role grants require ManageRoles and bot hierarchy above both target member and role; managed/everyone roles and the guild owner cannot receive these managed actions. Nickname changes need ManageNicknames and an eligible target. Confirm role IDs belong to the development guild. Existing Sweet Tooth remains the random gameplay role.

## Migration and backup procedure

The fixed apply order is:

1. `20261001000000-create-spooky-core.js` — six seasonal state/inventory/effect/operation/ledger tables and indexes.
2. `20261001000001-create-spooky-delivery.js` — desired role/nickname intents.
3. `20261001000002-create-spooky-notifications.js` — public outbox referencing operations.
4. `20261001000003-create-permanent-badges.js` — independent permanent badge ownership; never remove during seasonal reset.

Model definition does not migrate/sync these tables. Do not use force/alter sync. Standalone up modules remain non-idempotent; rerunning applied up fails. The reviewed runner injects one EXCLUSIVE transaction through all four up functions and tracking writes; core retains its own transaction only for standalone use. Inspect exact schema/tracking first. Matching existing prefixes need explicit adoption, partial/mismatched schema blocks. Do not run a generic/uninstalled sequelize-cli or rerun/drop unexplained schema.

For an authorized real migration session:

1. Stop every bot/worker that writes the selected development database. Record environment/guild/application, resolved DB path, source/migration hashes, configuration and prior command definitions. Retain the working checkout; no Git reset/clean.
2. Create an exclusive, uniquely named SQLite backup and verify `PRAGMA integrity_check` = `ok`, `PRAGMA foreign_key_check` returns no violations, and expected existing tables/accounts are readable from a separately opened backup. Use SQLite's consistent backup mechanism; the rehearsal verifies `VACUUM INTO` on the installed SQLite version. It must run outside a transaction and must not overwrite an existing backup file. Record backup location/hash/time. Do not copy only an open main file while WAL writes exist.
3. Run the explicitly reviewed target-checked migration tool in the order above; record exact completed prefix. Verify all eight seasonal tables plus BadgeOwnership, uniqueness/check constraints/indexes and foreign keys, plus unchanged existing User/legacy data. Fail before starting the bot if inventory/schema evidence disagrees.
4. Retain the baseline backup. After accepted test writes, make a second consistent snapshot preserving receipts/queues so later restoration need not erase those writes.

The synthetic rehearsal cannot target real databases. Task 20b tooling now provides reviewed development status/backup/plan/apply with disposable target, prefix and interruption tests. Real apply/restore remains separately authorized; no destructive restore CLI exists.

## Development execution sequence

Once the gates and authorization are met, recheck targets immediately before each live operation. Existing commands below perform real actions and were **not run** during preparation:

```powershell
npm run deploy:dev -- --plan
# Review exact snapshot, desired commands, removals and SHA-256 before applying.
npm run deploy:dev -- --apply REVIEWED_SHA256
npm run start:dev
```

`deploy:dev` now defaults to a networked live plan with inert validated definitions and a saved registry snapshot; it does not register automatically. `--apply HASH` refetches/revalidates the reviewed plan, saves a pre-PUT snapshot and verifies returned definitions. Review all removals, including live-only commands, and coordinate one deployer. An ambiguous PUT error requires inspecting the live list before retry; a hash is not a server lease. See [registry guide](command-registry-audit.md). `start:dev` logs in and runs unrelated holiday/XP/fate behavior too. Spooky disabled gates its runtime, not the rest of the bot. Keep one writer, record errors without credentials and restart after immutable JSON changes. Enable only reviewed development settings; optional workers/access remain disabled until their dedicated tests.

## Acceptance matrix

Mark live evidence with date, tester IDs, interaction/operation IDs, before/after private state and screenshots/message IDs. Do not record tokens. Existing offline tests cover deterministic/random branches; live play is not required to exhaust a probability table by brute force. Each row remains **LIVE NOT RUN** at this boundary.

| Area / actual commands | Expected result and evidence |
| --- | --- |
| `/spooky register`, `/spooky help` | Registration includes newcomer/returning introduction, avatar and 🍬/🧿 footer balances; names match seven subcommands; disabled help still works; no arbitrary mentions. No separate welcome command |
| `/spooky register`, `/spooky status` | First economic touch seeds 10 candy; repeated registration keeps state; +10 per three elapsed hours/cap 80/no catch-up; status reports own state privately. Exact timed accrual already verified with injected clocks offline |
| Guild/channel and admin gates | Wrong server/channel rejected; normal user cannot use admin tools; fresh admin authorization; no economy mutation on rejected requests |
| `/spooky treat`, `/spooky trick` | One candy action debit in ledger, including curses/break-curse; net balance may also reflect the selected gift/loss. Legacy effects remain; personal outcomes private, other-player outcomes public |
| Burst actions / member directory | Spend 5–10 candies and affordable fate draws rapidly across two registered players, including soon after startup; no repeated all-member fetch collisions, incomplete-roster acceptance or 120-second stalls; joins/leaves and fresh target roles remain correct |
| Slow responses / saved operation | /user acknowledges before slow emoji/access work. Injected post-commit private reply failure cannot stop eligible public reveal; show saved operation reference, no second charge/refund/reroll; optional access failures do not hide ownership |
| Registered/nonregistered targets | Registered targets tagged via strict allowlist; nonregistered visible as plain names; random trick eligibility excludes self/bots; no unregistered Eye balance |
| Theft and heists | Candy/Eye debit and credit equal; caps/protection respected; Eye find only when no eligible funded victim exists; no quarter theft. Inspect related-user ledger entries |
| Shields/curses/nicknames | Shield giver/recipient for one hour; curse/reversal until broken/end; bot-owned role removal only; independent nickname edits cause safe conflict. Permission failures keep retryable intents |
| Automatic quarter | Admin seed below threshold, then eligible credit: `/spooky-admin adjust player:<test> resource:eyes delta:5 reason:<test reason>`; five Eyes converts in the same transaction; large public reveal, no separate redeem command. Admin repair draws are test setup, not ordinary odds evidence |
| `/spooky fate` | Registered bank holder, including without Unwanted, spends exactly 10 bank; unbanked fate untouched; affordable repeat draws allowed; insufficient bank fails atomically |
| Sweet Tooth | Legacy random role outcome retained; normal Unwanted caller gets +1 bank/cap 100; other players lack that bank bonus. Test branch deterministically offline and inspect any observed live occurrence |
| `/spooky collection`, duplicate exchange | Use reason-required `/spooky-admin grant-quarter player:<test> piece:had_tl reason:<test reason>` and other stable IDs to prepare five extras; automatic exchange consumes exactly five extras, keeps first copies and awards an unowned piece regardless of rarity; full collection retains extras |
| Character completion / presentation | Four positions complete one character; permanent ownership and badge ledger commit with quarters, prominent public completion and cumulative/full-circle token art. Verify Selene emoji and generic earned medals for missing artwork, question marks for unowned badges, /badges view/leaderboard, /user and level-up rendering. Replay/reset must retain ownership without duplicate announcement |
| Private admin inspection | `/spooky-admin player`, `config`, `transactions`, `deliveries`: pages/cursors, private reasons, no mentions; inspection does not refill or mutate; winner announcement rows are system-owned so inspect without a player filter |
| Admin repairs/controls | Audited adjust/grant/remove; only-copy removal requires `last-copy:true`; clear-effect safely restores; pause denies new actions but retains cleanup; reset-development requires actual development path+confirm and preserves wallets/audit/frozen results |
| Restart / delivery recovery | Repeat/replay worker work does not duplicate resources; pending roles compare fresh state; acknowledged/sent/cancelled notifications never reopen; uncertain sends require inspection, evidence and explicit manual decision |
| Cancellation / superseding intent | Cancel or revise while member fetch is delayed, before the API write; old role/nickname is not applied. Separately document already-in-flight request limits. Restart after curse role config change restores only the original bot-owned role |
| Message and wallet concurrency | XP/haiku/level-up failures do not suppress curse handling. Concurrent messages crossing one level threshold award fate once; purchases and legitimate later credits preserve balances |
| Reminders | With supplied settings and authorized activation, correct Resident allowlist/channel/every-three-Pacific-days/latest-due-only behavior; no backlog spam; pause/closure/changed config suppress pending automatic sends. Deterministic cadence already tested offline |
| Closure / titles | Exact Nov 1 07:00Z boundary; no redemption; cleanup/proof/archive commit together, records retained; actual actors/ties/admins/both titles; winner config drift/disable blocks delivery, empty track has no role. Announcement uses frozen winners and hides scores |

Current runtime has no development-only clock override or force-outcome slash command. Closure/draw odds/rare outcome proofs use injected service clocks/RNG and disposable mocked tests. Early live closure validation requires a separately reviewed development-only mechanism, or observing the actual boundary; do not change the OS clock or silently edit live seasonal dates. No new test-mode commands were added here.

## Recovery and rollback

Choose the narrowest repair supported by evidence. Pause stops actions but maintenance/restoration still runs. Disabling the event stops its scheduler too and does not remove existing roles, restore nicknames, cancel outbox rows or delete Discord messages. Complete/reconcile owned restorations while maintenance is available, or use the inspected private tools; do not assume an off flag undoes external effects.

- For an economy concern, inspect player/ledger/receipts before correction; use reason-required delta/piece repair instead of replaying an interaction with a new ID.
- For a pending role failure, fix permissions/member eligibility and retry desired state. Use `resolve-delivery` with inspected status/revision/confirmation/reason; independent nickname conflicts are not force-overwritten. Acknowledgement requires matching observed state.
- For `sending/uncertain` notifications, inspect the channel and saved payload/message evidence. Acknowledge the matching bot message or explicitly cancel. Deliberate uncertain resend can duplicate a prior message; pending retry sends only the selected row. Never erase claim state to auto-retry. Manual sends can override scheduled eligibility.
- For startup/schema failure before new player writes, stop writers and restore the verified pre-migration backup under a separately reviewed procedure. Seasonal-schema removal uses reverse order notifications → deliveries → core and retains BadgeOwnership. Full four-migration rollback removes permanent badges first and destroys ownership; never use it for a seasonal reset. No real down/restore CLI is provided. **Schema down is destructive, not a season archive.**
- After player writes, prefer code/config correction while retaining migrated storage. Preserve a populated backup and queue evidence before any restore. Restoring an older DB loses every subsequent write, including unrelated XP/fate/holiday changes; use the accepted backup point deliberately. Never merge receipts/queues from incompatible snapshots ad hoc.

A restore must happen with writers stopped and connections closed. Validate into a new file first, compare expected schema/data, then use the reviewed target tool to replace the selected DB and handle only its exact stale WAL/SHM/journal files. Keep the displaced DB/sidecars for inspection. The rehearsal restores only into new synthetic paths and does not implement real-file replacement. A DB restore cannot retract Discord roles/messages already sent. Inventory those external effects and replay risks before restarting, especially when restored intents say pending/uncertain. Restore the prior reviewed command list if command registration must roll back; do not empty the guild list as a shortcut.

## Exact continuation

1. Read this runbook, [handoff](spooky-handoff.md), [storage guide](spooky-storage-tools.md) and [winner guide](spooky-winners.md); retain the feature branch/dirty work.
2. Tasks 20b1/20b2 are complete offline: status/backup/plan/apply with reviewed hash, verified backup, atomic DDL/tracking/provenance and explicit matching-prefix adoption. Nine new apply tests bring full suite to 220/220. Optional migration transaction injection changes source hashes but not DDL; [synthetic rehearsal results](spooky-storage-rehearsal-results.json) were refreshed. No destructive down/restore CLI or real DB operation.
3. Task 20c scoped preflight is complete: run `node scripts/spooky-preflight.js` without arguments. [Saved preflight](spooky-preflight-results.json) validates 28 pieces, eight player/thirteen admin definitions, approved rarity and exact lifecycle boundaries without credentials/DB/network. It reports gates, not live readiness, and does not validate the complete legacy registry or startup. Review those before any bulk registration.
4. Use approved v4 for bounded correctness testing only with session authorization; settle unmet public-launch balance separately. Do not guess reminder/winner/access settings. Permanent ownership/Selene and all token images are implemented; six badge artworks remain pending. Leave all four activation flags disabled until their appropriate gates are settled.
5. Only with explicit development-session authorization: stop writers, verify intended application/guild/permissions, inspect real status/plan and review its hash, apply with verified automatic backup (explicit adoption mode only when reviewed), register the reviewed dev command set and record every applicable live matrix row. Real clock closure is still pending; offline injected clocks cover exact boundary. Full Task 20 stays unchecked; badge/art rows stay deferred.
6. Retain backup/manifests/provenance and external delivery evidence; use narrow admin repair first. A real restore replacement procedure still needs review/authorization. Production deployment remains Task 21 and a separate explicit request.

## Historical milestone notes

These dated snapshots retain earlier evidence. Their test counts, deferred-art claims and next-step instructions are superseded by the current status and audit correction guide above.

Current token art state (2026-10-01): all 105 single/combined/full-circle PNGs are shipped; four-piece rewards and character completion show full circles. Hellfed Marq square artwork was edited into a circle with transparent exterior; other six full circles are unchanged. The token artwork guide records the built-in edit prompt, source mapping and durable attachment behavior. Permanent badge core/profile/level-up are implemented with Selene; audited backfill is complete offline; six artworks remain pending. Full224/224 tests and refreshed preflight pass; no real DB/Discord changes. Next review the full command registry, obtain badge artwork and resolve balance/operational/live gates.


Current badge state: [permanent badge guide](badges.md) is authoritative. Task9a core and Selene first artwork implemented; 9b audited recompute/backfill is complete offline; six other badge artworks remain pending. New fourth migration creates permanent BadgeOwnership; guarded storage now requires all four groups for complete. Current disk/WAL rehearsal covers all four migrations and permanent ownership; older three-migration evidence is historical. New /badges view and /badges leaderboard share rendering with /user and level-ups; unowned = question mark, owned without emoji = medal, Selene resolves server emoji by name. Last full224/224; no real migrations, Discord registration or emoji verification. Keep all flags disabled. Offline full command registry review is complete. Exact next: resolve balance/server settings, then authorized live acceptance.


Badge emoji access update: [access guide](badge-access.md) verifies Discord guild emoji role restrictions and implements seven independent cosmetic access roles projected from permanent ownership. Config enabled=false/all role IDs null; no live emoji/role changes. Explicit setup allows each badge role plus dedicated managed bot role for embeds. Post-commit gameplay and year-round badge/profile/leaderboard/level-up views reconcile roles; permission/channel-overwrite validation fails closed, errors preserve ownership. Four mocked tests; no new schema/dependency/gameplay odds/version. Next configure/test Selene first on the verified development server; permanent disk recovery and live acceptance gates remain. No periodic/member-join worker: rejoining repairs on next view/level-up/action.

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

Complete offline on feature/S-1-spooky. See [registry guide](command-registry-audit.md) and docs/command-registry-audit-results.json (paths are relative to repository root). scripts/command-registry-audit.js validates all working-tree command definitions against local HEAD with inert substitutes for global models and execution-only imports. No credentials, DB, Discord or interaction execution. Thirteen active commands; three disabled files; no duplicate/invalid definitions or missing active HEAD commands. Deleted Halloween command was already commented out. Additions spooky/spooky-admin/badges plus preexisting Winter throw/slots are preserved. The report records definitions, hashes and baseline commit; full registry runtime handlers and server-only commands remain live acceptance work. Bulk PUT is still a replacement: compare live guild commands before registration.

Changed: new audit script, tests/command-registry-audit.test.js, registry guide/report, scripts/spooky-preflight.js, refreshed preflight report and current docs. Existing loaders, game config/version4/odds/schema/dependencies and disabled flags are unchanged. Next resolve launch settings and unmet balance targets with the user; then authorized development live registry/migration/interaction/access/recovery acceptance. Six badge artworks remain pending. Nothing was registered, deployed or migrated into real storage.

Registry validation: focused audit tests 3/3 passed; full npm test 224/224 passed; three changed JavaScript syntax checks, static preflight and README whitespace check passed.
