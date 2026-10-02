# Spooky feature branch audit — 2026-10-01

**Current status: A01–A09 fixed offline, with 244/244 tests and 20 positive audit regressions passing.** See [corrections, changed files and remaining limits](spooky-audit-fixes.md) and [source-hashed fix evidence](spooky-audit-fix-results.json). The findings below describe the pre-fix snapshot and historical reasoning, not current application behavior. Development acceptance still requires explicit live-session authorization. Gameplay, reminders, winner delivery and badge access remain disabled; no real storage/Discord changes occurred.

Reviewed checkout: `C:\Users\headm\code\sanity-bot-dev`, branch **`feature/S-1-spooky`**, local HEAD **`f98cc7952529c55f9415aa9e0afd939e63e15554`**. The feature is largely untracked/uncommitted, so this review includes working-tree source rather than just the tracked Git diff. Existing holiday/haiku/package work is preserved and distinguished from Spooky additions. Findings refer to this source snapshot; line numbers will move when fixes land.

## Findings and evidence

P1/P2 priorities describe the original nine confirmed findings. [Pre-fix observations](spooky-branch-audit-results.json) remain archived. [The verification script](../scripts/spooky-branch-audit-probes.js) now runs 20 positive regressions from the normal test suite using synthetic SQLite and Discord/REST; it no longer approves defect behavior. All nine finding statuses are **fixed offline / live acceptance pending**. The additional product/refactor gaps below remain open unless explicitly addressed in the correction record.

| ID | Priority | Finding | Source reference |
| --- | --- | --- | --- |
| A01 | P1 | Each action requests all guild members and can hit Discord's 30-second limit | `services/spooky/runtime.js:7`, `controller.js:60` |
| A02 | P1 | A failed private reply prevents delivery of already-committed public rewards | `services/spooky/controller.js:91–95` |
| A03 | P1 | Cancelled/superseded role or nickname intent can still execute | `services/spooky/delivery.js:18–44` |
| A04 | P2 | `/user` waits for badge network work before its first acknowledgement | `commands/Server/User.js:34–36`, `services/badges.js:43–49` |
| A05 | P2 | Curse cleanup uses the current configured role instead of the originally granted role | `services/spooky/playful.js:35–46` |
| A06 | P2 | Real deployment can replace the registry despite malformed exports or misspelled inspection arguments | `deploy-commands.js:7,34–38,52` |
| A07 | P2 | Unrelated XP/level-up failures skip cursed-message processing | `handlers/messageHandler.js:112,162,176` |
| A08 | P2 | Concurrent messages can credit fate twice for one level-up | `handlers/messageHandler.js:53–112`, `services/fate-wallet.js:14–23` |
| A09 | P2 | Admin repair receipts falsely say permanent badges are unimplemented | `services/spooky/admin-repairs.js:93`, `presentation.js:49` |

### A01 — full guild fetch on every action

Every trick, treat **and personal fate draw** calls `snapshotMembers`, which invokes `guild.members.fetch()` with no arguments. It does not reuse an earlier complete snapshot or combine concurrent requests. Two immediate snapshot calls in the probe issue two full-member requests.

Discord limits these all-member Gateway requests to **one per bot per guild per 30 seconds**, with `RATE_LIMITED` responses for excess requests. That limit rolled out to all servers on October 1, 2025. See [Discord's change log](https://docs.discord.com/developers/change-log#introducing-rate-limit-when-requesting-all-guild-members) and [Request Guild Members](https://docs.discord.com/developers/events/gateway-events#request-guild-members). The installed Discord.js **14.16.2** `_fetchMany` sends that request, listens for member chunks and defaults to a **120-second** timeout (`node_modules/discord.js/src/managers/GuildMemberManager.js:226–271`); that method does not handle the new rate-limit event. The inference from the actual adapter and published limit is that rapid successive actions can stall/fail before economy mutation. No live rate-limit request was sent to demonstrate it.

This conflicted with spending 5–10 candies in one visit and the simulation's two-second action spacing. The booster **daily cron** also fetched all members (`handlers/boosterHandler.js:50`); the preexisting Winter command did so at `commands/Holiday/Christmas.js:58`. The original audit called booster a startup fetch incorrectly. All these consumers now share the directory and allowance.

**Fix:** introduce a shared, completeness-aware guild member directory. Combine concurrent bootstrap/refresh requests, respect the full-fetch allowance across call sites, and update membership using add/update/remove events. Fetch the actor and selected targets individually when fresh permissions/roles are required. Fate draws should not need a full roster. Handle incomplete bootstrap, rate-limit response and timeout explicitly; do not quietly accept a partial cache.

**Regression acceptance:** ten successive and concurrent mixed-player actions share a safe bootstrap; a startup fetch cannot collide with gameplay; member join/leave and role/hierarchy changes are reflected; personal fate draws avoid a full roster request. Then verify actual burst play in development.

### A02 — committed acquisition stranded by private reply failure

The root transaction commits candy/bank changes, quarters, badge ownership and public outbox rows before Discord delivery. The controller then awaits optional badge-role reconciliation and `interaction.editReply` **outside** its notification delivery `try`. If that private edit fails, `notifications.deliver` is never reached. The controller's catch may attempt the same failed edit again and calls the result unavailable rather than clearly distinguishing a committed action.

The probe spends **10 banked fate**, saves its quarter, and leaves its public announcement **pending** after an injected expired-webhook error; no public send occurs. The generic dispatcher also tells users to retry if their balance changed (`Events/InteractionCreate.js:51`). A new slash command has a new interaction ID and can charge again; replay protection is not protection from that user retry.

There is no general pending-gameplay outbox dispatcher on restart. Lifecycle maintains role intents, and reminder/winner workers handle their own notifications; ordinary quarter/action/badge messages rely on the original interaction path or manual admin resolution. This is a delivery gap rather than a lost quarter.

**Fix:** distinguish pre-commit failure from saved operation status, expose the operation reference and never recommend another paid action to recover a saved result. Isolate private replies and optional badge access from public outbox progress. Add bounded automatic dispatch of definitely **pending** gameplay notifications with correct event/channel ownership, cancellation and cursed-message policies. Preserve the existing manual inspection policy for **sending/uncertain** rows; do not automatically resend ambiguous messages. Cursed-message recovery must continue to protect the original message until confirmed replacement delivery.

**Regression acceptance:** failed/expired edit with a committed draw still permits its public reveal; restart drains eligible pending rows once; uncertain/cancelled rows remain untouched; no second debit or award occurs; optional access failure cannot hide the result. Cover player and admin repair/recompute paths (`admin-command.js:119–121,161–164`).

### A03 — stale intent crosses the external-write boundary

Delivery reads pending rows, awaits member fetch, writes the role/nickname, and only then checks the saved revision when marking completion. Ordinary `canDeliver` checks do not reread the row's status or revision. An administrator can cancel or a new operation can supersede the intent during the member fetch; the loaded old row still issues its external write.

The probe cancels a Sweet Tooth intent and changes its revision **before** `setRole` is called. The role is still added, while the row remains cancelled. This is distinct from the documented unavoidable case of a REST request already in flight at cancellation time: here the request had not started. A cancelled role has no newer pending projection to undo it.

**Fix:** revalidate current status, revision and payload after asynchronous reads and immediately before writing, with coordination covering enqueue, admin cancellation and cleanup as well as delivery calls. Define reconciliation/compensation for a revision change during the actual API request. A post-write CAS alone cannot prevent stale Discord state. Preserve nickname conflict and final-title guards.

**Regression acceptance:** cancel/revise during member fetch results in zero old writes; a newer removal wins over an old add; repeat for nickname and winner role delivery. Test cancellation before the request separately from an already in-flight request. Continue the documented single-writer deployment constraint.

### A04 — `/user` first response can miss Discord's deadline

`/user` performs user lookup and `badgeField` before `interaction.reply`. Badge rendering now fetches server emojis and can also fetch member, bot, roles and channels to reconcile emoji access. Slow REST work can exceed Discord's **three-second initial-response** deadline even though the database and final embed are valid. See [Discord interaction responses](https://docs.discord.com/developers/interactions/receiving-and-responding). The probe observes `badge-network-before-ack` followed by `reply`; no defer occurs.

**Fix:** acknowledge promptly, preserving the intended visibility of `/user`, then edit the deferred reply. Separate ownership rendering from optional role projection/network refresh and make ancillary failures nonfatal. `/spooky`, `/spooky-admin` and `/badges` already defer; do not defer twice when a wrapper has already acknowledged.

**Regression acceptance:** deliberately delayed badge/emoji lookups still see an acknowledgement first and a single final edit; failures produce a useful response without changing profile ownership or visibility.

### A05 — curse restoration loses role identity across configuration changes

Curse metadata records `botOwnedRole` but not the specific role the bot added. Cleanup and break-curse enqueue removal of `roleIds.curse` from the current process. After a restart with a corrected/changed curse role ID, cleanup can replace the old intent with a removal for the new role, leaving the original cursed role on the member. The probe starts with `old-curse` and observes a final removal intent for **`new-curse`**. Admin clear-effect has a prior-intent fallback; automatic cleanup does not consistently use it.

**Fix:** persist and validate the original role identity in effect/restoration metadata. All cleanup, break and admin paths should use the same restoration function. Define a safe compatibility path for existing effects using trustworthy saved intents; never guess or remove a role the bot did not own.

**Regression acceptance:** apply, restart with different settings, break/close, and remove only the originally owned role. Preserve preexisting roles and reject corrupt provenance without destroying recovery evidence.

### A06 — offline registry audit is not enforced by deployment

The new offline registry audit validates the current definitions, but the real deploy loader still warns and skips malformed command exports. It does not reject duplicate names or check that `execute` is callable. Its CLI recognizes only an exact `--check-target` presence, while otherwise ignoring arguments. The probe executes the actual script with synthetic imports: **`--check-taget`** and a malformed command still lead to a mocked bulk PUT of the shortened list.

Guild bulk overwrite replaces the command registry, including slash and context-menu commands; a skipped file can remove an existing command. See [Discord bulk overwrite guild commands](https://docs.discord.com/developers/interactions/application-commands#bulk-overwrite-guild-application-commands). Comparing working definitions with local HEAD does not identify commands that exist only on the live server. The current offline audit found **13 active commands**, three deliberately inactive files, and **no removed active HEAD command**; this finding describes an unsafe deploy path, not an existing disappearance.

**Fix:** reject unknown flags before loading credentials/commands; use one validated registry builder for audit/startup/deploy; explicitly distinguish intentional inactive modules from broken active exports; reject duplicate/invalid definitions. Before an authorized bulk registration, read and save the live guild registry and review intended removals against the exact source snapshot. Await the registration result and verify resulting definitions; arbitrary sleeps do not establish success.

**Regression acceptance:** misspelled inspection flag performs zero REST calls; malformed active export, nonfunction handler and duplicate names abort before PUT; approved inactive files remain allowed; intentional live removals are explicit. Test the whole deployment entry point with inert modules, not just the audit helper.

### A07 — curse messages depend on unrelated XP processing

The call to Spooky message processing sits inside the outer XP/level-up `try`, after XP update and level-up message delivery. If those fail, the outer catch skips the curse handler. The probe injects an XP write failure and records **zero curse handler calls**. Haiku detection also runs before this pipeline without its own error boundary. A level-up channel-send failure has the same control-flow problem.

**Fix:** give haiku, XP/level-up and Spooky message handling separate error boundaries and explicit shared eligibility checks. Decide the order around replies/transformation deliberately, retain bot/reference/attachment safeguards, and use a proper guild check. The string `channel.type === 'DM'` is a carried-over v14 enum mismatch, not an adequate guard.

**Regression acceptance:** XP, badge, haiku and level-up send failures cannot suppress eligible curse processing; Spooky failure cannot suppress unrelated XP; DMs/bot messages remain excluded. Do not rewrite the preexisting haiku feature unnecessarily.

### A08 — one level transition can mint two fate rewards

The modified wallet SQL correctly credits current balances, preventing a stale balance overwrite. However, `messageHandler` can read the same old XP/level in two concurrent events and call `awardLevelUp` twice. That helper updates by user ID without claiming the level transition or checking old level/XP/timestamp. It credits fate each time.

The actual handler probe feeds two synchronized snapshots of level 1 near its threshold, with fate already 100 and booster eligibility. Final state is **level 2 and bank 10**, although a single transition should give bank **5**. That surplus funds an extra Spooky quarter. The underlying message race predates the event; the revised fate integration preserves it and makes it economically relevant here. Existing handoff notes already acknowledge legacy XP concurrency; it should not be described as solved by atomic credits.

**Fix:** atomically claim/update the eligible XP/level transition with the reward, using per-user serialization plus a checked database transition or equivalent transaction. Avoid broad stale User saves. Keep covered Spooky bank purchase and `/fate` CAS behavior intact. Birthday/booster duplicate-job protection needs separate scoped follow-up; do not assume this fix covers schedules.

**Regression acceptance:** two messages crossing one threshold award once; distinct legitimate later transitions still award; concurrent bank purchases and other wallet credits conserve current funds; duplicate announcements cannot imply a second level reward.

### A09 — badge repair status and renderer retain obsolete deferral assumptions

Admin repair passes the actual permanent badge service into collection acquisition, but always returns `badgeOwnership: 'not implemented; repair does not award or revoke badges'`. The probe grants Selene's set and obtains real **`spooky-2026:sel`** ownership while its repair receipt claims the opposite. An admin cannot reliably interpret that receipt when fixing collections.

The completion renderer also equates absence of a **newly** awarded badge with artwork deferral. If an admin removes a last seasonal copy while permanent ownership survives, reacquiring it completes the character without a new badge award; the public embed says **"Badge integration awaits artwork."** Ownership was already awarded. Related comments still say the service is deferred. Separately, a Sweet Tooth result can carry a valid fate/candy reward plus `noEffect` for its role component; the renderer's `noEffect` branch discards reward details. These are state/reporting errors rather than failed ownership transactions.

**Fix:** report actual before/after retained and newly awarded badge ownership. Distinguish newly unlocked, already owned, unavailable artwork and failed optional access. Render successful resource changes alongside a component-specific no-effect explanation rather than calling the whole action empty.

**Regression acceptance:** final-quarter admin grants show real ownership; remove/reacquire retains the badge and says already unlocked; recompute remains idempotent; partial Sweet Tooth outcomes display credited resources even when no eligible role recipient exists.

## Missed requirements and known product decisions

- **Prestige standings are not exposed.** There are separate scores and frozen final winners, but `/spooky` has no prestige leaderboard command. `/badges leaderboard` ranks badge count. `progression.leaders` is called only by tests, and its history selection is less strict than the final winner snapshot's participant-generation handling. The original user requested a prestige leaderboard; either implement rankings without revealing weights and with proper generation rules, or explicitly defer this requirement.
- **Collection view is only seven counts.** Players cannot inspect which of the four positions they own, their extras, or their assembled circle there. Award popups correctly use acquisition-time combination images; the persistent collection view does not. Add a bounded piece/extra view if players are expected to track specific missing pieces.
- **Balance goals remain unmet.** This is an existing documented design result, not a new unproven bug. In the current 40-guild baseline, casual/regular players completed zero characters and the 87.5% engaged cohort averaged 0.75; all-treat behavior performs much better. Trick Eye transfer creates no supply, and gifted candy permits more than 80 actual actions/day. Therefore natural refill is neither a four-quarter daily guarantee nor an action ceiling. See [current population balance](spooky-population-balance.md). Do not alter approved odds/costs silently. This blocks public launch decisions; it does not prevent bounded development correctness testing after the technical blockers are fixed.
- Six badge artworks remain absent; generic medals and Selene are usable for core testing. Reminder destinations/Resident roles/time and final-title names/IDs/channel remain unconfigured and disabled. They require separate live acceptance before those features are enabled. No newcomer catch-up or post-October redemption should be introduced.
- Recipient Eye gifts, targeted treat selection and action batches are not implemented. Locked outcome tables and later instructions do not authorize adding new currency supply. Batches are an ergonomic follow-up, not a substitute for fixing A01.

## Refactors worth doing within the corrective work

1. **Shared Discord boundary services:** member directory, command registry and post-commit dispatcher should be tested through the real composition path. Existing tests tend to inject a ready-made member list or successful edit/send, hiding these defects. Keep domain transaction services injected and network-free.
2. **Rendering without role synchronization:** split pure badge rendering, ownership reads, cached emoji resolution and optional access reconciliation. Reconstructing access services per profile view also bypasses the per-instance queue; share coordination by guild/user where role projection is used.
3. **Quiescent lifecycle path:** the enabled minute scheduler generates a unique maintenance operation even before opening and after a fully archived, restored season. Left enabled for a year it can add approximately 525,600 mostly empty operations. Avoid new root operations for no-op closed ticks while continuing pending restoration/final-award recovery. Do not purge economy evidence as an optimization. Disabling the event also disables cleanup, so document a deliberate shutdown after recovery rather than treating that flag as an unconditional cleanup-safe kill switch.
4. **Structured committed-result errors and observability:** keep operation IDs, scope, component and delivery state in logs/admin diagnostics, with safe player messages. Runtime catch blocks currently hide the original reason. Preserve the rule that errors after commit do not refund, reroll or double award.
5. **One authoritative documentation state:** current headings contained stale claims such as three migrations, badges deferred, full circles pending and live acceptance next, followed by newer contradictory appended notes. This audit corrects the leading handoff/README/checklist instructions. Keep chronological evidence explicitly historical and refresh current status instead of relying on the last paragraph to override everything above it.

## Coverage, strengths and limitations

Reviewed source paths include environment/startup/deployment/interaction dispatch; all Spooky economy, participants, collection, actions, theft, effects/playful/message handling, progression, controller/presentation/art, lifecycle/reminder/winner, notification/role delivery and admin repair/control/resolution/badge paths; permanent ownership/access/rendering; changed fate/XP/birthday/booster integration; four migrations and guarded storage/recovery tooling. Compared legacy and preexisting neighboring behavior where it affects the event. Inspected the installed member-fetch implementation and verified current Discord interaction/member/deploy rules against primary documentation.

The core root transaction, replay identity, atomic theft, automatic five-Eye conversion, first-copy protection, five-extra missing-piece exchange, independent permanent badge ownership and retained audit history have meaningful test coverage. No new conservation/replay/duplicate-consumption defect was reproduced in this audit. Storage migrations and WAL backup/recovery are additive and rehearsed on disposable storage. Durable notification claim/uncertain handling correctly avoids blind ambiguous resends; keep that protection when adding pending recovery.

Historical validation on the pre-fix audit snapshot:

- `npm test`: **224 passed, 0 failed**, about 49 seconds; disposable fixtures/mocked Discord only.
- `node scripts/spooky-branch-audit-probes.js`: nine finding characterizations reproduced; real handlers/services where feasible, memory SQLite/synthetic deployment and Discord adapters only.
- Offline `spooky-preflight.preflight()` and `command-registry-audit.audit()`: pass, 28 piece definitions, 105 token images, seven full circles, 13 active commands, no removed active HEAD definitions.
- Live Discord limits, bot identity/intents, permissions/hierarchy, actual emoji access/visuals, command registration, token expiry and development storage migration have **not** been exercised. A01's rate-limit behavior is a source-plus-official-contract finding, not a live experiment. Passing offline tests cannot establish these properties or prove absence of every bug.

The original audit changed only probes/results/documentation. The subsequent corrective work changed application source and positive tests, as recorded in the correction guide. Approved configuration/odds/version, dependencies, assets, migrations and disabled flags remain unchanged.

## Completed corrective sequence and remaining acceptance

1. **Complete offline — A01/A04:** shared complete member directory/allowance, actor-only fate and early profile acknowledgement; 15/15 focused evidence.
2. **Complete offline — A02/A03:** saved reply/public separation, pending recovery, fresh revision guards and queued projection SQL; initial 37/37 and expanded 44/44 evidence.
3. **Complete offline — A05/A07/A09:** original role restoration, independent pipelines and truthful badge/partial rewards; 66/66 expanded evidence.
4. **Complete offline — A08:** one checked XP/level/fate transition with wallet queue; simultaneous messages and concurrent economy credit covered.
5. **Complete offline — A06:** strict shared registry, inert definitions, explicit live plan/hash/snapshot/apply; 7/7 focused evidence. Full suite 244/244, positive audit runner 20/20, preflight/registry pass; 33 JS syntax and both offline target checks pass.
6. Resolve whether prestige standings and detailed collection view are required for the first test. Keep approved balance values for correctness tests; make a separate public-launch balance decision. Operational reminders/winners/access stay off until configured.
7. Only after the fixes and an explicitly authorized development session: verify exact app/guild and stopped writer; review real storage status/plan/hash and verified backup; apply all four migrations; save/review live guild commands; register the validated registry; run the [development acceptance matrix](spooky-development-acceptance.md). Add bursts, slow replies, pending restart recovery and cancellation timing to that matrix. Production remains a separate request.

**Minimum testable build:** repaired member fetching/acknowledgements, committed-result/public delivery, cancellation/restoration, message processing, level reward transition and accurate badge receipts; validated deployment; four migrated development schema groups; approved v4 rules; current token art/Selene/generic medals; disabled optional reminder/winner/access workers. The implementation already contains the domain features. A new game rewrite, all remaining artwork and a redesigned balance model are not prerequisites to this controlled correctness test.
