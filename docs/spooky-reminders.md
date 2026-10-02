# Spooky reminders — Task 18b

Status: worker complete offline/source wired on `feature/S-1-spooky`, 2026-10-01. Activation configuration is pending: fuckery channel ID, Resident role ID(s) and Pacific send time. Both the event and reminders remain disabled. No Discord messages, real migrations or deployment occurred. Full Task 18 remains open for score snapshots/final title delivery.

## Configuration and schedule

`config/spooky-reminders.json` is separate operational configuration; the approved gameplay config remains version 4 unchanged. Defaults are enabled=false, timezone America/Los_Angeles, everyDays=3, channelId=null, roleIds=[], localTime=null. Do not substitute the game/test channel or infer Resident IDs. `/spooky-admin config` privately includes this file; IDs/time changes are reviewed file edits and require restart, not player request fields.

Enabled reminders require a channel snowflake, 1–10 unique role snowflakes and HH:mm (24-hour Pacific) send time. Invalid settings fail closed. The copied role list is a strict allowed-mention list; there are no user mentions, @everyone, @here or implicit mention parsing. The role ping is the user-authorized Resident recruitment reminder, independent of individual registration.

`latestReminderSlot(now, settings, event)` computes the latest due Pacific calendar-date slot while ACTIVE. Slots are opening day, then every three local days: October 1, 4, 7, 10, 13, 16, 19, 22, 25, 28 and 31 at the configured time. Before the opening-day time there is no due slot. The IANA timezone handles offset changes; fixed UTC-8 and server-local timezone are not used. There is no post-October redemption/reminder.

After downtime, only the latest due slot is queued. Earlier unsent reminders expire with an audited cancellation; the worker never sends a backlog. A current reminder can be delivered late until the next slot or October closure. Paused actions suppress reminders without consuming a new slot; pending current reminders can resume within the same period. Archived state suppresses them even if the clock is still inside October.

## Durable delivery and wiring

`createReminders({ models, economy, notifications, guildId, getChannel, event, settings, clock })` exposes tick(). It shares the root economy queue and transaction; the event/guild-scoped worker key is `reminder:YYYY-MM-DD`, deliberately independent of config version so a restart/config update cannot create a second reminder for the same date. Enqueue plus zero-resource ledger entry commit atomically. Neither candy, Eyes, inventory, fate nor registration changes.

Receipts freeze slot/channel/roles/time and a settings signature. When configuration changes, pending old payloads cancel; the same slot cannot acquire another payload. New settings take effect at a later scheduled slot. Sent/cancelled rows stay terminal. The worker scopes notification access through owning reminder operations, never an unscoped channel query. Cancellation keys are reminder-expire:<notificationId> and revalidate ownership/status/eligibility inside the root transaction.

Trusted channel resolution runs after commit and must return the exact stored channel ID in the configured guild with a send method. Lookup failure leaves a pending reminder to retry. The outbox's optional canDeliver guard checks ACTIVE/latest slot/signature/pause/archive before and after claiming, covering slow channel lookup or delayed database claims crossing a boundary. A definite no-send releases only an unchanged claim for expiry or resumption; no economic reroll occurs.

Once a network send is attempted, ambiguous failures remain sending/uncertain and require explicit admin resolution. The worker does not resend them. Existing nonce/CAS rules protect successful sends and terminal admin decisions; later cadence slots may still send their own reminders. Admin manual retry/resend is an explicit action outside the scheduled worker; inspect old reminder content/time before intentionally resending. In-flight network requests cannot be recalled or guaranteed to arrive before the boundary.

Runtime maintenance calls the reminder tick after successful lifecycle cleanup/reconciliation, on startup/minute ticks and command maintenance. `withReminders` isolates reminder failures so a broken reminder channel does not prevent player actions or undo closure/restoration. Cleanup failures still propagate. Event/reminder-disabled ticks access neither storage nor Discord; disabling is a kill switch, not automatic cancellation of existing outbox rows. The existing campaign reminder handler remains unchanged.

No new dependencies or migration are required: existing Operations/Ledger/Notifications hold schedule identity and delivery state. The per-process lifecycle scheduler and global economy queue remain the supported concurrency model; this adds no distributed bot lease.

## Verification and next steps

Eleven new offline checks cover invalid/missing configuration, mention allowlists, Pacific boundaries/offset transition, replay/concurrency, atomic rollback, restart/channel failure, uncertain sends, downtime/latest-only expiry, foreign-guild isolation, pause/archive/disable, slow lookup/claim boundaries, configuration changes and lifecycle failure isolation. Full suite **160/160 passes**; current admin inspection checks also pass after exposing reminder config. Syntax checks and documentation links are verified. Only disposable SQLite and mocked channels are used.

Pending activation settings were requested from the user and remain null/empty until supplied. Filling those fields does not enable the event, deploy commands or authorize a real reminder send. Next Task 18c: frozen prestige snapshots and final separate treat/trick title delivery, with final names/role IDs still pending. Badge art/service, balance decisions and live development acceptance remain separate work.
