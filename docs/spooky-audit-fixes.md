# Spooky audit corrections — 2026-10-01

Branch `feature/S-1-spooky`; offline only. Approved v4 economy, assets, migrations and disabled operational flags are unchanged. Existing dirty holiday/haiku/package work is preserved.

## Group 1 — member directory and acknowledgement

A01/A04 implemented. `services/guild-members.js` shares one completeness-checked directory per client, combines bootstrap requests, updates add/update/remove events, invalidates disconnected state, enforces a 31-second request allowance and handles RATE_LIMITED retry_after seconds/15-second deadlines. Booster/Winter full-roster consumers share it. Spooky refreshes its actor and bot/roles; personal fate draws need only the actor. `/user` publicly defers before database/badge I/O.

Changed: member directory, Spooky runtime/controller, User command, booster handler and Winter command. Positive evidence: six new adapter/profile tests plus nine existing integration tests **15/15 passed**. No real requests occurred. Final selected-target checks are handled by the next delivery group. The old full-roster booster call is scheduled daily, not a startup callback; the original audit's startup wording was inaccurate.

## Group 2 — saved result and cancellation

A02/A03 implemented. Post-commit reply/public delivery are independent, cosmetic access follows publication and settles for at most one second, ordinary definitely-pending outbox recovery is bounded/scoped, and role/nickname writes recheck the current intent after asynchronous member/permission reads. Sending/uncertain rows and special notification policies remain explicit; already-started API requests cannot be recalled. Focused corrections plus controller/playful/resolution/admin badge tests **37/37 passed**; expanded verification below rechecked the bounded projection implementation.

Changed: controller, post-commit helper, pending notification worker, delivery service, shared Discord adapter, player/admin runtimes, admin command and generic interaction error text. Recovery handles committed player action/fate and original admin repair/recompute rows; cursed replacements, reminders, final awards and manual resolution copies retain their dedicated recovery policies.

Final review added a rotating advisory batch cursor: unresolved older channels remain pending for inspection but cannot repeatedly fill the batch and starve newer awards. The cursor resets on restart; durable status/claims still determine exactly which messages may send. The ten-test corrections file passes with a one-row batch, blocked oldest channel and a later saved quarter.

## Groups 3–4 — original effects, accurate badges and chat progression

A05/A07/A08/A09 implemented. Curse effects preserve their original role ID; legacy boolean-only ownership requires saved delivery evidence and fails closed if missing. Admin/gameplay cleanup share that policy. Repair receipts report retained/current permanent badge IDs. Reacquisition reveals distinguish existing badges; partial Sweet Tooth results still display candy/fate rewards.

Chat progression shares the economy connection queue and atomically compares saved XP/level/timestamp before advancing and crediting fate. The direct level reward helper also claims the previous level. Existing 10–13 XP, one-minute cooldown and booster overflow remain unchanged. Haiku, XP/level-up and seasonal message paths have independent error handling; numeric DMs are rejected by absent guild/member. Permanent badge reads outside a mutation share the queue; transactional reads use their supplied root transaction.

Changed: curse-role helper, playful/admin-controls, admin-repairs, collection/presentation, fate-wallet, messageHandler, badges, economy queue export and synthetic admin/lifecycle fixtures. Positive corrections and existing playful/lifecycle/admin/admin-badge/integration coverage **66/66 passed**. Fixtures include simultaneous level messages plus a queued economy reward, configuration drift/lost role evidence, permanent badge reacquisition and message failure isolation.

## Group 5 — deployment validation

A06 implemented; focused deployment/registry tests **7/7 passed**. Runtime, audit and deploy share `services/command-registry.js` validation. Only three reviewed empty legacy files may be inactive; malformed exports, nonfunction handlers, duplicate names and invalid option structures fail before registration. Deployment builds inert definitions without importing real global models. Trusted SDKs preload outside the definition VM deadline, avoiding partial module-cache initialization on a cold start.

Deployment defaults to a read-only **live plan**, not PUT. `--check-target` alone stays offline. Unknown/mixed flags reject before environment loading. Plan SHA-256 binds selected environment/application/guild, desired definitions and the complete live list including IDs/versions; it lists removals. `--apply HASH` rechecks that plan and saves the original registry under ignored `artifacts/command-registry/` before PUT. Returned definitions must match. Hashes do not lease Discord's registry: coordinate one deployer, inspect any ambiguous failure, and never blindly repeat PUT. No deployment plan/network call was run here.

Changed: shared registry validator, app loader, deployment entry point, offline registry audit, `.gitignore`, new deployment regressions and registration runbook. No command definitions were added/removed; 13 active and three intentionally inactive remain.

## Final offline verification

- `npm test`: **244/244 passed**, zero failures, approximately 55 seconds, including the final recovery-fairness edit. The first full run found one obsolete artwork-deferral assertion; it now correctly expects unavailable historical ownership rather than claiming artwork is missing. The final rerun is the current full acceptance result.
- `node scripts/spooky-branch-audit-probes.js`: **20/20 positive regressions**. [Saved fix evidence](spooky-audit-fix-results.json) includes source/config hashes and all nine finding statuses. The original nine defect observations remain historical in [pre-fix evidence](spooky-branch-audit-results.json); the script no longer asserts broken behavior.
- Projection SQL acknowledgements/claims and standalone badge/wallet reads also share the root connection queue. An additional regression proves a notification acknowledgement waits outside an unrelated rollback and that a newer removal reconciles after an already in-flight add; corrections/resolution/reminder/winner coverage **44/44 passed**.
- Static preflight and full offline registry review refreshed: eight player/thirteen admin subcommands, 28 pieces/105 images/seven full circles, 13 active registry entries with no missing active HEAD definitions. **33 JS syntax checks pass**. `npm run check:dev` and `npm run deploy:check:dev` pass: authoritative development application 1291847176569360476/guild 684459745167671453, distinct production guild, configured dev.sqlite; no DB opened or Discord contacted. No token value was printed.
- Source/config hashes match the final checkout; approved v4 and all four disabled flags verified. **96 local links across 11 current documents pass**. Scoped Git whitespace review still reports the preexisting holiday CRLF block in app.js; it was preserved, not normalized. Feature branch reverified; no commit/stash/reset or unrelated work removal.

## Remaining work and next task

All A01–A09 have offline fixes. Actual Discord burst timing, expiring webhooks, member intents, hierarchy, registration, visuals/access and restart recovery still need the development acceptance matrix with explicit live-session authorization. Keep one writer; sending/uncertain notifications require evidence and manual resolution. Cancellation after an API call starts cannot recall it; newer intents reconcile on the next pass, while a cancelled in-flight action requires inspection/clear-effect restoration as appropriate.

Current approved v4 is suitable for bounded correctness tests; public-launch balance targets remain unmet. Prestige standings and detailed collection screens are still missing product work, separate from these nine fixes. Quiescent lifecycle operation growth, per-view cosmetic projection coordination and legacy birthday/booster schedule idempotency remain follow-ups. Six badge artworks and optional reminder/winner/access settings are pending. No new schema/dependencies/odds/flags/assets or real storage/Discord changes.
