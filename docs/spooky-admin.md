# Spooky administrator tools (Task 16 complete offline)

Implemented in source, not registered or live validated. Inspection, economy repairs, effect/pause/reset controls, audited badge recompute and explicit delivery resolution are complete offline. Permanent ownership is implemented independently of inventory; repairs report retained/current badge IDs and newly awarded IDs. All nine audit fixes pass offline; live acceptance remains Task 20. See [handoff](spooky-handoff.md), [corrections](spooky-audit-fixes.md) and [rules](spooky-rules.md).

## Access and visibility

All admin replies are ephemeral. Every request requires a freshly fetched human with Discord Administrator permission or `ADMINROLEID`, the configured guild, and a configured Spooky/bot-test channel. Command visibility does not grant authorization. DM and wrong-channel execution are rejected before real-model import; services independently recheck scope and permission, including on replay.

Only quarter awards and newly completed characters generate public announcements. These use the repaired player's name and registered-only mention, never the administrator as owner. Audit reasons and repaired balances remain private. Announcements enqueue atomically, then send after commit through the durable notification service. Ambiguous delivery does not refund, reroll or repeat a repair.

## Inspection commands

| Command | Result |
| --- | --- |
| `/spooky-admin player player:<member>` | Stored participant balances, registration/refill timestamps, prestige, inventory, effects/restoration metadata, limited wallet fields and character eligibility |
| `/spooky-admin transactions` | Scoped ledger rows and associated operation receipts |
| `/spooky-admin config` | Runtime environment, lifecycle, rules/version, reminder/winner/access settings, frozen winner proof, pause/archive and permanent badge service/catalog |
| `/spooky-admin deliveries` | Role/nickname projections and public notifications, including sending/uncertain/conflict rows |

`transactions` and `deliveries` accept optional `player`, `limit` (1–50, default 20) and `before` (positive row-ID cursor). All inspections accept `page` (default 1) for long JSON; page count appears in the embed title. Mentions are disabled and embed size is bounded.

Delivery and notification cursors are independent ID sequences. Use the appropriate returned cursor for the queue being inspected. Each request is a new snapshot, not a frozen multi-request export. Projection player filters refer to the affected user; notification player filters refer to the operation actor, not all mentioned recipients. Public awards caused by repairs therefore appear under the admin actor's notification operation.

Inspection works when disabled, paused or closed after required migrations are deliberately applied. It never migrates, enrolls, refills, changes queues, reconciles roles, grants badges or creates audit rows. Candy values are stored balances, not a refill preview. Wallet inspection exposes user ID, bank and unbanked fate; permanent ownership reports badge IDs/source/award time even without seasonal participation. Inventory eligibility is distinct from permanent ownership.

## Repair commands

| Command | Behavior |
| --- | --- |
| `/spooky-admin adjust player:<member> resource:candy delta:<signed integer> reason:<text>` | Correct stored candy; ±80 per request, resulting balance must be 0–80 |
| `/spooky-admin adjust player:<member> resource:eyes delta:<signed integer> reason:<text>` | Correct Eyes; ±100 per request, no negative balance; positive credits automatically convert each five into quarters |
| `/spooky-admin grant-quarter player:<member> piece:had_tl reason:<text>` | Grant one stable piece ID; fifth extra triggers normal automatic missing-piece exchange |
| `/spooky-admin remove-quarter player:<member> piece:had_tl reason:<text>` | Remove one extra copy; removing an only copy requires `last-copy:true` |

Reasons must contain 1–500 nonblank characters. Zero/fractional adjustments, unknown resources/pieces, nonexistent players and out-of-range results fail without changes. Requests use deltas, not absolute balance setters. Quarter grants/removals affect one copy per request. The per-request Eye bound limits repair batch size; it does not impose a gameplay daily draw cap.

Candy may be corrected for an existing nonregistered seasonal row. Eye/inventory corrections require registration. No repair creates a row, enrolls a player, spends action candy, touches bank/unbanked fate, changes prestige, or awards/revokes permanent badges. Inventory must be valid before repairs proceed; unknown/corrupt piece rows fail safely for later dedicated repair review.

Economic repairs bypass enabled/pause flags through a separate trusted collection composition but require the ACTIVE October interval and reject archived state. They do not introduce post-October redemption. General gameplay collection still enforces pause. Corrections apply to stored state without lazy refill. When candy starts or ends at capacity, reset the refill anchor to correction time to discard capped surplus; otherwise preserve partial accrual.

Removal is an explicit administrative correction, not duplicate exchange: an extra can be removed safely, while an erroneous last copy needs the explicit option and reason. It never awards an exchange result or silently revokes a future badge. Automatic duplicate consumption continues to protect every first copy.

All balance, inventory, conversion, exchange, audit and notification writes share one root transaction. Every derived ledger row carries the administrator reason/action, actor and config version. The operation type includes a hash of normalized action/target/resource/amount/piece/last-copy intent/reason/channel. Reusing an interaction with different semantics is rejected. Exact replay returns the saved receipt and random results, without applying a second correction.

If the private response or public notification fails after commit, the adapter reports Repair Saved when it can. Do not repeat with a new interaction; inspect transactions/deliveries first. Sending/uncertain notifications require explicit resolution below; they never blindly retry.

## Effect, pause and development reset controls

| Command | Behavior |
| --- | --- |
| `/spooky-admin clear-effect player:<member> effect:<type> reason:<text>` | Clear curse, reversed nickname or theft protection, with durable restoration intent |
| `/spooky-admin pause paused:true reason:<text>` | Persist a pause; `paused:false` resumes actions without changing enable flag or dates |
| `/spooky-admin reset-development player:<member> confirm:true reason:<text>` | Remove one development seasonal participant after queuing restoration and recording resources |

All controls require reasons and fresh authorization, and bind normalized intent/reason/channel to interaction replay. Clearing may run when disabled, closed or archived, enabling cleanup of expired effects. It never refills or enrolls. Only bot-owned curse roles are removed; missing ownership metadata preserves the role. Orphaned curse-add intents are cancelled rather than applied. Nickname restoration uses original and expected bot-applied names, including a null original. Independent edits yield a conflict, never an overwrite. Invalid/missing restoration metadata rejects the mutation.

Restoration instructions commit before effect deletion. After commit the adapter reconciles only the selected user, reporting pending/conflict/done privately. API or permission failures retain pending work; replies failing do not roll back committed controls. Clearing an absent effect is an audited no-op, except that unsafe pending nickname intents without an effect require inspection before clearing/reset. Resolve or cancel those inspected queue rows with the explicit interface below; unsafe orphaned nickname application cannot be retried.

Pause blocks registration, tricks/treats and acquisitions through existing guards; lazy refill maintenance continues. Pausing/resuming does not enable a disabled event or reopen a closed interval. Archived EventState cannot be changed/resumed. Pause reasons are stored on pause and retained in the ledger on resume.

Development reset checks both the independently selected runtime environment (`development`) and the actual SQLite storage against the trusted configured development path. Production, test environment and mismatched storage are rejected. Unit fixtures explicitly inject a disposable development target; slash options cannot override the guard. Confirmation is an explicit command option, not an extra conversational approval.

Reset removes only the scoped seasonal participant/inventory/effects. It preserves User, bank/unbanked fate, other participants/scopes, operations/ledger, global event state and permanent ownership. Every removed balance/piece and participant snapshot is audited. The actual BadgeOwnership table and retained ownership are now tested (Task9b); earlier sentinel evidence is historical. Re-registering starts new seasonal state; replaying the old reset cannot delete that new row.

Owned curse/nickname restorations remain pending after reset; stale Sweet Tooth/curse-add projections are cancelled. Already awarded Sweet Tooth roles are retained. Pending notifications owned by the participant's operations or their admin economy repairs are cancelled with audit rows; sending/uncertain rows remain and are reported. No message is deleted or resent. Cancelled delivery is terminal and never treated as confirmed cursed-message replacement, so the original message stays intact. In-flight external actions cannot be recalled; inspect ambiguous rows separately.

## Explicit notification and delivery resolution

- `/spooky-admin resolve-notification id:<row> action:<acknowledge|cancel|retry|resend> status:<inspected status> confirm:true reason:<text> [message:<observed message ID>]`
- `/spooky-admin resolve-delivery id:<row> action:<acknowledge|cancel|retry> status:<inspected status> revision:<inspected revision> confirm:true reason:<text>`

Both enforce fresh administrator authorization and owner event/guild, required private reasons/confirmation, exact inspected status and delivery revision, and request-bound replay. Terminal rows cannot be reopened. Evidence is fetched before the root transaction; row status/revision/payload are rechecked inside it. Resolution records snapshots/reasons in the ledger but never buys quarters, changes balances, rerolls effects or re-awards badges.

Notification acknowledgement requires an observed Discord snowflake message ID. A fresh lookup must find a message from this bot in the saved guild/channel with matching content and all persisted embed fields. Discord-added fields are permitted. This supports an operator's explicit acknowledgement; identical message bodies alone cannot prove which operation sent a message. Cancelling suppresses future automatic attempts; it cannot recall an already sent or in-flight message. A late send result/error cannot overwrite an audited terminal decision.

`retry` is allowed only for a pending, never-claimed notification. It dispatches only that row to its saved source channel after commit, not every row in the owning operation. An uncertain notification may instead be acknowledged/cancelled, or deliberately `resend` with confirmation and reason. Resend carries explicit duplicate risk: the original becomes cancelled and a copied payload gets a new operation/outbox row/nonce. It changes no economy state. Replaying the same resolution cannot create another copy or reroll. Sending rows cannot resend. If a resend also becomes uncertain, another intentional resend retains original player ownership; development reset cancels pending copies through that ownership.

Delivery acknowledgement verifies fresh member state already equals the desired nickname/role state, then marks done without a Discord write. Cancellation changes the revision and prevents old acknowledgements from completing a newer intent; it does not clear active database effects. Use clear-effect to end an effect. An API call already in flight cannot be recalled; live acceptance must still check recovery.

Delivery retry preserves the original payload/source revision. Nickname retries require current name to equal the desired or expected name; independent edits remain conflicts. Applying a curse/nickname requires an existing unexpired effect, active event and unarchived state. Restoring a nickname after closure requires the source operation's audited effect removal. Orphaned/expired applications cannot retry: inspect and cancel rather than forcing an overwrite. Reconciliation checks fresh state again and dispatches only the selected row, leaving unrelated pending work untouched. Permission failure stays pending and is inspectable.

Resolution results and evidence remain private. Public resend/retry uses the original saved payload and mention allowlist. None of these tools edits the saved reward amounts or changes event configuration.

## Architecture, files and verification

- `admin.js`: read service and common trusted authorization; composes repairs.
- `admin-repairs.js`: validated, replay-bound root mutations; existing-player/lifecycle adapter; ledger reasons and inventory eligibility summaries.
- `admin-controls.js`: audited clearing/restoration, pause, actual-storage/environment reset guard and scoped notification cancellation.
- `admin-resolution.js`: scoped evidence-backed queue decisions, request/revision guards, deliberate copies and zero-delta audit.
- `admin-command.js`: twelve definitions, private adapter, bounded audit pages and player-owned public award rendering.
- `admin-runtime.js`: fresh Discord authorization, lazy integration and transactional outbox hook, independent of play enable flag.
- `commands/Holiday/SpookyAdmin.js`: command-loader wrapper.
- `economy.js`: serialized read snapshots; existing root executor handles repairs.
- `collection.js`: trusted `allowPaused` constructor option, default false; only the admin repair composition opts in.
- `tests/spooky-admin.test.js`: 26 tests, including ten control tests and eight repair tests for validation/auth, cap/anchor behavior, concurrency/replay binding, conversion/exchange, last-copy intent/eligibility, rollback/retry, closure/archive/registration guards, and public send failure.

Full offline suite: **140/140 pass**; final focused admin/resolution suite 34/34 after resend-ownership changes. Nine Task 16d JavaScript files syntax-check successfully. Eight resolution tests cover auth/scope, proof/replay, selective retry/copies/reset ownership, stale snapshots/in-flight cancellation, projection evidence, nickname conflicts/orphans, after-closure restoration and private commit-before-dispatch. An integration regression verifies cancelled/absent cursed replacement never deletes the original. Fixtures are disposable SQLite; real migrations, login, command registration, deployment and art work have not occurred.

Task 16 and guarded storage tooling are complete offline. All nine audit findings now have fixes and 244/244 tests pass. Current continuation is explicitly authorized development acceptance; six remaining artworks/optional settings and public-launch balance stay separate. Curse restoration records the original role ID; legacy effects require saved intent evidence. Pending original repair/recompute awards can recover in bounded maintenance, while sending/uncertain rows remain manual. Late private replies cannot suppress committed public awards.

Task 18c1 update: private config inspection includes winnerSnapshot (null before closure capture), alongside reminder operational configuration. It reads the scoped companion Operation receipt without refilling or mutating resources. Frozen results are not proof of delivered titles; title delivery is now source wired but disabled/unconfigured. Full current suite 193/193 passes; see [winner guide](spooky-winners.md) and [handoff](spooky-handoff.md) for exact next work (20b2 apply/tracking). The earlier Task 16 evidence above is historical.

Task 18c2: config inspection includes winners operational settings. Deliveries lists final_treat_role/final_trick_role alongside prior projections; recent transactions includes winner_awards and discord_intent audit. Resolve-delivery accepts these kinds using the same scoped status/revision/fresh member evidence rules; retry does not bypass title guards, disabled/config-drift blocks automatic application, acknowledgement requires the desired observed role, and cancellation is terminal. Final announcements appear under the system-owned winner_awards operation, not each winner's player filter. Resolve-notification supports explicit pending retry/uncertain resend or observed-bot-message acknowledgement; manual sends bypass automatic eligibility and deliberately risk duplicates. Inspect frozen destination/payload first. Seasonal reset retains frozen results/final title intents; it does not revoke these titles or permanent ownership.

Storage recovery preparation now has a [runbook](spooky-development-acceptance.md). Its synthetic populated restore preserves audit/receipts and pending/uncertain queue states, which still require the existing evidence-backed resolution workflow; restore is not acknowledgement or permission to resend. No real database or admin/Discord commands were run in Task 20a.

Development status/backup interfaces are documented in the [storage guide](spooky-storage-tools.md). They export schema/table counts without player contents/credentials; no real database or admin commands ran in Task 20b1. Migration tracking/adoption remains unimplemented and requires explicit policy.

## Task 9b — audited badge reconciliation (2026-10-01)

Complete offline on `feature/S-1-spooky`. `/spooky-admin recompute-badges player confirm:true reason` reconciles one existing event-registered participant's inventory with permanent ownership. Fresh admin/guild authorization, explicit confirmation and a private reason are required. The request is bound to its interaction ID; changed requests fail and replays return the committed receipt. Valid registration must fall inside October. Unknown pieces or invalid quantities reject the entire operation. This is a per-player backfill, not a bulk server scan or forced badge grant.

All four owned positions make a character eligible. New ownership, badge ledger, zero-delta reconciliation audit and public completion outbox commit together; finalization failure rolls all of them back. Only newly awarded badges queue big public completions mentioning the owner; repair reasons remain private. Already-owned badges survive missing quarters. Reconciliation is allowed while play is disabled/paused and after closure/archive, but not before opening. It does not reopen redemption or alter candy, Eyes, fate, quarters, prestige, event archive or frozen winner proof.

Private player inspection includes permanent ownership IDs, source event and award time even if seasonal participation no longer exists. Development reset verifies ownership before/after in its root transaction, records `badge_preservation` evidence, retains wallet and audit, and cancels pending recompute announcements. In-flight/uncertain announcements retain the existing inspection policy. Replaying an old reset cannot delete a newly registered participant. Admin grants and recomputes reconcile configured emoji-access roles after commit; role API failures leave durable ownership intact. Access remains disabled with null role IDs.

Changed: services/spooky/admin-badges.js (new), services/badges.js, services/spooky/admin.js, admin-controls.js, admin-command.js, admin-runtime.js, scripts/spooky-preflight.js, tests/spooky-admin.test.js, tests/spooky-admin-badges.test.js (new), preflight report and current documentation. No new schema, dependencies, gameplay version or odds. Verification: full suite 220/220 passed; the six-test badge-administration file subsequently passed, including one additional controller/replay test not present in that full run. Static preflight passes with eight player/thirteen admin subcommands plus /badges. No real database or Discord access, registration, migration or deployment occurred.

Exact next task: extend the synthetic disk/WAL recovery rehearsal to all four migrations and actual permanent ownership, verify backup/restore and seasonal-reset retention, and save updated evidence. Then review the full command registry, obtain six remaining badge artworks, configure dedicated development access roles/Selene emoji permissions, settle balance and reminder/winner settings, and perform authorized live acceptance. Task9 overall remains open for recovery/live verification/artwork; seasonal-only three-migration rehearsal is still a known coverage gap. Existing balance targets remain unmet; approved version4 is unchanged. All event/reminder/winner/access flags stay disabled.
