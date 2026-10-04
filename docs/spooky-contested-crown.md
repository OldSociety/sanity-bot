# Contested Crown and timed reversals — October 3, 2026

Config18 on unmerged feature/S-1-spooky supersedes earlier permanent/multiple Crown rules. Human chose 12-hour backwards names at 5% base chance, +10 Crown capture prestige and a 10% bonus on positive prestige earned while already wearing it. Slots remains held until Monday October5; refill remains 1 candy/18min pending separate implementation.

## Nicknames

Reversal expires after 12 hours or event end, whichever comes first. Existing startup/minute maintenance restores the saved original nickname (including null), composing other valid effects and preserving manual-edit conflicts. Existing longer reversals are shortened from their saved application time or original effect ledger timestamp. If neither survives, save one current application timestamp; do not renew it repeatedly. Eligible alternate targets exclude existing spells and pending/conflicting nickname restoration. Nobody eligible means the complete action rolls back, including candy cost. A repeat cast therefore picks another eligible target rather than stacking or refreshing a spell. Shield remains ✨( Name )✨, with leading-star fallback; curse remains ☠ Name ☠.

Trick weights: steal25, heist10, reversal5, curse5, curse backfire5, caught36, Crown theft1, Eye13. Treat weights unchanged. The durable non-candy repeat buffer halves special weights and normalizes the next ordinary table; reversal is then approximately2.92%, Crown approximately0.585%. Both Crown discovery and theft have identical 1% base/conditional buffered chance. No Crown holder: Treat can discover it, Trick theft maps to caught. Crown held: Treat Crown maps to ordinary gift; another player's Trick can steal. Holder cannot steal their own Crown.

## One owner and delivery

A scoped crown_holder ledger records the authoritative owner. Bootstrap adopts existing actual/pending holders once, retaining the latest previously awarded candidate (otherwise stable ID ordering), with no new score/currency. Duplicate holders get removal intents. Capture and admin test release share the root economy transaction; stale owner changes reject/refund. First win still grants +5 candy and +5 banked Fate, subject to caps; returning captures never farm those currency rewards.

Discord changes occur after commit. Exclusive grants freshly fetch guild holders, remove every other holder, check again, then add the new one. Failed removal leaves the grant pending for retry; superseded grants cannot re-add an old owner. Restart recovery uses durable desired state. This is one bot writer and cannot make external/manual Discord role edits atomic; maintain the bot above the Crown role. Crown remains after seasonal closure under the existing role policy.

## Scoring

Leaderboard ranks Treat + Trick + saved Crown bonus, without exposing scores in its public embed. Base formula:

| Outcome | Normal | Already holding Crown |
| --- | ---: | ---: |
| Successful action | +2 | +2.2 |
| Great Heist (+2 success +5 event) | +7 | +7.7 |
| Curse replacement | +1 | +1.1 |
| Lost candy / caught stealing | -1 | -1 |
| No effect | 0 | 0 |
| Crown capture (+2 success +10 capture) | +12 | Not applicable |

Holding adds 10% only to positive earned action points, excluding capture bonus; no time-based interest or penalty amplification. Earned points stay after losing the Crown. Existing integer Participant balances are unchanged. New fractional additions live as integer tenths in crownPrestigeTenths ledger rows, scoped to registration generation and source action. Ranking and November frozen proofs include these tenths; proof validates source action and historical Crown ownership. Saved older proofs remain valid. No historical rescore or schema migration.

## Presentation

Leaderboard uses Selene by default, then the latest recognized Spooky badge ownership in this guild. Prefer its native emoji image, otherwise supplied badge art; missing artwork uses accepted Selene fallback. Successful theft always uses the specifically requested Rihanna Crown GIF, including consecutive captures. This is the sole explicit exception to ordinary 10% GIF rotation. GIPHY crown-queen catalog identifies FrnpqArQZtti8 as Queen Rihanna GIF; direct media HEAD verified200 image/gif. Art, private screens and errors remain unaffected. Previous wearer uses existing quiet embed-only mention policy.

## Files and verification

Runtime: config/spooky-2026.json, config/spooky-gifs.json; services/spooky/crown.js (new), actions, playful, progression, leaderboard, winner-snapshot, winner-awards, discord-adapter, delivery, runtime, admin-controls, controller, presentation, flavor, gifs, config, wording-preview; services/badges.js. Tests: spooky-crown-contest (new), spooky-playful, spooky-progression, badges, spooky-controller, spooky-gifs, spooky-actions, spooky-simulation, plus offline simulation adapter Crown ownership support. Documentation: this guide, AGENTS, README, handoff, rules, checklist.

367/367 full tests, 85/85 focused and subsequent71/71 focused pass; 26 syntax checks and offline preflight/full registry pass. Logs: artifacts/spooky-crown-reversal-{full,focused,final-focused}.log and {preflight,registry}.json. Full tests include transfer removal failure/retry, bootstrap, stale grants, first-win/recapture, timer restoration/legacy expiry, fractional ranking/frozen proof and latest badge scope. No new population balance claim; old simulations remain historical.

Read-only readiness found development0 actual Crown holders and production1, both manageable; production34 reversal rows, development0. No command definitions/registration, dependencies, migrations, participant reset, manual balance correction or merge. Startup performs audited ownership adoption and legacy timer normalization. Process/post-start evidence will be recorded below.

## Exact next checks

Human: confirm one Crown holder, Treat never discovers while held, another player's rare Trick steals with Rihanna GIF, prior holder loses role, returning capture grants no repeat candy/Fate. Check +10 capture/positive10% scoring through private admin evidence, public latest-badge thumbnail, 12-hour original-name recovery and alternate reversal targets. Manual nickname edits or permission failures remain guarded queue follow-up. Existing production Unknown Message10008 / Unknown interaction10062 traces are separate unresolved work; this task does not claim to fix them. Preserve live databases/one writer, feature branch unmerged, and Monday slots hold.

## Live rollout evidence

Config18 rollout verified October3 13:23 Pacific: one reload each, both online/ready, production PID8612/restarts26 and development PID8044/restarts26, PM2 saved. Error logs unchanged from fresh pre-reload baseline (production2835954 bytes/20:19:35Z; development35694 bytes/September8). Read-only post-start checks: production exactly1 actual Crown holder matches initialized ledger; development initialized with no holder. Production reversal rows34 before/27 after startup cleanup. Seven expired rows were cleaned by normal guarded maintenance, not a manual reset. Preexisting production reportHandler Unknown interaction10062 and increased prior restart count remain unresolved; no new startup error in this rollout.

Sanitized reports: artifacts/spooky-production-launch/crown-contest-{before-processes,process-verification}.json, crown-contest-{development,production}-{before-readiness,readiness}.json and reload/save logs. The pre-reload report shows source config18, not proof that the already-running process had loaded it. No command registration or migration was required.

## Emergency response-delay correction — October3 13:30 Pacific

Human reported commands stuck thinking immediately after config18 rollout. New live adapter getRoleHolders used unbounded guild.members.fetch() twice per exclusive grant: gateway opcode8 requests with SDK default120-second chunk timeout, bypassing the shared gameplay directory's throttle/timeout handling. Before-command maintenance awaits delivery reconciliation, so a pending Crown grant could stall unrelated commands without throwing until the gateway timeout. The earlier fake-adapter transfer tests missed this real adapter path. This is a gateway membership wait, not evidence of a full ledger scan on each action.

Fixed services/spooky/discord-adapter.js to use fresh guild.members.list REST pages (limit1000, cache:false, after cursor), retaining full scan/exclusive remove-before-add safety and failing closed on network errors/non-advancing pages. No new gateway request or partial-cache shortcut. services/spooky/runtime.js now logs command error name/code/message instead of silently discarding the diagnostic; player response remains simple. New actual-adapter regression in tests/spooky-crown-contest.test.js verifies1001-member pagination, cache bypass, no gateway fetch and propagated REST failure. Existing removal/retry guards remain tested.

16/16 focused checks and two syntax/scoped whitespace checks pass; full follow-up evidence follows. Artifacts/spooky-crown-delay-focused.log and spooky-crown-delay-full.log. One emergency reload each: productionPID24508/restarts27; developmentPID9196/restarts27. Both online/ready; PM2 saved. Error logs unchanged from config18 baseline. Read-only production/development checks show zero pending Crown deliveries, initialized ledger consistent with actual roles (production1 holder/development0). Evidence artifacts/spooky-production-launch/crown-delay-{development,production}-readiness.json, crown-delay-process-verification.json and reload/save logs. Human confirmed a fresh command responds normally.

Remaining: old already-deferred interactions may remain visibly thinking after their process was restarted; use a fresh command. REST outages/rate limits can still delay role reconciliation; this fix specifically removes the repeated gateway request regression. Existing reportHandler10062 remains separate. No currency correction/reset, schema, configversion/odds, commands/registry/migrations/dependencies or merge. Exact next is ordinary live observation and prior12h/Crown/scoring/badge checks.
Final isolated full suite:368/368 pass (100.2seconds), including the real-adapter regression. No live player action was performed by the agent; the human confirmed normal response.
