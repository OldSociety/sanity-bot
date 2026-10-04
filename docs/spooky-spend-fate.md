# Confirmed Fate purchases and exclusive admin access — October 2, 2026

This change is config **9**, manifest **2**, on the live, unmerged `feature/S-1-spooky` checkout. It supersedes older Bank-only purchases, `/spooky fate`, and Administrator/custom-role authorization. Production launch/data/backup evidence remains in [the launch guide](spooky-production-launch.md). No schema migration, dependency, manual player purchase/reset or historical receipt rewrite is required.

## Player behavior and invariants

`/spooky spend-fate` shows a private two-minute offer with Confirm/Cancel, the player's avatar, candy/Eye footer and inline **Fate / Bank / Total** before/after values. Ten points buy one random quarter: drain Bank first, then Fate. For example Bank 7/Fate 12 becomes Bank 0/Fate 9. Cancellation, expiry, another player's click, an expired/restarted button, or failure to show/acknowledge the offer cannot charge resources. Acquired pieces/completions remain public.

The quote is read consistently without a held transaction during the two-minute wait. Confirmation rechecks membership, ACTIVE/unpaused/unarchived registration and the exact quoted Bank/Fate values; changed balances reject and require a new offer. The debit uses a conditional update of both wallets, ledger rows, quarter/duplicate/badge writes and durable notification in one original-interaction economy transaction. Failures roll back the entire purchase. One synchronously claimed button decision prevents concurrent Confirm/Cancel races. Stored replay uses the saved receipt even with an empty wallet or closed season and never requires another purchase. Restarted pending prompts expire safely; committed public notifications retain existing outbox recovery.

The human explicitly approved Fate odds **50% common / 35% rare / 15% legendary**. Ordinary Eye draws remain **70/22/8**; duplicate exchanges remain uniform over missing pieces. Only Fate acquisitions use the new draw path. Player embeds/help/reminders never disclose the differing odds. Unlimited Fate draws and October-only new purchases remain unchanged. Historical draws/receipts keep their original outcomes; existing queued reminder wording is not retroactively rewritten.

## Admin access and Discord visibility

`BOTADMINID`, the selected `GUILDID`, and a human actor must match exactly. Fresh Spooky administration authorization runs before constructing global DB services and on privileged button/repair paths. Administrator permission and ADMINROLEID never bypass it. Legacy shop add/remove/restock, Fate manage and achievement mutations/secret-all view use the same owner guard; public shop/Fate/achievement views retain their normal access.

`/spooky-admin` now has `default_member_permissions: "0"`, hiding it from regular members by default. Read-only REST checks verified BOTADMIN is a human Administrator/server owner able to see it in **both** selected guilds. Runtime guards enforce exclusive use even if server integrations permit another role.

Discord itself lets server Administrators see commands regardless of command permission restrictions; mixed public roots cannot hide just their admin leaves. Bot-token APIs also cannot apply per-user guild command permission overrides (those require a user OAuth Bearer token). Therefore absolute invisibility to other Administrators is not achievable here; exclusive execution is enforced. See [Discord application command permissions](https://docs.discord.com/developers/interactions/application-commands#permissions).

## Changed files

- config/spooky-2026.json; services/spooky/config.js, collection.js, fate-purchases.js: config 9, separate Fate rarity and atomic Bank/Fate payment.
- services/spooky/fate-confirmation.js (new), controller.js, presentation.js, command-definition.js; events/interactionCreate.js: confirmation, expiry, replay and updated onboarding/help. Duplicate-progress thumbnail remains preferred to avatar.
- utils/botAdmin.js (new), checkPermissions.js; services/spooky/admin-runtime.js, admin-command.js, admin.js; commands/Shop/Shop.js, Fatepoints/Fate.js, Achievements/Achievements.js: exclusive admin authorization and private command defaults.
- services/spooky/runtime.js: weekly Fate reminder uses new command/payment wording. scripts/spooky-population-simulation.js uses Fate rarity; its historical Bank-only scenarios are unchanged and were not rerun as a forecast. scripts/spooky-preflight.js reports current overrides/placeholders accurately without credentials/live access.
- Tests: new spooky-fate-confirmation.test.js and bot-admin.test.js; updated spooky-fate-purchases, controller, admin, audit-corrections, integration tests. Refreshed offline preflight/registry evidence and README/AGENTS/handoff/rules/checklist.

## Validation and exact continuation

Focused confirmation/payment/controller/admin tests: **58/58**; delivery recovery/art regression: **16/16**; owner guards including all legacy admin mutations: **3/3**. Tests use only synthetic storage/Discord. Full-suite and live rollout results are appended below after verification. Registry plans preserve all roots: fourteen development (including server-only /game), thirteen production, no removals. Only spooky's renamed leaf and spooky-admin's default visibility change definitions. No real economy action is performed by the agent.

Next after rollout: human check a private offer, Cancel without charge, Confirm with one public quarter and matching Bank/Fate values, and a second account's admin denial. Keep live observation on this feature branch; no merge until requested. Five accepted badge placeholders and historical balance forecasts remain limitations. Ambiguous notification recovery remains manual and the one-writer constraint remains in force.

Final verification and authorized rollout: **318/318 full tests**, 58/58 focused purchase/controller/admin, 16/16 delivery/art, 3/3 legacy owner guards, final 3/3 confirmation checks, 26 syntax checks, refreshed offline preflight/full registry/positive probes and scoped whitespace pass. The final confirmation change only routes post-collector clicks to the expired-button handler; focused tests passed afterward. No live economy action, manual resource correction or schema migration occurred.

Reviewed development plan **7369f5c5d486780f113cd60d034e14e7f95d261d2267a1702df6b0aafca32842** and production plan **a9cb70e1c285d97ca01141f3388c2deb8b741f83885b5daf98801b92a6aeaef8** applied exactly once each. Fresh GETs match: fourteen development commands (/game retained), thirteen production, zero removals. One PM2 reload each: production online PID 18264/restarts 2, development online PID 19148/restarts 16; process list saved. Both readiness messages are current and error logs retain their old September sizes/timestamps (production 2,819,038 bytes, development 35,694 bytes). Config 9 is live in this unmerged checkout. Evidence: artifacts/spooky-production-launch/spend-fate-{full,focused,recovery,owner-tests,confirmation-final}.log, spend-fate-*-plan/apply.log, *-botadmin.json, *-registry-check.json and spend-fate-process-verification.json.

Exact next: human test Cancel, one Confirm with the projected balances, and admin denial on a different account; continue observing production on this feature branch. Restarted pending offers never spend; already committed rewards remain saved. Do not merge, replace storage, reset production or enable unrelated workers. Existing notification ambiguity/one-writer limitations and five accepted artwork placeholders remain unchanged.
