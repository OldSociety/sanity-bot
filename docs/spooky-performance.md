# Command performance pass — October 4, 2026

The live feature branch remains `feature/S-1-spooky`, unmerged. This pass preserves config19, gameplay probabilities, resources, scoring, ownership and storage. Slots/refill work is still held until Monday October5.

## Changes

Every Spooky command previously awaited full maintenance before and after execution. Those sweeps included all-player nickname cleanup, legacy reversal ledger lookups, guild-wide Discord projection retries, scheduled reminders, final-award checks and pending-message recovery. A slow unrelated REST request could therefore hold a new collection/help/game command in its thinking state.

Commands now perform a fresh, serialized database expiry/closure check. Exact expired effects still queue guarded restoration before gameplay, and event closure still archives/freezes its proof when due. The SQL compares timestamps with `julianday` and an ISO UTC parameter; raw Date replacements can use the host's Pacific offset and must not be compared as text. Idle checks create no maintenance operations. Startup/minute maintenance retains full cleanup, legacy normalization, reminders, winner awards and recovery. Full workers and Crown bootstrap coalesce within the runtime; failed initialization retries, and initialization never caches balances, effects or live Crown ownership.

Current-action Discord intents are reconciled by their committed revision after the saved result is displayed. The return waits at most one second for this projection, while late failures remain observed and durable pending rows remain retryable. The minute worker handles older unrelated intents. Actual Crown role transfers retain fresh paginated REST scans and exclusive remove-before-add checks. Nicknames retain original/null baselines, compare-and-set/manual-edit protection and durable restoration.

Spell target selection, reversals and bag-hole eligibility use fresh batches inside each transaction instead of repeated participant/state/effect queries for each member. The chooser does not retain a gameplay-state cache across its wait; commit revalidates eligibility. Existing shield/curse exclusivity, pending/expired baseline ownership, permissions and recipient order remain intact. Ordinary candy actions skip collection-completion inventory reads and cosmetic badge-access REST scans. Acquisitions, badge views and admin repair continue to reconcile access. Recipient mention registration reads fetch only affected user IDs and needed fields. Modern reversal cleanup uses its saved application timestamp and skips nickname-style refresh for pure reversals. Member/role/permission REST reads remain fresh and now begin concurrently. Leaderboard evidence is grouped by player and source operation once, while retaining all validation and score calculations.

The separate ticket listener previously checked staff permissions for **every** button, including Spooky target/confirmation buttons, and could race their replies with an unhandled Unknown interaction10062 rejection. It now accepts only claim/close/delete ticket IDs and catches errors from its own button work. This fixes that concrete cross-handler failure; unrelated modal/network failures are not claimed fixed. A full-suite check also found the profile renderer still pointing at absent `blackhole.avif`; it now references the supplied existing `default/blackhole.png`, without altering artwork or enabling production profiles. The simulation adapter implements the same fresh batch interface.

## Measurements

Synthetic in-memory SQLite, 100 members with 100 modern active reversals, same fixture before/after. Times are local measurements, not a promise about Discord network latency.

| Work | Before SQL / time | After SQL / time |
| --- | --- | --- |
| Protection candidates | 1,190 / 818ms | 6 / 14ms |
| Curse candidates | 992 / 712ms | 6 / 10ms |
| Break-curse candidates | 902 / 486ms | 6 / 9ms |
| Modern reversal cleanup | 307 / 229ms | 7 / 16ms |

A separate pattern comparison using the optimized cleanup measured the former two-sweep command pattern at 24 SQL statements/25ms/two new operations, versus the new idle guard at 3 statements/3ms/zero operations. This understates the old overhead because it excludes reminder/recovery wrappers and external REST requests. The improvement is a reduction in unnecessary work; no live player action or purchase was performed for a timing test.

Evidence: `artifacts/spooky-production-launch/benchmark-performance.js`, `performance-baseline.json`, `performance-after.json`. The benchmark opens only synthetic in-memory storage.

## Verification

**411/411 full isolated tests pass**, 56/56 effects/lifecycle/controller/scoring/combat focused checks, 36/36 final performance/controller/member-policy checks and 9/9 repair/parity/profile/ticket checks. New regressions cover constant-query eligibility, expired/opposite/pending targets, fresh revalidation, exact expiry in the host timezone, cross-guild isolation, failed cleanup retry, event closure, stalled recovery independence, one-time initialization/retry, revision-only delivery, publish-before-projection, no inventory/access work on ordinary turns, and ticket button isolation/error containment. The population parity test validates the adapter against a seeded actual SQLite trajectory. Full suite evidence: `performance-final-full.log`; earlier failing runs are retained as diagnostic history.

Offline preflight/full registry and scoped syntax/whitespace checks pass. No slash-command deployment, migration/index change, database replacement/reset/correction, manual role/nickname repair, odds change or merge. Existing profile/policy/flavor work is preserved. Profiles remain development-only.

The 20-second spell selection fallback and two-minute Fate confirmation remain intentional waits for player input. Discord member lookups, message sends and role rate limits can still add latency. Background recovery remains minute-based; role/nickname projections may briefly lag their saved outcome during REST delays.

## Live rollout

Fresh pre-reload evidence is `performance-prereload-processes.json`: production PID3836/restarts31, development PID28828/restarts30. Production restarted before this pass's edits and its sanitized recent diagnostics show the report-handler10062 path. Pre-reload error baselines are production2,838,531 bytes/2026-10-04T18:09:50.610Z and development35,834 bytes/2026-10-04T18:11:28.482Z, superseding older September/previous-rollout claims. Production read-only readiness confirms exactly one actual Crown holder matching the ledger, no pending Crown transfer and manageable Crown role.

Rollout verified October4, 11:36 Pacific: one reload each, development PID28132/restarts31 and production PID11728/restarts32, both online with fresh login evidence. Both error logs retain the fresh pre-reload sizes/timestamps above; no new startup errors. PM2 saved. Post-start read-only checks show production exactly one actual Crown holder matching the ledger, development zero matching its initialized empty holder, and neither environment has a pending Crown transfer. Production has one surviving reversal row, unchanged by this rollout's read-only checks; ordinary guarded startup maintenance remains active.

Evidence: `performance-process-verification.json`, `performance-{development,production}-readiness.json`, `performance-production-before-readiness.json`, and `performance-{reload-development,reload-production,save}.log`. Keep one writer per environment, preserve existing databases, and continue observing fresh commands on this unmerged branch. Human end-to-end latency/button acceptance remains the next observation; the measured millisecond figures above are isolated database timings.
