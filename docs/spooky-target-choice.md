# Curse/shield choices and nickname costumes — October 2, 2026

Config **12**, manifest **2**, on unmerged `feature/S-1-spooky`. This supersedes the older repeatable curse/always-shared protection and private leaderboard behavior. The quiet embed-only mention policy from config 11 still applies. No command definitions, schema, dependencies, wallets, quarter odds or winner formulas change.

## Approved behavior

- Curse-target, curse-spread and protection outcomes privately offer up to **three distinct eligible other people**, sampled randomly. The giver has **20 seconds** to choose; timeout uses a frozen random choice from those displayed people. Small/no eligible populations offer fewer/no buttons. Backfire keeps its original self-targeting behavior; an already cursed giver receives a paid fizzle, never a second curse or reset goodwill goal.
- Protection remains the **10% treat outcome**. Its separate split is **80% recipient only / 20% recipient plus giver**. A previously shielded giver is never renewed; that spell shields only the recipient. Already cursed/protected recipients are excluded from the corresponding spell. Outstanding restoration metadata is also preserved.
- Curses use the original name's first grapheme, spooky symbols and **🦇**. Shields use **✨( Name )✨**. Shared nickname projection composes curse, shield and reversal, restoring remaining effects or the original nickname as each effect clears. Names respect Discord's 32-code-unit limit without splitting surrogate pairs.
- `/spooky leaderboard` replies publicly in the permitted game/testing channels. Rankings and badges remain visible; underlying scores and formula stay hidden. Off-channel rejection, help, collection, choice screens and ordinary private failures remain private.

## Transaction and Discord safety

The action performs a serialized read to validate registration/candy/event/pause and roll its outcome, then releases the DB transaction before waiting on Discord. The live controller's interaction lock prevents overlapping handling of the same interaction. No candy or economy operation is committed while the choice is open. Clicks enforce actor, guild and channel, claim synchronously, acknowledge before commit and remove buttons. Expired/restarted-session buttons cannot mutate state.

The root economy transaction rechecks state, candy and curse status, charges exactly one candy and applies the frozen outcome/selected recipient. A target that becomes ineligible during the choice aborts/refunds the whole root operation rather than redirecting the player's selection. Replay uses the original saved receipt and skips choice/randomness. Crash/restart before commit abandons an uncharged offer; it does not promise a durable automatic timeout across a stopped process. Existing committed outbox/replay recovery remains unchanged.

Nickname metadata stores the original null/string nickname plus current applied projection, display-name base and deterministic cosmetic seed. Cosmetics never roll gameplay RNG. Every projection/removal/admin clear/reset intent shares the root transaction. Delivery uses fresh membership, revision guards and expected-name comparison; pending unapplied restoration can also match its original expected base. Manual nickname edits become conflicts rather than being overwritten. All Discord calls occur after commit. Nickname edits still depend on Discord Manage Nicknames and hierarchy: owners/higher roles can receive role-based curses and shields without a nickname edit. Existing active effects are not rewritten/backfilled; newly applied effects acquire nickname metadata.

## Files and checks

New services/spooky/target-choice.js, effect-nicknames.js and tests/spooky-target-choice.test.js. Updated actions.js, playful.js, controller.js, runtime.js, delivery.js, admin-controls.js, presentation.js, flavor.js, wording-preview.js, config.js, config/spooky-2026.json and Events/InteractionCreate.js. Simulation model adapter gains Effect.findOne; its historical published balance reports are not refreshed forecasts. Updated action/controller/playful/provenance tests and current README/AGENTS/rules/handoff/checklist notes. Preserve the preexisting handlers/messageHandler.js changes.

Focused **41/41** interaction/action/effect tests, **40/40** admin/provenance/simulation recovery checks and **335/335 full tests** pass. Final nineteen syntax checks, scoped whitespace, refreshed offline preflight/full registry/positive probes pass. Both existing live registries match unchanged definitions: fourteen development including /game and thirteen production. No command registration was needed. Nothing has been migrated, reset, manually corrected or merged.

Config 12 was applied with one authorized reload per bot and PM2 saved on October 2 at **8:41 PM Pacific**. Production online PID 18700/restarts 6; development online PID 26460/restarts 19. Before this rollout, the sanitized baseline already showed production restarts 5 (an intervening restart outside this task) and development 18. Both error logs retain their September byte counts/timestamps, with no new startup errors. Current process evidence is artifacts/spooky-production-launch/target-choice-process-verification.json; prior baseline is target-choice-before-processes.json. Remaining evidence: target-choice-{full,focused,recovery}.log, target-choice-probes.json, target-choice-*-reload.log and target-choice-pm2-save.log, plus refreshed docs/spooky-preflight-results.json and command-registry-audit-results.json. Exact next is the human acceptance matrix below on this unmerged live branch; no real participant action was performed by the agent.

## Exact human continuation

1. Verify a curse-target/shield outcome offers three private buttons (or fewer eligible people), selection affects the named person, and ignoring it picks one of those displayed people after 20 seconds.
2. Check another account cannot choose; repeat self-backfire cannot renew curse, and a shielded giver does not gain extra protection time.
3. On manageable members, verify cursed/sparkling nicknames, breaking a curse while shielded, shield expiry, and restored original name. Use owner-only queue inspection for permissions/pending/conflict recovery rather than overwriting a manual nickname.
4. Verify leaderboard is visible to everyone, collection remains private and recipient references remain embed-only with no notification ping.

Keep production/dev storage separate, one writer per DB, accepted five badge placeholders, manual uncertain-send recovery and this branch unmerged. No new automatic monitoring is scheduled.
