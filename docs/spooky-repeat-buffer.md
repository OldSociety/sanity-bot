# Repeat buffer and eligible backwards-name targets — October 3, 2026

Config17 on unmerged feature/S-1-spooky. Human reported two paid backwards-name results against the same already-reversed person and requested fewer consecutive non-candy results plus a useful alternate target. This supersedes the old paid alreadyReversed handler behavior. Shield/curse exclusivity, saved originals, long-name sparkles and restoration remain unchanged.

## Target correction

The reversal handler now filters before selecting randomly inside the root transaction. Exclude the actor, bots, unmanageable nicknames, any existing reversal/curse/shield row (including expired rows still awaiting restoration), and pending/conflicting nickname deliveries. This avoids repeating an existing reversal, replacing restoration metadata, and creating a reversal hidden under a more visible spell. Pick randomly from remaining eligible people. If nobody qualifies, reject with NO_REVERSAL_TARGET and roll back the entire action, including refill, cost and operation. No paid no-effect receipt or gameplay reroll. Existing curse/shield choice eligibility stays intact.

## Action buffer

After the caller's last committed Trick/Treat was a non-candy outcome, halve the weights of all ordinary non-candy outcomes for the next action and normalize the table. Config actionBuffer.specialWeightPercent=50. Non-candy group: reverse_nickname, curse_target, curse_backfire, temporary_immunity, break_curse, sweet_tooth, find_eye, steal_or_find_eye; curse_spread also activates the next ordinary buffer. Candy gifts, theft/heist, lost/caught outcomes and cursed distributions do not activate it. Cursed replacement chance/split remain unchanged; the buffer applies to the normal outcome table when no replacement occurs.

This reduces the conditional ordinary special-result share from 33% to about 19.76% for Trick and 29% to about 16.96% for Treat. It does not ban repetitions or guarantee candy rewards. Base percentages, piece rarity pools and Fate purchase odds remain unchanged, but overall long-run Eye/crown/spell incidence is lower under this policy. Previous population balance reports are historical; this task does not claim a new population balance measurement.

Read only the caller's completed spooky_trick/spooky_treat operations in this guild/event at or after current registration. Screens, purchases, maintenance and failed actions cannot clear the buffer. Store no extra schema or mutable counter; restart reconstructs history and replay uses the frozen receipt without a new roll. A target-choice plan records the previous operation ID; if another action commits during the private wait, reject/refund the stale plan instead of changing its target/outcome. Existing registration-time same-timestamp ambiguity applies to legacy reset history.

## Verification and continuation

Changed runtime: services/spooky/actions.js, playful.js, config.js and config/spooky-2026.json. Regression files: spooky-actions, spooky-playful, spooky-simulation. The offline population adapter now handles effectType Op.in, keeps per-player committed outcome history and models this specific early rejection's cost/refill rollback. SQLite parity now checks candy after every step. Arbitrary partial handler failures still require SQLite and are never silently swallowed by the adapter.

47/47 focused tests pass: weighted conditional frequencies, single-roll behavior, candy reset, cross-command history, screen/restart/replay persistence, alternate reversal target, hidden spell exclusion, pending/conflict exclusion, no-target refund and 400-step memory/SQLite parity. Seven JS syntax checks, offline preflight/full registry review pass. Final full suite and live rollout evidence follow below. Logs: artifacts/spooky-repeat-{focused,full}.log and spooky-repeat-{preflight,registry}.json.

Exact next: human observe repeat-action variety, alternate reversal targets, zero-cost rejection if all manageable people already carry spells, and nickname restoration. Existing production Unknown Message/Unknown interaction traces remain separate follow-up work. No manual player correction/reset, migration, command registration, dependency, merge or slots implementation. Slots remains held until Monday October5; candy refill stays 1/18min until separately approved implementation.

Config17 rollout complete October3 00:32 Pacific: 357/357 full tests and 47/47 focused pass, seven syntax checks/offline preflight/full registry/scoped whitespace pass. Both bots online/ready after one reload each, production PID28132/restarts12, development PID30096/restarts25; PM2 saved. Error logs unchanged, no new startup errors. Sanitized evidence artifacts/spooky-production-launch/repeat-buffer-{before-processes,process-verification}.json and reload/save logs. No migration, registry deployment, manual player reset or correction.
