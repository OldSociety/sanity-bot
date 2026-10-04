# Launch fixes, test reset and Selene presentation — October 2, 2026

Work stays on `feature/S-1-spooky`, config 8/manifest 2 and approved economy unchanged. The original [launch audit](spooky-launch-audit.md) and its saved defect JSON remain historical evidence. Positive verification now replaces its characterization script assertions; source acceptance is complete.

## Implemented corrections

- L01/L02: pending or conflicting restoration prevents another curse/nickname application from replacing its intent or original provenance. A restored nickname can be reversed again. Existing active-effect/pre-existing-role protection remains. Two positive regressions plus existing playful coverage pass: 12/12.
- L03: final notification status validation and starting the API request share the connection queue with cancellation. The response is awaited outside the queue/transaction. Cancellation during asynchronous eligibility causes zero sends; cancellation after API dispatch remains potentially ambiguous and needs inspection.
- L04: scoped notification inspection filters canonical owner (resolution owner, repair/recompute recipient, actor) before pagination. It includes ordinary, repair, recompute and resolution-copy notices for their player.
- L05: shared safe-name renderer uses Discord Markdown escaping including masked links after mention/newline neutralization; public actor/nonparticipant and leaderboard names use it.
- L06: achievement ownership and capped bank credit now share one IMMEDIATE transaction/connection queue. Concurrent repeated awards credit once; failure rolls back ownership too. Existing above-cap balances remain intact and receive no extra credit. Achievement removal also shares the queue. No real balances were repaired.
- L07: an archived season with no effects validates/reuses its saved winner proof and reconciles pending Discord projections without generating another maintenance operation. Winner/reminder/outbox workers remain scheduled; corrupt proof still fails closed. Existing key replays retain saved receipts.
- Admin config now exposes the independent weekly Fate reminder separately from the optional Resident reminder, through the same settings factory used by runtime.

Final full suite: **301/301 pass**; latest focused launch-fix/badge-access coverage: **15/15 pass**. All seven positive probes pass (spooky-launch-fix-results.json), 51 JavaScript syntax checks pass, preflight/full registry/development target checks pass, and synthetic four-migration storage recovery verifies retained badges/replay/reset with generated fixtures only. Evidence logs are under artifacts/spooky-development-session/launch-fixes-verified-full.log and launch-fix-final-focused.log.

## Full development test reset

New command: `/spooky-admin event reset-testing player:@you confirm:true reason:testing`.

It requires fresh administrator authorization, the selected development environment AND actual trusted development SQLite path, explicit confirmation and a private reason. It requires an existing seasonal player. It removes registration, candy, Eyes, inventory/duplicates, prestige and temporary effects; restoration is queued safely. It removes this event's permanent test badges only and queues Crown role removal. An audited Crown reset marker allows a fresh test win without deleting previous ledger awards. Other seasons' badges, the User account, Fate/Bank, operation/ledger history and frozen winner proof are retained.

Replaying the same reset never erases a later registration or new badge. Pending player-owned notifications cancel; sending/uncertain remain inspection-only. A broken orphaned nickname intent still requires inspection rather than losing original restoration information. Development badge-access membership is reconciled after commit, removing access when the test badge is cleared. The original `reset-development` command retains its less destructive permanent-badge/Crown preservation behavior. Neither command can reset production.

Fate/Bank preservation is the chosen default; no wallet-reset option or actual player reset was executed. New tests cover target guards, confirmation, rollback, preserved wallets/other badges/history, Crown re-eligibility and replay after re-registration.

## Completion and badge artwork

A fourth-piece award and character completion are now one public completion reveal; the finishing position/rarity appears in it. Ordinary/duplicate partial-piece reveals remain. The full token image stays large; the earned badge artwork uses the small thumbnail, replacing the avatar on that completion. The first completion-only Fate purchase still shows the committed Bank transition.

`assets/badges/SPOOKY_SELENE_BADGE.png` is the supplied PNG copied unchanged (36,877 bytes). `config/badges.json` maps it to Selene and native emoji `spooky_selene_badge`. The existing earlier Selene artwork is retained; historical token assets/receipts are unchanged. Six other badge artworks remain absent. Asset descriptors now allow a validated token plus badge attachment, with no arbitrary paths; inspected CDN evidence must resolve both image and thumbnail from trusted matching attachments. The private admin wording gallery includes Selene completion and clears old attachments when moving pages.

## Native emoji access

Discord guild emojis support allowed role IDs ([official documentation](https://docs.discord.com/developers/resources/emoji)). A dedicated zero-permission Selene collector role represents the individual permanent unlock; the emoji permits that role plus a dedicated zero-permission bot renderer role so embeds can display it. This development bot has no managed bot role; the helper verifies the fallback renderer belongs only to this bot. Owning a different character does not grant Selene access. Existing access reconciliation remains year-round and repairs on views/actions/level-ups, including removing membership after the explicit development test reset. Returning members repair on their next supported interaction; no background member-join worker was added.

Development settings are nested and pinned to both selected environment and guild. Global production settings remain disabled/null. `scripts/spooky-development-badge.js --inspect` performs authoritative development REST reads without DB/gateway access. `--setup` validates permissions/role hierarchy/channel overwrites, creates/reuses the dedicated cosmetic role and unique available guild emoji, verifies its restriction list, then enables only the pinned development configuration. Setup assigns the renderer role only to the development bot. Human collector access is reconciled from durable badge ownership. It never writes production, deletes emojis or prints credentials.

Development setup verified guild 684459745167671453; collector role 1555701816296079381, bot renderer 1555701812374405211 and :spooky_selene_badge: emoji 1555701817575219222. Exactly those two roles are allowed; old emoji retained. Evidence: artifacts/spooky-development-session/selene-emoji-setup.json. Global production access remains disabled/null. Native picker and human membership acceptance remain for testing.

## Changed files and next steps

Application: playful, notifications, admin/control/controller/runtime, lifecycle, shared display-name/Fate wallet, achievement handler, reminder settings factory, token-art/presentation, wording gallery, badge-access selection, badge catalog/development settings and the new asset. Tools/tests: updated audit probe, memory simulation adapter, new development badge helper, launch-fix tests and existing affected admin/badge tests and SQLite simulation fixture (delivery migration added to its private in-memory test schema). Shared Fate bank credits/level overflow preserve preexisting above-cap bank values without granting more; this is covered by a positive regression. No migration, dependency, economy odds/refill/cost/version or production activation changed.

Development registry review/apply SHA-256 a9e87c78c835944a9b5f12f4a68e5782bb27266897ccaedd13ddb6b6945078fe preserved /game and all fourteen commands; only spooky-admin changed. Fresh GET confirms desiredMatch=true. One development-only reload is verified online, PID 360/restarts 10; production stopped/restarts 0. Error log remains 35,694 bytes, last changed September 8. No manual player reset, migration or production change.

Next: use the new reset command on the test player, re-register, earn Selene, verify exactly one completion with badge thumbnail, collection icon and native emoji picker access; reset again and verify access removal while Fate/Bank/history stay intact. Review gallery, Bank arrows, channel restrictions, role restoration and uncertain queue recovery using the development runbook. Balance targets, finale role/channel/time and six artworks remain open; no balance change is authorized by the request to fix code.
