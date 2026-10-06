# Eye theft protection and Eye Candy — October 5, 2026

Config22 is live in development and the independent production runtime. The user chose a twelve-hour victim protection window and a twenty-percent Eye Candy Treat, retaining personal Eye finds.

## Eye theft

Player-to-player Eye transfers must leave the source with at least one Eye. The transaction's shared transfer helper enforces this rule as well as the outcome handler. Owner spending and automatic collection conversion still work normally.

Each successful theft already records a scoped negative Eye entry with the victim's user ID, the thief's related user ID, timestamp and `eye_theft` reason. The outcome reads only recent losses for its current candidate pool. For twelve hours after a loss, all tricksters must leave that victim's remaining Eyes alone. Existing pre-upgrade thefts count; no new table, backfill or balance correction was needed. Replayed turns and unsuccessful attempts do not renew protection. Exact expiry makes the player eligible again, provided they still have more than one Eye. Development registration resets retain their existing behavior; older losses before the current registration do not block a fresh test registration.

Selection favors another available Eye holder. If all current Eye holders have either their last Eye or recent-theft protection, the result becomes **👁 Nothing Gets Past It!** and awards the actor up to eight bonus Candy. It does not take Candy from the protected player or manufacture another Eye. If nobody else has any Eyes, the existing personal-find fallback remains. Existing magical shields still intercept eligible theft attempts before any Eye transfer, using their normal charges.

## Eye Candy

The new ordinary Treat generates one Eye for another registered human in the existing membership/participant pool. The giver is excluded, duplicate identities are removed, and unregistered/bot/Bots-role members are excluded by the existing runtime membership policy. Zero-Eye recipients are prioritized uniformly; otherwise selection is uniform among the remaining recipients. No new activity cutoff was introduced.

The giver earns up to six bonus Candy. Both Candy awards respect the existing eighty-Candy capacity and display the actual award. Every action still costs one Candy. If there is no other registered human, the giver receives the Candy only, with explicit solo wording; no personal Eye is substituted.

The gifted Eye uses the normal collection transaction. A fifth Eye can unlock a piece or badge for its recipient, with that recipient's name, frozen balances and badge access projection. A character completion has one completion announcement. Failures roll back the entire cost, bonus and Eye credit together; replay preserves the original recipient and result.

Ordinary Treat weights now total100: dropped Candy20, Crown1, double gift15, shield10, break curse5, standard gift16, Eye Candy20, personal Eye13. The Trick Eye attempt remains13%; all other Trick weights and Crown odds remain unchanged. Spell buffers retain these Eye percentages; the existing cursed-action replacement still applies. Public results use the existing quiet embed mentions and10% shared GIF budget. The admin wording gallery includes the new gift, watched-Eye and solo variants.

## Verification and rollout

- Full isolated suite523/523 passed; focused suite120/120 passed; final theft/history checks17/17 passed after adding the last legacy-history case.
- Actual independent production modules with scoped candidates injected in memory passed71/71 checks, including recipient completion/rendering/access, legacy protection, cap, concurrent theft, replay and rollback. The existing SQLite/population parity regression passed with its simulation adapter updated for Eye history.
- Offline command definition review found zero additions, removals or changes. The legacy development checker expects `SWEETTOOTHROLEID`; the current runtime also accepts `SWEETTOOTHID`. Both actual runtime targets passed an alias-aware read-only configuration/storage check without editing environment files.
- Fresh stopped-writer backups passed SQLite integrity/foreign-key checks and exact byte/table-content comparisons. No manual balance/history edits, migration or command registry deployment occurred.
- Production received nine scoped source/config candidates. Its existing Fate/Bank purchase policy and presentation were retained, along with live Sanity, personal XP channels/reset/grace and disabled Community settings. Production's older module differences were patched locally rather than replaced with the development feature tree.
- Both named bots restarted once and reached fresh Ready with zero new error bytes. ProductionPID6908; developmentPID12632; PM2 saved. Source hashes and unrelated configuration hashes verified after startup.

Ignored evidence, candidate/original production sources and recoverable database backups are in `.runtime/eye-economy-fix`. Slots, refill changes, Mirror and Copycat remain deferred. No real gameplay test, main merge, push or worktree operation was performed.
