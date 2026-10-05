# Sweet Tooth first-win Fate reward — October 5, 2026

The Crown's successful first-win path incorrectly treated winning the Crown as sufficient Fate eligibility, bypassing the existing Unwanted-role check. Crown discovery and theft now require the actor's trusted current Unwanted role snapshot before giving the first-win Bank reward. Crown ownership, first-win candy, capture prestige and the holder's scoring multiplier remain unchanged.

Successful Crown rewards require the current handler's explicit `crownFirstWin: true`. Progression independently checks scoped durable `crown_award` history, excluding the marker written by the current transaction. Older winning operations do not need the newer receipt flag: their ledger markers remain sufficient to prevent another reward. Only the existing explicit development testing reset reopens test history; no production reset is available or performed. A player who lacked Unwanted at their first win cannot gain this first-win reward by acquiring the role and recapturing later.

Repeat captures and ineligible first wins produce no Bank/Fate snapshots, so the existing renderer displays neither wallet totals nor a Banked Fate bonus. Eligible first-win receipts still freeze the Bank-before/after, Fate and Total fields, preserve the existing Bank capacity, and replay without another credit. Existing saved messages and historical credits were not rewritten. The unsuccessful Crown consolation remains available to eligible players without a prior Crown win; prior winners cannot farm that consolation either.

Read-only production checks resolved the exact stored accounts cosmic_force, akikisano and trinitycat172. All three already have scoped 2026 `crown_award` records and no testing resets; no backfill or balance correction was needed.

## Verification and live rollout

- 506/506 full isolated tests passed; 43/43 focused tests passed.
- The same 43 regressions passed against the independent production modules and dependencies with the reviewed progression candidate injected in memory. These include actual discovery → theft → recapture, Unwanted joining after first win, legacy records, renderer output, Bank caps and replay.
- Fresh stopped-writer backups of both authoritative databases passed integrity/foreign-key checks and byte/content comparisons. Every table and database byte was unchanged during the source-only cutover.
- Only `services/spooky/progression.js` was deployed into `.runtime/production`. No registry, schema, configuration, personal XP/reset/grace or undeployed Community/Profile/Sanity changes were included.
- Both named bots were restarted once, reached fresh Ready and had zero new error bytes. Production PID21036; development PID23944. PM2 state saved.

Evidence and recoverable original/candidate source are in ignored `.runtime/crown-reward-fix`. Unrelated `docs/checkin-design.md` remains preserved and untracked. No real reward test, manual storage update, merge, push or worktree operation was performed.
