# Readable nickname states — October 2, 2026

Config 14 on unmerged feature/S-1-spooky. This scoped fix supersedes config-12 curse symbols/bat and sparkle shield appearance. Slots/refill/Spirit remain design-only, with no economic change in this update.

## Existing ownership safety, retained

The current system already captures originalNickname on the first manageable nickname mutation, not registration. Effect.metadata holds the exact string or null, appliedNickname, nicknameDisplayName and historical nicknameSeed. Multiple effects share the same baseline. No legacy SpookyStat columns, migration or parallel nickname owner are needed. Null restores Discord's absence of a server nickname. Pending/conflicting delivery prevents a new cosmetic write from claiming ownership; Discord delivery compares fresh expected nickname and never overwrites a manual edit.

One helper, services/spooky/effect-nicknames.js, serves playful application/removal, goodwill/curse break, shield expiry, October closure and BOTADMIN-only clear-effect/testing resets. Discord nickname calls remain post-commit through delivery.js/discord-adapter.js. Original metadata remains durable until effects are removed; after removal, the restoration intent and ledger retain its proof even if delivery needs retry.

## Appearance

- Curse: `☠ Hadley ☠`.
- Protection: `(( Hadley ))`.
- Reversal alone: `yeldaH`.
- No owned effect: restore original string or null.

Mechanical effects can coexist as before. Visual priority is curse, then protection, then reversal; it always projects from the original baseline, never from another wrapper. Thus clearing a curse can reveal protection, clearing protection can reveal reversal, and clearing the final effect restores the baseline. Curse/protection names truncate only their inner base to fit Discord's 32 UTF-16-unit limit without cutting a surrogate pair. No new public admin restoration command or permission scope is added; existing BOTADMIN-only effect-clear and recovery commands cover manual repair.

Existing active appearances are not mass rewritten. Their recorded appliedNickname must remain accurate for manual-edit-safe restoration. New applications and subsequent transitions use the new design; clearing old symbolic nicknames still restores their exact saved originals. This update makes no real participant correction or effect removal. If a legacy nickname lacks trustworthy metadata, do not guess its original value or force a restore; inspect the existing admin trace/conflict instead.

## Changed files and checks

Changed runtime: services/spooky/effect-nicknames.js and config/spooky-2026.json (version 14 only). Tests: tests/spooky-playful.test.js updates wrappers and adds first-mutation baseline, null/overlap removal and visual priority/length regressions. README, AGENTS, handoff and checklist record this guide. No database/schema, dependencies, slash definitions, rarity, refill, gameplay score or resource changes.

Focused playful/admin/lifecycle/resolution suite: **63/63 pass**; full suite **345/345 pass**. Two syntax checks, offline preflight and full registry audit pass. Logs: artifacts/spooky-nickname-{focused,full}.log and spooky-nickname-{preflight,registry}.json. First test run exposed an invalid new fixture expiry; registration fixture was corrected to use participants.prepare(register:true), then focused/full suites passed. Windows sandbox Node EPERM required outside-sandbox offline execution; no dependency installation.

Scoped rollout: one development reload then one production reload; development ready verified before production reload. Sanitized before/after evidence: artifacts/spooky-production-launch/nickname-{before-processes,process-verification}.json; reload/save logs in the same directory. No migration, real participant reset, command deployment or branch switch. Existing production error baseline has grown since config-13 startup: latest at 04:05:35 UTC October 3, with Unknown Message (10008) and Unknown interaction (10062) entries. This predates this rollout; do not describe the error log as unchanged since September. Inspect interaction-expiry handling separately; no claim that this nickname patch fixes it.

## Exact next

Final rollout verified at 04:59:52 UTC October 3 (9:59 PM Pacific October 2): production online/ready PID 22740/restarts 8, development online/ready PID 20884/restarts 21; PM2 saved. Error log bytes/timestamps unchanged from this task's before snapshot (production 2,820,367 bytes, development 35,694). Scoped whitespace passes. No new startup errors.

Human acceptance: newly curse/protect/reverse a nickname; break curse, expire shield and verify the surviving appearance; clear the final effect and verify exact original restoration. Manual changes during an effect must remain intact and appear as delivery conflicts. Existing real effects are not deliberately applied/cleared by the agent. Keep branch unmerged and one writer per database. Review the preexisting Unknown interaction trace, then resume slots design agreement separately.
