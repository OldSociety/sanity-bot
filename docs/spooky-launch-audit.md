# Spooky launch audit — October 2, 2026

Historical audit snapshot: all seven findings below are now corrected; its original defect JSON is retained. The probe script now verifies desired behavior. See [current fixes and exact acceptance steps](spooky-launch-fixes.md). Production still waits for human acceptance, balance and finale configuration.


**Production launch should wait.** The original nine branch-audit findings were fixed, but the current config-8 review reproduced six additional correctness/integration issues and one maintenance-growth issue. No new P1 defect was confirmed. All seven findings below remain open; passing existing tests does not close them. Current balance also misses the requested casual/regular collection targets in the diagnostic sample. This audit supersedes earlier readiness statements, not the approved gameplay rules.

Branch: `feature/S-1-spooky`; local HEAD: `746cb989fa25d1c7338cb2264ed868e56446831f`, with existing uncommitted work preserved. Config 8, piece manifest 2. Production remains disabled/stopped. Development was already enabled and online before this audit. This audit makes no real database, migration, registration, Discord message, role or production changes.

The only product change in this audit is the successful Sweet Tooth title, now **🦷 SWEET TOOTH!**, with a regression assertion. Substantive findings are documented, not silently repaired.

## Confirmed findings

### L01 — P2: reapplying a curse can lose ownership of its role

Source: [playful.js](../services/spooky/playful.js), `curse`, lines 35–38; `clearCurse` and cleanup. The ownership decision considers an active effect or the member's current role snapshot. It does not preserve ownership through an outstanding removal intent after the effect was cleared.

Reproduction: bot adds its curse role; a break removes the effect and queues role removal; Discord removal has not succeeded; another curse hits the same member while the role is still present. The new effect records `botOwnedRole:false`. Final cleanup then preserves the role and cancels the add intent. The role originally added by the bot can remain indefinitely.

Evidence: `curseRestoration` in [saved probes](spooky-launch-audit-results.json): original ownership true, new ownership false, final role intent still present=true with cancelled status. The first projection is explicitly marked applied; subsequent removal stays pending.

Required correction: retain proven original ownership across unresolved restoration, or defer a new effect until restoration is reconciled. Preserve genuinely pre-existing roles and external-edit safety. Add a positive regression covering add success, removal failure, re-hit and October cleanup.

### L02 — P2: re-reversing a nickname can overwrite its real original

Source: [playful.js](../services/spooky/playful.js), `reverse_nickname`, lines 157–165. Repeated active effects are protected, but an outstanding restore after an effect was removed is not.

Reproduction: Bob becomes boB; admin clears the effect and queues restoration to Bob; restoration remains pending; another reversal treats boB as the new original. The final restore now targets boB. The original restoration information was replaced.

Evidence: `nicknameRestoration`: actual original Bob, next-effect original boB, final restoration boB. This uses the real clear-effect service, not a hand-written deletion of the effect.

Required correction: resolve/block pending restoration before creating another nickname effect, preserving original provenance and fresh expected-name checks. Test failed restoration, repeat hits, manual nickname changes and closure.

### L03 — P2: cancellation before the API call can still send a notification

Source: [notifications.js](../services/spooky/notifications.js), lines 22–36. After claiming a pending row, the awaited second eligibility check can overlap an audited cancellation. The sender does not revalidate ownership/status after that wait and before `channel.send`.

Reproduction: hold the second `canDeliver` check after the sending claim; cancel through the real admin resolver while zero sends have started; release the eligibility check. A send occurs even though the row remains cancelled. Existing status CAS prevents the late reply from reopening the row, but does not prevent this pre-send dispatch.

Evidence: `notificationCancellation`: sends before cancel=0, sends after cancel=1, final status cancelled, allSent=false. This is distinct from the documented unavoidable case where cancellation occurs after a network request has already begun.

Required correction: coordinate a final claim/status check with dispatch after asynchronous eligibility work. Keep network calls outside economy transactions. Retain inspection-only handling of sending/uncertain rows and do not introduce automatic ambiguous resends. Add a regression that cancellation during the held eligibility check causes zero API sends.

### L04 — P2: player-filtered queue inspection hides some owned notifications

Source: [admin.js](../services/spooky/admin.js), deliveries inspection SQL, line 76: `o.actorId = :userId` identifies the operator, not always the player who owns a notification.

An admin quarter grant/recompute has the admin as actor and the recipient in its receipt; a resolution copy has explicit original notification ownership. Filtering for that player omits these notices, making recovery inspection incomplete. Event/guild isolation remains intact.

Evidence: `playerQueueFilter`: one scoped repair notification is visible without a player filter and zero are visible when filtering for its recipient. The synthetic receipt uses the same `request.userId` ownership shape as repairs; it is not a full grant/collection simulation.

Required correction: use the canonical owner precedence already used by reset/recovery: explicit notification owner, repair/recompute recipient, otherwise actor. Apply ownership filtering before limit/cursor pagination. Test ordinary awards, admin repairs, recomputes and resolution copies.

### L05 — P2: display-name Markdown can become a bot-authored masked link

Source: [presentation.js](../services/spooky/presentation.js), `safeName`, line 19. It removes mention delimiters and some formatting, but leaves Markdown link syntax.

Evidence: `displayNameMarkdown`: the fake nickname `[Discord prize](https://example.invalid)` survives inside a public bot embed. `allowedMentions` correctly limits pings, but does not neutralize Markdown links. This can mislead players about where a link came from. No real link or Discord message was sent.

Required correction: escape Markdown after neutralizing mentions, using a shared display-name helper for public actor/nonparticipant names and other renderers. Preserve readable names and intended registered-player mentions. Cover links, brackets, parentheses, underscores and multiline names with focused tests.

### L06 — P2 integration: legacy achievement credits bypass the bank cap

Source: [Achievements.js](../commands/Achievements/Achievements.js), lines 604–607. Existing achievement claims directly increment bank by 10/20 without the 100-point cap. This predates Spooky, but Spooky purchases and bonuses now consume/display the same wallet.

Evidence: `legacyAchievementBank` executes that exact legacy increment on the injected User model: 95 → 105. A subsequent real Sweet Tooth bonus correctly grants zero additional points but retains the existing 105. This proves the cap bypass, not an end-to-end duplicate achievement claim or a Spooky over-credit.

Required correction: reconcile the shared wallet policy and route achievement credits through an atomic capped transition. Review claim uniqueness and award/credit transaction composition at the same time. Existing above-cap accounts require an explicit correction policy; do not silently clamp balances. Spooky's capped reward path itself should remain unchanged.

### L07 — P3: idle closed maintenance keeps creating audit operations

Source: [lifecycle.js](../services/spooky/lifecycle.js), line 15 and minute scheduler starting at line 42. Every new maintenance slot executes/records an operation even after closure, with no remaining effects to clean.

Evidence: `closedMaintenance`: three idle closed ticks create three operations. A continuously enabled minute worker schedules 1,440/day, roughly 525,600/year, before command-triggered maintenance. This is storage/query growth, not duplicated rewards or a repeated archive.

Required correction: skip proven no-op maintenance or stop/bound the worker after closure obligations are complete. Preserve delayed restoration and November winner delivery; stopping all maintenance at midnight would strand them. No ledger deletion or retention-policy change is authorized by this audit.

## Balance and launch decisions

The [current sample](spooky-launch-balance-sample.json) uses actual config-8 handlers through the existing memory adapters: seeds 270026/270027, eight scenarios, 16 guilds, 336 player-months and 520,115 actions. Candy/Eye conservation passed in every guild. It assumes manageable human targets, successful role/nickname projections, no external edits, staggered sessions and immediate affordable Fate purchases. Players within one guild are not independent trials. This is diagnostic evidence, **not** a calibrated server forecast or a promised completion probability; historical Task 17 results are preserved separately.

| Monthly mean completed characters | Mixed 50/50 tricks/treats | All-treat population |
| --- | ---: | ---: |
| Casual, 3–4 actions/day with missed days | 0 | 0 |
| Regular, 6–10 actions/day | 0 | 0 |
| Engaged, 70 actions/day | 1.50 | 6.17 |
| Engaged, 80 actions/day | 2.17 | 7.00 |

These rows have six players per cohort/scenario. No casual/regular player in these rows completed a character. In mixed play, five of six 70-action players earned a first character; their conditional median first-character day was October 21.9. Three of six all-treat 70-action players collected all seven; none in the mixed equivalent did. Even the theft-free all-treat casual/regular rows average only 1.83/6 paid draws per month, so theft alone does not explain the target mismatch. Mixed populations also repeatedly steal low-activity players' Eyes before they reach five. This conflicts with the intended casual 1–2 / middle around 4 experience. Do not change rarity, costs, refill, theft or bonuses without the human's decision.

Candy gifts/theft permit more than 80 actions/day; only natural refill is 80/day. Spending every available candy yields about 3,854 monthly actions in the engaged-87 drain row, instead of 2,169 in its fixed-budget baseline. A 1% crown roll is per eligible normal treat: 80 independent normal treats give about a 55% chance of at least one roll, before curse overrides or ownership restrictions. Across a month it is not an exceptionally rare player achievement. Those mechanics are intentional current settings, but their implications need launch approval.

Outstanding operational gates:

- Final winner settings are disabled: Scream Supreme role, announcement channel and exact November 1 Pacific send time remain unset. The proof/worker exists, but **no finale announcement/title will run with the current settings**. The previous development role lookup found no matching role; do not guess/create one.
- Six character badge artworks/emoji names remain missing. Generic medal rendering is functional; native emoji access is separately disabled/unconfigured. Confirm the launch presentation/access promise or finish configuration.
- Development human acceptance remains open for Bank arrows/debits, channel redirects, curse/crown roles, simultaneous interactions, component expiry, denied permissions and recovery. Offline tests cannot validate actual server hierarchy/channel permissions or Discord outages.
- Production schema migration/backup procedure, selected environment, permissions/intents, reviewed live registry including server-only commands, one-writer operation and PM2 activation require a separate explicitly authorized production session. No production storage or Discord readiness claim is made here.

## Refactors and visibility follow-ups

Admin configuration inspection currently exposes the disabled Resident-reminder JSON but omits the independently enabled weekly Unwanted/Fate schedule in `runtime.js:56–65`. Expose both schedules/cadences distinctly, preferably through one settings authority; otherwise an admin may wrongly infer that no reminders can send. Do not disable the user-authorized weekly reminder while refactoring.

The current handoff files contain repeated and superseded status paragraphs. Leading dated status governs; older flags, counts and missing-leaderboard statements are historical. This audit removes exact repeated paragraphs from touched continuation documents and adds an explicit current pointer; it does not erase historical acceptance evidence. Longer-term, keep one concise current handoff and a separate chronology.

The leaderboard scans score evidence and fetches badge ownership per displayed player. The evidence check is valuable; indexing/query aggregation and bounded post-close maintenance should be considered together if the guild grows. This is a performance follow-up, not a reproduced ranking defect. Single-writer execution and manual ambiguous-send recovery remain architectural constraints.

## Verification and scope

- Final `npm test`: **288/288 pass**, including the new tooth-title assertion. Existing replay/transaction, collection, Fate, channel, effect, winner, migration/WAL recovery and registry coverage passes.
- `node scripts/spooky-launch-audit-probes.js`: all seven defects reproduced using private in-memory SQLite, real services and fake Discord. [Saved output](spooky-launch-audit-results.json) records source hashes. These deliberately assert the defects and are **not desired-behavior tests**; replace the relevant assertion when each correction lands.
- 44 JavaScript syntax checks pass; offline preflight and full command-registry audit pass. Registry currently has 13 active source commands; seven Spooky leaves and four admin groups/14 leaves. No definitions changed in this audit, so no registration is required.
- `npm run check:dev` and `npm run deploy:check:dev` pass: authoritative development target, distinct production guild, no credentials printed, database opened or Discord contacted.
- Read-only PM2 status: development online, PID 3276/restarts 9; production stopped, PID 0/restarts 0. Development error log unchanged at 35,694 bytes since September 8. No restart occurred; the tooth source change awaits a later reviewed development reload.
- Review covered Spooky services/runtimes, player/admin definitions and controllers, projections/outbox/recovery, shared wallet and chat pipelines, permanent badges/access/rendering, tokens, winners/reminders, deployment registry and storage tooling. The full offline legacy registry check validates definitions, not every unrelated legacy game handler.

Discord still requires initial interaction acknowledgement within three seconds; follow-up tokens last fifteen minutes. Embeds have per-field limits plus 6,000 combined characters, and enforced nonces only deduplicate within the recent few-minute window. Early deferral, bounded pages and manual uncertain-send handling must be preserved. Sources checked October 2: [interaction documentation](https://docs.discord.com/developers/interactions/receiving-and-responding), [message documentation](https://docs.discord.com/developers/resources/message).

## Exact corrective sequence

1. Fix L01/L02 together: preserve restoration provenance through pending/failed projections. Add positive tests before changing behavior; include legitimate pre-existing roles and manual nickname edits.
2. Fix L03/L04 together: prevent pre-send cancellation races and make owner-filtered recovery inspection complete without breaking pagination/event isolation.
3. Fix L05 in a shared safe-name renderer and test actor/nonparticipant/leaderboard rendering and mention allowlists.
4. Resolve and fix L06's shared achievement bank policy atomically; preserve existing balances until an audited correction policy is approved.
5. Address L07's no-op growth and expose both reminder settings. Preserve final awards and pending cleanup when bounding the scheduler.
6. Replace/update characterization assertions for fixed findings, run focused positive regressions, then full tests, preflight, registry and synthetic storage rehearsal. Update each finding with exact evidence; passing the old defect assertions is not closure.
7. Review collection/crown balance with the human. Extend the dedicated current-config sampler to a larger reviewed seed count after selecting experiments; preserve the historical population report and approved settings until a decision.
8. Obtain finale role/channel/time and badge presentation/access decisions; complete the development live/recovery matrix, then separately review production migration/registry/activation. Update README, AGENTS, handoff and checklist after each group.

Changed in this audit: `services/spooky/flavor.js`, `tests/spooky-flavor.test.js`, new `scripts/spooky-launch-audit-probes.js` / `scripts/spooky-launch-balance-sample.js`, their two JSON reports, this guide, `README.md`, `AGENTS.md`, `docs/spooky-handoff.md`, `docs/spooky-implementation-checklist.md` and `docs/spooky-population-balance.md`. Scoped tracked documentation whitespace checks pass after preserving historical content and normalizing only newly inserted lines. No schema, dependencies, command definitions, economy configuration, art assets or operational flags changed.
