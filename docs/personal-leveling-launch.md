# Personal-only leveling reset readiness

October 5, 2026: Community XP is paused at the human's request. Both Community activation flags remain false, and neither live database has Community tables. Production has no Community runtime. Do not deploy its migration or activate either flag as part of this launch. The personal system continues independently with its current curve, XP eligibility and +5 Fate reward for the Unwanted campaign role. No new slash commands are needed.

## Reviewed reset scope

Set every saved account in the selected bot's database to `chat_level = 1`, `chat_exp = 0`, and `last_chat_message = NULL`. Clearing the chat cooldown allows the next qualifying message to count immediately. This includes historical stored accounts as well as current members; accounts created later follow the existing first-message seed. It does not reset normal Fate, Bank, birthdays, achievements, badges, Sanity, seasonal pieces/currencies/scores, retired supporter totals, or any other user fields. No reset occurs merely by restarting the bot.

`services/personal-xp-reset.js` commits these three fields and a unique launch receipt in one transaction using the existing wallet connection queue. A repeated invocation with the same guild/launch identity returns the saved receipt without erasing activity earned after the first reset. The receipt stores the old progression values, and its insertion must succeed or the entire reset rolls back. This helper has no Discord command or automatic startup caller.

Current personal earnings remain 10–13 XP per qualifying message with a one-minute cooldown; a level at current level L requires `5L² + 50L + 100` XP. Level1 requires155 XP, approximately12–16 credited messages depending on rolls. Eligible personal level-ups grant +5 Fate, with normal Fate capped100. This reset restarts the curve; it does not flatten later requirements or promise a fixed reward interval. Production Bots-role members will be excluded from personal XP; development test-role members remain eligible. Actual Discord bots, slash/webhook/interaction output and Spooky chat remain excluded.

The previously approved launch protection still applies to personal rewards: for two Pacific calendar months starting at the actual reset launch, newly earned Fate above100 goes into Bank up to its100 cap. Existing balances are never transferred. Pin startsAt/endsAt from `launchWindow(actualLaunchInstant)`, rather than restarting the period on a reload. Both live grace windows are still disabled/null during preparation. The staged production handler adds the Bank notice and reports actual credited Fate; it retains production's text level embeds and does not activate development-only profiles/Sanity.

## Preparation evidence

Consistent SQLite online backups were taken through read-only source connections. Reset rehearsals operated exclusively on disposable copies under ignored `.runtime/personal-leveling-launch`:80 saved production accounts and79 development accounts reset correctly to level1/XP0. Exact raw row comparisons confirmed only the three intended User fields changed; all other tables stayed identical except the one new launch receipt in the existing WalletOperations table. Integrity/FK checks passed and repeated reset replay was harmless. The live source databases, config, command registries and bot processes were not reset/reloaded during these rehearsals.

The staged production handler is syntax checked and compatibility tested against production's actual User/wallet/member-policy modules in disposable memory. It excludes Bots-role personal XP, awards the personal +5, banks the capped reward during the test grace window, explains the overflow, and avoids repeat reward on the cooldown. It imports no undeployed Community, Profile or Sanity modules. Its live-source baseline and candidate hashes are saved in `production-candidate.json`; recheck them at deployment. Focused tests cover reset preservation/replay/rollback, personal-only first reward, caps/grace and Bots-role development exceptions. The unused better-sqlite3 binding has a Node ABI mismatch; the rehearsal uses the bot's working sqlite3 driver without reinstalling live dependencies.

Validation:499/499 full isolated tests and13/13 final focused checks pass. Both live bots remain online with their existing PIDs and zero fresh error-log bytes. No live reset, grace activation, source deployment, command write or reload accompanied preparation.

## Actual launch, after explicit reset authorization

1. Verify selected production/development scopes, current PM2 paths, candidate source hashes and disabled Community flags. This is a personal-only rollout.
2. Stop the named writer before modifying its source/config or database. Take a fresh exclusive stopped-writer database backup, verify integrity/FKs/hash, and save the prior source/grace config. Rehearsal snapshots are evidence, not a substitute for this fresh launch backup.
3. Deploy only the reviewed personal handler patch and reset helper as needed. Set the approved personal overflow window for that environment to the actual launch instant plus two Pacific calendar months. Keep Community disabled and production Profile/Sanity unchanged.
4. Run the transactional reset with a pinned guild/launch identity once. Verify every affected account is level1/XP0 with cleared cooldown, exact preservation of all other data, and one committed launch receipt. Do not use ORM sync/alter or copy a rehearsal database over live storage.
5. Restart the named bot once, verify Ready and fresh error-log bytes, confirm disabled Community and pinned grace dates, then save PM2. No registry deployment is needed. Any public reset announcement needs its own human instruction.

No live reset has been authorized/executed in this readiness check. Explicit go-ahead is required because the operation removes existing earned XP and levels. Rollback after new activity requires a scoped plan rather than restoring a whole database and losing subsequent wallet/gameplay changes.
