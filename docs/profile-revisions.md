# Profile layout, badge provenance and Bots role exclusions

## Badge verification

Read-only connections to `config/dev.sqlite` and `config/prod.sqlite` show two permanent development ownership rows for the configured owner: Selene (`spooky-2026:sel`, October2 at16:01:56 Pacific) and Marq (`spooky-2026:mrq`, October2 at16:59:15 Pacific). Both matching badge-award ledger rows record `character_complete`, admin `grant-quarter`, and `adminReason: test`. These are saved development test awards, not ordinary gameplay acquisitions. Production BadgeOwnership is empty. No badge/player correction or reset was performed. The card reads `BadgeOwnership`, not the main `Users` or legacy `SpookyStats` table.

Evidence: `artifacts/profile-development/badge-audit.json` and the read-only audit script. Existing ownership and audit history are preserved.

## Card revision

The card shows up to **10 most recently unlocked, known, owned badges**, newest first. A regression uses125 catalog entries to verify that only the newest10 appear. There are currently seven configured Spooky badges; the display limit is independent of the catalog size. The strip does not invent unlocks, display unowned badges, or cap total ownership at10.

Removed the top-left brand text and numeric XP. The progress bar still uses the current XP rules, but its right-hand label shows the destination level; the current level remains under the avatar. The upper-right `ADMIN` label follows the configured Admin role or a role named exactly Admin, independently of command authorization. Bot-admin security policy is unchanged.

Backgrounds are organized in `assets/profile-backgrounds/{default,halloween,winter,pride,spring,autumn}`. The original blackhole image is retained unchanged as `default/blackhole.avif`. Seasonal folders are ready for future artwork. Seasonal image generation and automatic calendar selection were not requested/implemented in this stage.

## Production exclusions

`services/member-policy.js` excludes actual Discord bots and members carrying configured `BOTROLEID` or a role named Bots, except in explicit development. Runtime membership snapshots apply that policy before random candy/Eye/effect recipient selection. Spooky leaderboards and badge leaderboards filter eligible membership **before** ranking/pagination. Command dispatch rejects excluded actors and explicitly selected players for `/spooky`, `/spooky-admin`, `/badges`, `/profile` and `/user`; badge views check their selected member directly. The development exception permits the server's Bots-role test accounts. No historical score, participant, badge or Crown ownership is rewritten.

`/profile` remains development-only. Production receives only the exclusions in existing commands/gameplay. Slash definitions are unchanged, so no registry deployment is needed.

The preexisting concurrent `services/spooky/flavor.js` edits are preserved and are not part of these profile/filter changes.

## Verification and rollout — October4, 01:31 Pacific

**402/402 full isolated tests pass**, **52/52 focused profile/badge/adapter/controller tests pass**, and **19/19 final policy/ranking/gallery checks pass**. Source syntax and scoped whitespace checks pass. The synthetic ten-icon preview was visually inspected; its additional future badges illustrate capacity and are not saved ownership. The gallery test was updated for the existing `🍬 Sweet!` flavor title without reverting the flavor edits.

One reload each: development PID28828/restarts30, production PID30112/restarts30; both online with fresh login evidence, PM2 saved. Both error logs are unchanged from the fresh baseline: production2,837,332 bytes/2026-10-04T06:59:30.824Z; development35,694 bytes/September8. Fresh Discord GETs confirm15 development commands with `/profile`, and13 production commands without it. Role lookup verifies production `BOTROLEID` is Bots and development is bots; configured `ADMINROLEID` is the server's Agent of Chaos role, with exact named Admin roles also recognized for the label.

Evidence: `artifacts/profile-development/revision-{full,focused,final-focused}.log`, `revision-{before,after}-processes.json`, `revision-scope.json`. No command definition deployment, database migration/replacement, participant action/reset/correction or merge. Normal startup maintenance remains active. The temporary legacy background copy was removed only after the new-path runtime was ready and its bytes matched the relocated original.
