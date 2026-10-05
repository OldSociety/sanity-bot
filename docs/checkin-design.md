# Native session check-ins and party reminder replacement

Design prepared October 5, 2026 on `feature/S-1-checkin`, branched from `codex/fate-support-audit` at `eac5b18`. The checkout was clean; branch creation changed no runtime files. This document specifies the feature; it does not activate a scheduler, add tables, deploy commands, or send check-ins.

## Player and staff experience

Each configured campaign occurrence creates an independent check-in for each current human player holding its configured role. Role IDs are the sole campaign-recipient selector: no automatic enrollment from channel participation, usernames, other campaign roles, or Administrator status. Resolve the confirmed role names to IDs during setup, then persist the IDs. Wednesday targets **WednesdaysinHell**; the Monday party's exact role ID must be verified. A short DM names the campaign and actual check-in window and provides **Begin Check-In** and **Absence**. The player completes the questionnaire in DMs, can resume after a restart, receives a complete answer receipt, and later receives the staff decision and optional reason.

**Absence** opens one required explanation box instead of the nine-question form. Save `submissionType = ABSENCE` and the explanation; do not ask ratings, participation, preparation, or weekly code. After submitting: “Thank you for letting me know. Please also notify the other players that you won't be attending.” Send an absence receipt to the player and an explicitly labeled Absence submission to the same staff review channel. An absence is a completed check-in and must never trigger a missed-check-in DM, regardless of review status. It remains eligible for the same staff review workflow. Normal submissions use `submissionType = STANDARD`. An unsent draft can switch type explicitly without silently losing answers; submitted records remain immutable.

Preserve the supplied Appy-style questionnaire and presentation:

| Question | Input |
| --- | --- |
| 1. What session are you checking in for? | Automatically filled from the configured campaign, never guessed from a role name |
| 2. Rate your latest session, 5 being the best. | Buttons 1–5 |
| 3. Rate the story, 5 being the best. | Buttons 1–5 |
| 4. Rate the quests, 5 being the best. | Buttons 1–5 |
| 5. Are you prepared for the session? | Yes / No |
| 6. Did you participate in the server chat regularly since your last session? (2+ messages a week) | Yes / No, self-reported |
| 7. If no, how have you remained active in the server the last two weeks? | DM text; save `-` when question 6 is Yes |
| 8. Do you have any additional feedback? | DM text or Skip (`-`) |
| 9. What is this week's code? | DM text; preserve the exact response |

The receipt and staff post use the same immutable submission snapshot and rendering function. Include username/display name, avatar, user ID, session date, answers, elapsed wall-clock duration, and joined/submitted timestamps. Show unavailable join dates honestly. Quiet mentions everywhere: `allowedMentions: { parse: [] }`. The player receipt has no staff buttons.

The private review channel receives **Accept**, **Deny**, **Accept with Reason**, and **Deny with Reason** in green, red, blue, and gray respectively. The reason variants open a required-text modal. A successful decision preserves answers, records reviewer/time/reason, updates the staff message, disables all four buttons, and queues a player DM. First committed decision wins; opening a reason modal does not lock the submission or stop another reviewer. A later modal submission rechecks permission and pending status.

Check-ins do not award Fate, Bank, XP, Sanity, badges, roles, or activity credit. The participation answer remains self-reported; no roster scoring or automatic punishment is introduced.

## Correct the existing party-channel reminder

`handlers/reminderHandler.js` currently registers two Thursday-noon jobs. Both resolve `MONDAYCHANNELID`, neither specifies a timezone, and each derives parity from a different 2025 anchor. The second branch evaluates a template string without calling `channel.send`. Its displayed session/day text is also derived from branch parity rather than a configured campaign. `app.js` wires this handler into startup; audit finding A12 already identifies these defects.

Replace both jobs with one configured occurrence scheduler shared by DM check-ins and any retained party reminder. Each campaign has its own party channel, player role, session calendar, reminder time, and review channel. Use fresh channel fetches, validate the selected guild and text-send capability, and contain failures per campaign and recipient. Never fall back to the Monday channel or another campaign.

Confirmed policy: **party reminder plus DM**. Retain one short, quiet party post per active occurrence, linked to the native check-in entry point; never publish individual noncompletion or blocked-DM details there. Monday party posts Thursday at noon Pacific; Wednesday party posts Saturday at noon Pacific. These are the days before their respective cutoff dates. Post only during an active check-in window, never every week indiscriminately. Suggested copy: “A gentle reminder to complete your check-in by tomorrow at 11:59 p.m. Pacific. If you can't attend, please choose Absence and let the other players know.”

Do not run the legacy and replacement schedules simultaneously. Replace the legacy handler wiring at the verified cutover, after confirming correct mappings and current occurrence. Rollback must explicitly select one scheduler and respect existing delivery receipts. Until implementation and activation, the existing live reminder behavior remains unchanged.

## Confirmed schedule and holiday break

All dates below use 2026 and `America/Los_Angeles`; the holiday ends January 1, 2027 inclusive. The five-day window means five Pacific calendar dates, not 120 hours after DM delivery.

| Campaign | First opening DM | Party reminder | Last accepted minute | Recurrence |
| --- | --- | --- | --- | --- |
| WednesdaysinHell | Wednesday October 14, 2026 | Saturday October 17, noon | Sunday October 18, 11:59 p.m. Pacific | Every 14 calendar days from October 14 |
| Monday party | Monday October 19, 2026 | Thursday October 22, noon | Friday October 23, 11:59 p.m. Pacific | Every 14 calendar days from October 19 |

Treat closing as an exclusive next-midnight boundary: Monday's Friday 11:59 minute runs until Saturday 00:00 Pacific; Wednesday closes Monday 00:00 Pacific. The answer transaction must verify this boundary using the authoritative clock. Drafts expire at close; submissions already received remain reviewable afterward.

Opening DMs are confirmed for noon Pacific. Store an explicit **check-in opening anchor**, separate from actual game date; the user supplied check-in dates, not game times. Do not invent game dates from those anchors.

Completed standard and absence submissions both count as checked in, including pending/denied staff decisions. For an invited person who has no completed submission when the window closes, queue one soft DM: “It looks like you missed this check-in. Please reach out to me as soon as possible to confirm whether you'll be playing.” Configure the organizer mention/contact for clear attribution; no automatic penalties. Check fresh campaign-role eligibility before sending: people who left the guild or lost that campaign role receive no follow-up. Keep the historic invitation record. Closed-DM failures remain visible privately to staff, not in party chat.

**Holiday break:** December 7, 2026 through January 1, 2027 inclusive, for both campaigns. Suppress openings, party cutoff reminders and missed-check-in notices for skipped holiday occurrences. No catch-up forms or missed penalties after the break. Keep the original fortnightly anchors; skipping does not reset cadence:

- Wednesday openings: October 14/28, November 11/25; December 9/23 skipped; resume January 6, 2027 (cutoff January 10).
- Monday openings: October 19, November 2/16/30; December 14/28 skipped; resume January 11, 2027 (cutoff January 15).
- November 30's Monday window ends December 4, before the break, so it remains active. If an administrator later creates a window overlapping a break, require an explicit skip/reschedule choice and preview; do not silently send a holiday-straddling form.

Queue one holiday notice **in each party channel**, with a unique `(guildId, breakId, campaignKey, holiday-notice)` delivery key. Confirmed posting: December 7, 2026 at noon Pacific. Suggested copy: “We're on holiday break from December 7 through January 1, so there are no games or check-ins during that time. Enjoy the break! Your next check-in will arrive on [January 6 / January 11].” Restart/retry must not create a new notice. Startup catch-up is allowed only during that break; never announce an ended break. Editing an announced break updates the existing notice where possible rather than announcing it again. No direct player holiday DMs were requested.

All submitted standard/absence responses go to **weekly-checkin**, channel **`1287945944444309564`**. Verify its guild, access and staff visibility before activation. Development must use its own verified review destination; do not send test submissions to this channel automatically.

## Configuration and calendar

Add `config/checkins.json` with separate development/production guild scopes and disabled defaults. No guessed IDs or active example schedules. Required per campaign:

| Setting | Meaning |
| --- | --- |
| `formKey`, `formName`, `sessionName`, `formVersion` | Stable campaign identity and immutable question version |
| `playerRoleId`, `reviewerRoleIds` | Recipient and staff role IDs; no inferred Administrator bypass |
| `partyChannelId`, `reviewChannelId` | Distinct configured destinations; review channel must be staff-only |
| `timezone` | `America/Los_Angeles` |
| `anchorOpenDate`, `intervalWeeks`, `openingLocalTime` | Confirmed opening anchor and fortnightly cadence; actual game date is independent metadata |
| `windowCalendarDays`, `deadlineLocalTime` | Five calendar dates including opening day; final date closes after 11:59 p.m. Pacific |
| `partyReminderLocalTime`, `partyReminderDaysBeforeCutoff` | Noon on the date before cutoff |
| `partyReminderMode` | `disabled` or `alongside` |
| occurrence overrides | Skip, reschedule, or change code for an explicit session |
| holiday breaks | Explicit inclusive date range, notice date/time, per-channel notice receipts |

Use Pacific calendar arithmetic, not milliseconds divided by seven days. Store the actual scheduled session date, with an immutable occurrence ID to preserve identity through rescheduling. An override moves the existing occurrence rather than creating a second invitation. Validate nonexistent/ambiguous local times with an explicit policy; prefer ordinary daytime schedules. Use a mature timezone implementation already available and verify its installed version before choosing an API.

A startup pass and singleton minute worker find currently open occurrences. Catch up only inside their configured window; never replay all missed historical weeks. Fetch a fresh paginated REST roster, exclude bots, fail the campaign closed on incomplete/repeated pagination, then create records under a unique constraint. Recheck current membership and role before first delivery and when beginning/resuming. Preserve submitted historical answers after a role change. Staff can view historical records, but cannot use an unrestricted open/resend to bypass campaign eligibility.

## Persistence and reliability

One submission model alone is insufficient for reliable external delivery. Use additive tables in the existing environment-selected SQLite database:

- **CheckInOccurrence:** guild, stable campaign/occurrence identity, session date, open/deadline timestamps, skip/reschedule state, and a snapshot of form/destination configuration and code-validation policy.
- **CheckInSubmission:** unique `(guildId, userId, occurrenceId)`; role snapshot; `STANDARD` or `ABSENCE` type; absence explanation; `INVITED`, `IN_PROGRESS`, `PENDING`, `ACCEPTED`, `DENIED`, or `EXPIRED`; current question; answers; form version; optimistic revision; started/submitted/reviewed timestamps; reviewer/reason; DM channel and prompt IDs; review/receipt IDs; canonical submission snapshot. Delivery status is separate from questionnaire status: a failed reminder must not masquerade as `REMINDER_SENT`.
- **CheckInDelivery:** unique delivery key per occurrence/submission and purpose (invite, prompt revision, receipt, review post, review edit, decision, party reminder, missed-check-in DM, holiday notice, staff failure notice); pending/leased/sent/failed/uncertain status, bounded attempts/backoff, last error, destination/message IDs, lease expiry, and stable reconciliation marker.
- **CheckInEvent:** append-only accepted answer/review/admin events with unique Discord message/interaction source ID, actor, revision, and timestamp. Supports replay prevention and audit without logging answer text to ordinary process logs.
- **CheckInConversation:** one active free-text submission per bot/user DM channel, persisted across restarts. A player can have multiple campaign records, but selecting one explicitly suspends the other's text conversation. Prompt identifies campaign/date; replies to an older prompt cannot answer the current question.

Reserve records/deliveries transactionally before network calls. Save each answer with expected question/revision and unique source ID in the same transaction, then queue its next prompt. Submit atomically after question 9, freeze answers, and queue receipt plus review post independently. Review uses `UPDATE ... WHERE status = PENDING`; save the decision event and notification deliveries in that transaction. Never hold a database transaction while awaiting Discord.

Delivery leases recover after crashes. Discord sends and local commits are not one atomic operation: a successful send followed by a crash can leave an uncertain delivery. Reconcile by saved ID or marker and bounded destination history where permitted; retry only proven unsent deliveries. If reconciliation is inconclusive, record `uncertain` and expose it to staff rather than claiming exactly-once delivery. Message edits are retriable. Closed-DM rejection becomes a terminal delivery failure with one quiet staff notice; network/rate-limit failures use bounded retries. Failure to deliver that staff notice is also retained. One failed player must not abort the roster.

Staff status distinguishes invited/not started, in progress, pending, accepted, denied, expired, delivery failed and uncertain. These are overlapping workflow/delivery dimensions, not misleading mutually exclusive totals. Current roster changes do not rewrite an occurrence's historical invited population.

## Routing, authorization and limits

Add `DirectMessages` and `Partials.Channel` to the client after verification against installed discord.js. Existing `handlers/messageHandler.js` excludes nonguild messages; keep that guard and route check-in DMs through a dedicated handler so answers cannot reach guild XP, Sanity, haiku or seasonal processing.

Route only `ci:` components/modals through a dedicated check-in dispatcher before unrelated button handlers in `Events/InteractionCreate.js`. Unknown/stale IDs receive a contained response. Do not use in-memory collectors as authoritative state. IDs encode action, submission, question/revision or short modal token; never answers or permissions.

Player actions require the submission owner, expected DM channel and prompt/revision, current allowed state/window, selected environment/guild, and current membership eligibility. Ordinary text from an unselected conversation is ignored. Staff actions require fresh membership/reviewer roles, configured guild/channel/message identity, current environment activation and pending status. Modal tokens bind actor/submission/message/action and expire; modal submission revalidates everything. Avoid self-review by default, subject to explicit policy confirmation.

Defer ordinary interactions immediately before slow work. A modal must be the initial response: open it without slow REST work, then perform authoritative checks on modal submit before saving. Button visibility never grants permission.

Validate ratings and Yes/No enums; bound question 7/8 text and weekly code, keep original code input separate from normalized validation, and freeze the expected code version at submission. A mismatched or missing configured code remains a review flag, never an automatic denial. Suggested text limits: 800 characters each for questions 7/8, 100 for code, 800 for reviewer reason. Validate the entire generated embed against Discord's individual and combined limits, including long names; paginate identical receipt/review content if needed rather than silently losing answers. Escape misleading display markup where appropriate and suppress all notification mentions.

Commands proposed: player `/checkin resume [session]` with campaign selection when necessary; staff `/checkin status session`, `/checkin resend player session`, and `/checkin open player session`. Separate owner configuration/migration tools from regular commands. Open/resend operate within an explicit occurrence, preserve answers/decisions, and have durable request receipts and cooldowns. They never silently reopen a reviewed submission.

## Development-only end-to-end test command

Add standalone **`/checkin-test campaign`** to the development guild only. Invoking it sends the configured bot owner a DM with the same **Begin Check-In** and **Absence** choices used by real check-ins. No target-user option: the command cannot message another player. Require `NODE_ENV === development`, the exact configured development guild, `BOTADMINID` as invoking user, and a persisted `testCommandEnabled` flag on every invocation and subsequent test action. Use the existing command `environments: ['development']` filter for both registration and loading, plus an execution guard before importing storage or sending anything. Production's registry must never include this command.

Use the real questionnaire, validation, persistence, receipt renderer, staff review buttons/reason modals and decision DM pipeline. Label the DM, receipt and review post **TEST CHECK-IN**. Store `isTest`, an independent test occurrence ID and a snapshot of the chosen campaign's form; send the review copy only to an explicitly verified development review channel. Never inherit the production weekly-checkin channel as a fallback. Allow the owner to test without holding the campaign player role; this exemption applies only to an owner-bound test record. Permit the owner to review their own test submission so they can exercise the complete workflow alone; production self-review policy is unchanged.

The private command acknowledgment reports whether the DM was delivered and directs the owner to it. Closed DMs return a useful private failure and preserve delivery diagnostics. Repeated invocation resumes an existing unfinished test for that campaign rather than opening competing DM conversations; after completion it can create a new independent test. Use the interaction source receipt and a short cooldown to prevent accidental duplicate sends. Re-running after the first completed test allows testing the Absence path separately. Test records use the same restart/resume and stale-button protections, but are excluded from real occurrence status totals, scheduled invites, missed-check-in notices, holidays and player history reports. No game resources or activity credit are changed.

At live cutover, set `testCommandEnabled = false` in the same release configuration that enables the live feature. Remove `/checkin-test` from the development guild registry using a reviewed scoped registry change; do not replace unrelated commands. Reject saved test buttons/modals and block queued unsent test deliveries after disablement, preserving completed test audit records. The command stays absent in production. Rollback does not silently reenable it: reopening tests is an explicit development-only owner action.

Required checks: owner receives full standard/Absence flow and decision DM; another development user is rejected; wrong guild and production are rejected before storage/send; test role exemption cannot affect real records; development destination cannot fall back to production; restart preserves progress; duplicate invocation/replayed interaction cannot duplicate invites; disablement removes registration and rejects old interactions/queued deliveries; no test records affect real missed-check-in notices, reports, balances or unrelated commands.

This command is an implementation requirement in the design, not yet registered or executable. The native questionnaire and delivery services must exist before the command can send a meaningful end-to-end test.

## Discord configuration commands

Provide a restricted `/checkin-admin` command for the owner and explicitly configured check-in managers, with server-side authorization on every invocation. Reviewer permission alone does not grant configuration permission. Persist changes in the environment database as versioned configuration; the JSON file supplies disabled bootstrap defaults, not a file that slash commands rewrite.

| Command | Purpose |
| --- | --- |
| `/checkin-admin show campaign` | Current role/channel settings, cadence, upcoming windows, break suppression and delivery status |
| `/checkin-admin campaign campaign player-role party-channel review-channel` | Select actual Discord roles/channels; validate guild and access |
| `/checkin-admin schedule campaign anchor interval-weeks dm-time window-days reminder-time` | Adjust future opening/cutoff/reminder schedule; default two weeks, five dates, noon party reminder |
| `/checkin-admin reviewers campaign roles` | Configure who may review; validate all role IDs |
| `/checkin-admin code campaign occurrence value` | Configure the current occurrence's code privately |
| `/checkin-admin break set start end notice-at` | Create/update both-party break and its one-time notice |
| `/checkin-admin break remove break-id` | Remove a future break with schedule preview |
| `/checkin-admin occurrence campaign occurrence action` | Skip or reschedule a specific window without changing fortnightly anchor |
| `/checkin-admin pause campaign` / `resume campaign` | Control future automatic delivery; no retroactive overdue burst |
| `/checkin-admin preview campaign` | Dry-run recipient count and next opening, reminder, cutoff and holiday notice; no messages sent |

Mutating commands show a private before/after preview and Confirm/Cancel, including upcoming Pacific dates and affected existing windows. Bind confirmation to actor, config revision and expiry. Apply atomically with a unique interaction receipt and config audit entry. Default to future unopened occurrences: changing a schedule never silently closes an in-progress form, resends invitations or clears submission history. Explicitly changing an open occurrence requires a preview of impacted players/deliveries and preserves its ID/answers. Invalidate only unsent deliveries under the old revision. Enabling production remains a deliberate deployment/activation step, not a side effect of editing a schedule.

## Implementation and verification plan

1. Verify campaign role/party-channel mappings and reviewer permissions; confirm self-review policy and history retention. Preserve the confirmed dates, five-day cutoff, party reminders and holiday range. Keep both environment activations disabled.
2. Implement pure config/calendar validation, data-driven questions and canonical presentation, then additive models/migration and transaction services on disposable storage.
3. Implement delivery recovery, DM routing, component/modal guards and commands with injected clock/Discord adapters; no live sends in automated tests. Add `/checkin-test campaign` for owner-invoked development acceptance of the real DM/receipt/review/decision flow.
4. Replace legacy reminder wiring behind the feature activation; prove disabled mode creates no check-in timers/storage access or accidental command exposure. Preserve unrelated reminder systems.
5. Run focused regressions and the full existing isolated suite, syntax/whitespace, preflight and offline registry checks. Rehearse migrations on disposable copies and verify all existing tables/balances are preserved.
6. Prepare development-only activation with stopped-writer verified backup, reviewed command diff, explicit test campaign/role/channel and dry-run recipient preview. Use the owner's `/checkin-test` acceptance before launch. Disable and unregister the test command at live cutover. Production deployment and activation are separate deliberate steps; preserve `.runtime/production` and one writer. No merge or push is part of this design task.

Required regressions: both reminder destinations actually send; Pacific/host timezone differences; fortnightly parity, DST/year boundaries and skipped/rescheduled sessions; startup inside/outside windows; repeated startup/concurrent ticks; incomplete roster; two campaign roles; conversation switching and stale prompts; answer source replay; double clicks; closed DMs and independent failures; restart after every question; crash before/after send; receipt failure with successful staff post; long/Unicode answers and mentions; wrong user/guild/channel/message/reviewer; revoked role while modal open; concurrent decisions; failed decision DM; command lifecycle/disabled production parity; unchanged wallets and guild message pipeline.

## Inputs still required

Confirmed: WednesdaysinHell opening October 14; Monday opening October 19; fortnightly opening cadence; five calendar dates ending Sunday/Friday 11:59 p.m. Pacific; Saturday/Thursday noon party posts; weekly-checkin channel `1287945944444309564`; Absence explanation and player thank-you; missed-check-in DM; December 7–January 1 break; one holiday notice per party channel; in-server management commands; noon Pacific opening DMs and December 7 noon holiday notice.

Still need verified campaign role IDs (including exact Monday role), both party channel IDs, reviewer/manager roles and environment scopes; organizer contact; weekly-code management; whether question 7 intentionally uses two weeks while question 6 uses one week; self-review and history retention policy. No late player submissions after cutoff by default; a staff-authorized exception would require an explicit audited occurrence override. These block activation, not offline implementation.

Additional required regressions: absence bypasses all normal questions/code and suppresses overdue DMs; pending/denied completed submissions do not count as missed; exact final-minute and next-midnight deadlines; eligibility revoked before deadline; October anchors through DST; holiday skip/resume dates and no retroactive deliveries; once-only notice per party across restarts; configuration authorization, preview confirmation replay/stale revision, and edits preserving open/finished records.

## Reference constraints

The pasted proposal is the UX reference; Appy is outside the runtime path. No Appy API dependency or paid service is required. Discord constraints were checked against official [interaction documentation](https://github.com/discord/discord-api-docs/blob/main/developers/interactions/receiving-and-responding.mdx), [message/embed documentation](https://github.com/discord/discord-api-docs/blob/main/developers/resources/message.mdx), [modal guide](https://github.com/discordjs/guide/blob/main/guide/interactions/modals.md), and [partials guide](https://discordjs.guide/legacy/popular-topics/partials). Use APIs compatible with the installed discord.js 14 release; newer documentation examples are not an authorization for dependency upgrades.
