# Quiet recipient mentions — October 2, 2026

Config **11**, manifest **2**, on the live unmerged `feature/S-1-spooky` checkout. The human corrected the previous policy: recipient tags belong **inside the embed**, never on a separate line, should be randomized and spread over **72 hours**. This guide supersedes its historical config-10 section below.

## Current player behavior

Affected trick/treat recipients appear as clickable mentions **only in embed descriptions** on selected eligible actions. Public results have no recipient content line and `allowedMentions` permits no user/role/everyone notification pings. Discord embed mentions do not send mention notifications ([Discord.js embed documentation](https://discordjs.guide/legacy/popular-topics/embeds)). This feature identifies recipients without notification spam. Ordinary results still remain public and name the affected player safely.

The maximum is **one embedded mention per unregistered player** or **four per registered player** within any **rolling 72-hour window**, shared across acting players, actions and permitted channels in that event/guild. There is no midnight reset. Registered recipients have at least **18 hours** between reservations. Eligible actions have a **20% cosmetic selection chance**; a skipped action does not consume allowance. These chance/spacing values are conservative implementation defaults stated to the human, adjustable through validated configuration.

Selection hashes the original operation/recipient identity and never consumes trick/treat/quarter randomness. The committed receipt freezes the decision; replay cannot reroll. Registering or restarting cannot reset the allowance. Config-10 daily reservations in the preceding 72 hours still count, including for spacing, so rollout cannot create a burst of fresh mentions. Mentioning someone does not register them; the actor is not mentioned for their own command.

## Storage and delivery invariants

Recipient reservations remain zero-delta `recipient_mention` ledger rows in the original action transaction. New metadata records reservation time, registration state, window/limit and embed-only intent. Indexed reads count all such records strictly newer than now minus 72 hours; an exactly 72-hour-old reservation has expired. Root failures roll back the reservation; replay, concurrent actors and the one-writer queue preserve the shared cap. Failed/ambiguous/cancelled committed sends do not refund allowance.

The internal outbox marker binds the original operation and ordinal and expires after 72 hours. It carries saved recipient names for safe rendering if expired or copied to a new admin-resend operation. Dispatch strips this marker, forbids pings and converts expired/copied embedded mention syntax to safe names. The old recipient-only tag line is also stripped from config-10 marked queued messages; legacy markers are muted and their embed mentions replaced with names. Historical stored receipts are not rewritten.

These limits concern gameplay recipient references. Existing explicit role reminders, finale announcements and trusted admin badge-grant notifications retain their own established policies. Fate confirmation, resources, rarity odds, effects, badges and winner scoring remain unchanged. No new schema, dependencies, registration or reset is involved.

## Changed files and exact continuation

Changed config/spooky-2026.json (11), services/spooky/config.js, mentions.js, controller.js and presentation.js. Updated tests/spooky-mentions.test.js, spooky-controller.test.js and spooky-flavor.test.js. Existing token-art/notification final-dispatch integration is reused. README, AGENTS, handoff/rules/checklist and this guide reflect the current policy; preflight/registry evidence is refreshed. Commands are unchanged, so no command deployment is required.

Focused **26/26** pass: rolling-window boundary, 18-hour spacing, random selection/misses, legacy reservations/registration, concurrent actors/guild isolation, rollback/replay, no top-level tags or pings, and delayed/admin-copy/ambiguous delivery behavior. Final config-11 verification: **326/326 full tests**, **26/26 focused**, seven syntax checks, refreshed offline preflight/full registry/positive probes and scoped whitespace pass. One authorized reload per bot; production online PID 12120/restarts 4, development online PID 23096/restarts 18, PM2 saved. Current readiness confirmed; both error logs retain their September sizes/timestamps, with no new startup errors. Fresh registry checks match unchanged definitions: 14 development including /game, 13 production. No registration, migration, real participant action/reset or balance correction was performed by the agent.

Evidence: artifacts/spooky-production-launch/quiet-mentions-{focused,full}.log, quiet-mentions-probes.json, quiet-mentions-*-reload.log, quiet-mentions-pm2-save.log, quiet-mentions-process-verification.json and quiet-mentions-source-snapshot.json. Config 11 is live. Exact next is human embed-only rendering/no-notification/cadence acceptance; retain this feature branch unmerged and the existing data/recovery constraints.

Exact next after rollout: human check that a selected target is linked only inside the embed with no separate tag line, unselected/cooldown results use names, and no mention notification is sent. Observe the slower cadence on this feature branch. Keep the five accepted badge placeholders, historical population forecasts, one-writer requirement and manual uncertain-delivery recovery in mind. Do not merge, reset production, overwrite live storage or enable unrelated workers.

---

## Historical config-10 implementation and deployment evidence (superseded)

# Capped recipient mentions — October 2, 2026

Config **10**, manifest **2**, on `feature/S-1-spooky`. The human requested that affected players receive real mentions, including nonparticipants, with daily limits. This supersedes the old registration-only/no-nonparticipant-ping policy. It is a presentation/delivery change: economy odds/costs/refills, role effects, Fate confirmations, ownership and winner rules stay unchanged.

## Behavior

Affected recipients of tricks/treats are publicly mentioned at most **once per Pacific calendar day when unregistered**, or **four times when registered**. Midnight in America/Los_Angeles resets the allowance. The cap is shared across all acting players, tricks/treats and permitted Spooky/test channels in that event/guild. Registering during the day increases the allowance to four total, including any earlier nonparticipant mention. Being mentioned does not register someone. Affected recipients are deduplicated per action; the acting player is not pinged for their own command.

After the allowance is exhausted, public flavor/results still identify recipients using safe display names, without a mention. Names containing @everyone or mention syntax are sanitized. There are no new private messages or recurring reminders to nonparticipants. Personal failures/screens remain private; earned finds/pieces/completions remain public. Existing explicitly configured role reminders/admin award announcements are separate from these gameplay-recipient caps.

## Durable limits and delivery

The original action's economy transaction reserves each permitted recipient mention as a zero-delta **recipient_mention** ledger row. Metadata records Pacific date, registration status, limit and message ordinal. It changes no resource balance and is visible in private admin transactions. Root rollback removes reservations; committed replay retains its original rendering and does not reserve or ping again. Reservations survive restarts and seasonal/testing participant resets because the ledger is retained. Registration does not reset today's count.

Reads use the existing event/guild/user/timestamp ledger index with a 26-hour window and exact saved Pacific date; this covers even a 25-hour DST day. There is no new table, schema migration, dependency or separate timer. The existing one-writer/serialized economy requirement remains.

The saved main public payload carries an internal reservation marker tied to operation ID, ordinal and date. Immediately before network dispatch, the marker is stripped. A delayed message crossing midnight, a copied admin-resend notification, or the wrong ordinal loses all allowed mentions while its content/art/results remain intact. This prevents old reservations creating extra pings today. Ordinary pending delivery retries retain their original slot; sending/uncertain deliveries keep the existing manual recovery policy. A cancelled, failed or ambiguous committed send does not refund its reserved slot, avoiding extra pings when delivery is uncertain.

Limits apply prospectively to newly committed gameplay. Historical saved payloads/receipts are not rewritten. Existing queued role reminders/admin awards retain their own established mention policies. No actual participant action or message was triggered by the agent as a test.

## Changed files, checks and continuation

- config/spooky-2026.json and services/spooky/config.js: version 10 and validated registered/unregistered daily limits.
- New services/spooky/mentions.js: transactional recipient reservations, Pacific dates and final dispatch guard.
- services/spooky/controller.js and presentation.js: capped mention allowlist, content-level Discord pings and safe-name fallback.
- services/spooky/token-art.js and notifications.js: strip internal marker and mute stale/copied reservations at dispatch; injectable notification clock for synthetic tests.
- New tests/spooky-mentions.test.js and updated tests/spooky-controller.test.js: concurrent actors, combined daily caps, separate guilds, rollback/replay, registration upgrade, midnight/DST, delayed outbox/admin copy and ambiguous delivery.
- README, AGENTS, rules/handoff/checklist and this guide; refreshed offline preflight/registry evidence. Command definitions are unchanged; no bulk registration is needed.

Focused suite **34/34** passes. Full verification and authorized reload results are recorded below after completion. Current unresolved constraints remain the five accepted artwork placeholders, historical population forecasts, one writer and manual ambiguous notification resolution.

Exact next after reload: human test a trick/treat against an unregistered account, verify its first ping and later safe-name result, then verify registered recipients stop pinging after four combined actions that Pacific day. Continue live observation on the unmerged feature branch. Do not reset production, copy development storage into production or merge without instruction.

Final verification and rollout: **325/325 full tests**, **34/34 focused**, eight edited-JavaScript syntax checks, offline preflight/full registry/positive probes and scoped whitespace pass. Both selected live registries still match unchanged definitions: fourteen development (/game preserved), thirteen production. No command registration or migration occurred. One authorized reload per process: production online PID 1404/restarts 3, development online PID 18840/restarts 17; PM2 saved. Current readiness messages confirmed; error logs retain their September sizes/timestamps (production 2,819,038 bytes, development 35,694 bytes), with no new startup errors. Config 10 is live from the unmerged feature checkout.

Evidence: artifacts/spooky-production-launch/mentions-{focused,full}.log, mentions-probes.json, mentions-*-reload.log, mentions-pm2-save.log and mentions-process-verification.json, plus refreshed docs/spooky-preflight-results.json and command-registry-audit-results.json. No real participant action, reset or balance correction was performed by the agent. Exact next remains human ping/cap observation and scoped fixes on this branch. Current-day counters begin prospectively with newly committed actions; no historic receipt rewriting or mass tagging was performed.
