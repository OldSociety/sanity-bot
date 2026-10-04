# Spooky audit

**Historical baseline audit.** The availability description and bug list below describe the archived legacy implementation, now preserved in `docs/legacy/spooky-command.js`. The new disabled runtime replaces it in source. Read the [current handoff](spooky-handoff.md) for implementation status and unresolved bugs, and the [rules specification](spooky-rules.md) for intended behavior. Do not treat this historical bug list as the current runtime bug register; use the handoff for remaining limitations.

Audited on 2026-10-01 on `feature/S-1-spooky`, created from the existing main checkout. Existing uncommitted holiday changes were preserved. No game code was changed, no bot was started, and no commands were deployed.

## Current availability

The original `commands/Halloween/TrickorTreat.js` and `handlers/dailyTreats.js` are deleted in the working tree. The preserved replacement, `commands/Holiday/TrickorTreat.js`, is entirely commented out and exports an empty object. Both command loaders require `data` and `execute`, so spooky is currently skipped. The application schedules holiday rewards instead. The Halloween scheduler in the committed app was already commented out.

The findings below describe what the preserved spooky implementation would do if re-enabled. The message curse handler remains active today.

## Exact game behavior

- All four subcommands require the spooky or bot-test channel, plus a cached text channel configured by `HELLBOUNDCHANNELID`. Even registration and status fail if that target channel is missing.
- Register creates a User if needed and a SpookyStat with three candies and null activity. Existing participants get an already-registered response. The October 1–31 announcement is informational; dates are not enforced.
- Status reports candies and rank sorted by candy balance. Admins are excluded through the guild member cache. Admin callers also fetch and log member presence. Ties have no explicit tie rule; an excluded admin receives rank zero.
- Targets are members cached for the configured target channel who are not the caller, bots, or admins and whose presence is not explicitly `offline`. Missing presence passes this check. Registration is not required: target stats are automatically created with three starting candies.
- Normal treat requires at least one candy, records activity, and immediately spends one candy. Its outcome table is below. Roles and nicknames persist without automatic cleanup.
- Normal trick requires at least one candy but does not spend one up front. It queries/creates stats for every eligible target, then selects an outcome. It does not update caller activity.
- A cursed caller has a 10% chance that a trick/treat is replaced by a curse effect. For treats, 20% of those curse effects spread the curse to a random eligible member and cost nothing; the other 80% distribute up to three candies, one per recipient. For tricks, the curse effect distributes up to two candies, one per recipient. These paths bypass normal activity updates and immunity filtering. The unconditional probabilities for a cursed treat are 2% spread, 8% distribution, and 90% normal treat; a cursed trick is 10% distribution and 90% normal trick.
- Separately, the active message handler has a 20% chance to transform a cursed member's message, split equally between reversing text and shuffling words. It deletes the original and sends an embed. On failure it attempts to send the original text as the bot and delete that fallback after three seconds.

### Normal treat probabilities

These probabilities apply before recipient/permission/database failures and outside the curse override.

| Outcome | Actual chance | Candy effect |
| --- | ---: | --- |
| Lost | 25% | Caller -1 |
| Sweet Tooth | 0% | Unreachable; intended branch grants the caller the role, or shares it and grants caller +5 after the initial cost |
| Multi-gift | 15% | Caller -1; recipient +2 |
| Temporary immunity | 10% | Caller -1; timestamp set; recipient gets nothing; immunity flag remains unset |
| Break curse | 5% | Caller already paid 1; if at least 2 remain and a cursed member exists, remove role and spend 2 more. If fewer than 2 remain, curse caller. If enough remain but no cursed member exists, recipient +1 |
| Standard gift | 45% | Caller -1; recipient +1 |

### Normal trick probabilities

| Outcome | Actual chance | Candy effect |
| --- | ---: | --- |
| Steal | 30% | Target -1, caller +1; no action cost. No funded target means no cost |
| Great Heist | 10% | Take one each from up to three targets; caller gains total; no action cost |
| Reverse nickname | 10% | Caller -1 after nickname change succeeds |
| Curse target | 5% | Caller -1 after role addition succeeds |
| Curse backfires | 5% | Caller cursed and -1 after role addition succeeds |
| Caught | 40% | Caller -1 |

README probabilities disagree: steal 40%, target curse 10%, caught 25%, Sweet Tooth 5%, and multi-gift 10%. Its standard-treat description omits the actual candy transfer. With funded targets, normal tricks have expected caller change of -0.2 to 0 candies per action, depending on heist yield; an extra universal action cost would change this economy substantially.

## Findings, in priority order

1. **High: Sweet Tooth is unreachable.** `TrickorTreat.js:363` returns for every roll below 0.25, before the Sweet Tooth check below 0.15 at line 396. All Sweet Tooth rolls are lost treats. Multi-gift occupies 0.25–0.40, giving it 15% rather than the documented 10%.
2. **High: immunity is ineffective for newly created participants.** The immunity branch at line 453 sets only `lastSpookyUse`; targeting at line 683 requires both that timestamp and `hasBeenTricked`. The flag assignments in both treat and trick are commented out. A preexisting true flag may behave differently, making old data significant. The immunity message also claims a gift without incrementing recipient candies.
3. **High: concurrent actions can corrupt balances.** Transfers use independent read/modify/save operations, without transactions, atomic balance updates, or per-user locks. Concurrent steals from the same one-candy target can both credit callers while only one effective debit persists. Concurrent sender actions can overwrite each other's balances. Errors midway through heists or gifts can leave partial transfers. There is no effective cooldown: `events/interactionCreate.js` overwrites its earlier `module.exports.run` with a new export, and its active dispatcher directly executes commands.
4. **High: implicit registration changes the economy and can fail.** Treat creates the selected target's stats; trick creates stats for every eligible member before knowing the outcome (`TrickorTreat.js:673`). Each gains the default three candies. These creates do not first ensure the parent User exists, despite the declared foreign key. Missing parents can fail under enforced constraints. A target can be enrolled without consent, and a single trick can mint starting balances for many people. `SpookyStat.userId` has no declared unique constraint, so concurrent registration can create duplicate stats, causing ambiguous reads and duplicated ranks. Existing database constraints were not inspected.
5. **Medium: candy can disappear without delivery.** Normal treat debits before checking recipients (lines 356–380). Cursed distributions debit `min(3, balance)` or `min(2, balance)` before limiting recipients. With three candies and one recipient, cursed treat debits three and delivers one. The curse-spread branch selects a recipient before checking an empty member array, producing a caught error when no one is eligible.
6. **Medium: heists repeatedly favor cache order.** Line 779 uses `filteredTargets.slice(0, targetCount)`, without shuffling. The same first three targets are hit repeatedly. It can report no funded heist targets even if later eligible members have candies.
7. **Medium: reply handling is fragile.** No deferred reply precedes member fetches, many database queries, or Discord edits. Slow execution risks interaction expiry after state has changed. Most unhandled exceptions reach a dispatcher that only logs, leaving the caller without an error response. Some role/nickname blocks catch reply or save failures as though the Discord mutation itself failed, despite it already succeeding.
8. **Medium: ranking and eligibility rely on incomplete cache data.** Missing presence is treated as online. Non-admin status does not fetch all members, so uncached admins can remain ranked. Departed members and other guilds are not filtered from the global stats query. The model has no guild or event identifier, so reuse across servers or seasons shares balances. Admin exclusion yields rank #0 for an admin caller. Tied balances need a deliberate ranking policy.
9. **Medium: active curse handling can damage messages.** `handlers/messageHandler.js:194–247` deletes originals before confirming replacement delivery, losing attachments/replies and risking permanent loss if both sends fail. Embed field values can exceed their limit for long messages, and attachment-only messages can have empty text. Raw fallback sends can recreate mentions as the bot. Reversal of UTF-16 code units can break emoji in messages and nicknames. There is no event-date gate or automatic role cleanup, so curses continue even with spooky disabled.
10. **Medium: historical daily rewards are unsafe to restore.** The deleted handler, inspected from HEAD, checks balances below 50 but applies `min(balance + bonus, 10)`: active balances from 11 through 49 are reduced to 10. Sweet Tooth's 12-candy bonus is erased by that cap. The supposed inactivity penalty actually adds three. Null activity matches neither active nor inactive query, excluding new registrants. Only normal treat updates activity; tricks and cursed actions do not. No last-award timestamp makes rewards repeat on every invocation. The historical commented scheduler ran every three hours, despite messages describing daily/midnight rewards. This handler is currently deleted and unscheduled.
11. **Medium: Discord mutations need eligibility and lifecycle rules.** Nicknames and roles can fail because of permissions or role hierarchy; targets are not checked for manageability. Nickname reversal has no original-name storage or scheduled restoration. Already cursed targets can be selected again and charge the caller without adding a new effect. Curse-breaking scans all cursed channel members, including the caller, admins, bots, and offline members, unlike ordinary target selection. Decide whether these differences are intended.
12. **Low: event boundaries and advertised costs need an explicit decision.** There is no October gate, reset, end-of-event winner selection, or prize payout. Status and registration are blocked by target-channel configuration even though they need no target. Successful steals and heists are free despite the trick description saying to use a treat; failed Discord edits can also cost nothing. These are design discrepancies rather than automatically incorrect mechanics.

## Verification and limits

Source review covered command loading/deployment, command dispatch, models/associations, the README, the active message curse handler, and the historical deleted candy handler and scheduler. No SpookyStat migration was found among the current migration files.

An isolated Node VM evaluated the preserved source after removing its outer comment prefix, with mocked Discord/model operations. Assertions confirmed: Sweet Tooth rolls becoming lost candy; immunity leaving its flag false and giving no recipient candy; a debit with no recipient; a free heist taking from the first three targets; and a cursed gift debiting three while delivering one. The current commented module was also confirmed to export no command. An initial heist check omitted the random target-selection draw; the corrected sequence passed. No tests contacted Discord or opened the database.

Live Discord permissions, deployed commands, database schema/data, and real concurrency remain unverified. The npm test script points to a missing `__tests__` directory in this checkout. Production startup/deployment scripts were not run.

## Suggested order for the redesign

First decide registration/target eligibility, exact probability tables, whether tricks have a universal cost, candy creation/caps, immunity duration, and event/reset rules. Then implement atomic candy operations and unique participant identity, correct outcome selection, defer responses, and make curse/nickname changes recoverable. Re-enable command registration and rewards only after those mechanics have focused regression coverage.

## Branch naming

Git assigns no special meaning to `feature/S-1-*`; it is a human naming convention, not built-in versioning. The existing `feature/S-1-fate-shop` reflog records creation from HEAD, but no explanation of `S-1` was found in reviewed documentation/history. It could be an issue/story identifier, sprint marker, or personal label; its original meaning cannot be established from this evidence. Keep it if useful, or use a clearer future convention such as `feature/spooky` or `feature/123-spooky` tied to a known issue.
