# Development storage tools — Task 20b complete offline

Production launch authorized and completed from feature/S-1-spooky (unmerged). Read [production launch evidence and continuation](spooky-production-launch.md) first; it supersedes all historical production-disabled/no-live-operations statements below. Human development acceptance and five badge placeholders accepted. Production uses a verified preserved legacy-data copy at config/prod.sqlite, four backed-up atomic migrations and thirteen reviewed commands. Selene/Marq native emoji access is configured in both servers. Explicit productionEnabled=true; test/global default stays disabled, version 8/economy unchanged. Winner announcement: November 1 noon Pacific to SERVERANNOUNCEMENTSID with SCREAMSUPREMEID. Do not migrate/replace storage with online writers, reset production, merge or switch branches. Exact next is human live observation and scoped fixes; no automatic monitoring or merge was scheduled.


**Live development update (2026-10-02):** All four migrations are now applied to the authorized development target with verified backup; see [session evidence](spooky-development-live-session.md). SB-development is running, so stopped-writer commands require stopping it first. Prior no-real-storage statements below are historical. Production storage remains unchanged.

Work remains on `feature/S-1-spooky`. Status, backup, reviewed migration planning and apply/tracking are implemented and tested only on synthetic disposable storage. No real development/production database was opened, backed up, migrated or restored. Full Task 20 live acceptance remains open; event/reminder/winner flags are disabled.

Files: services/spooky/storage-tools.js, scripts/spooky-storage.js, tests/spooky-storage-tools.test.js and tests/spooky-storage-apply.test.js. The three existing migration up APIs accept an optional injected transaction; standalone use still works and DDL is unchanged. No dependency/gameplay version/odds changes. config/backups is ignored by Git.

## Reviewed interface

```powershell
node scripts/spooky-storage.js status --development
node scripts/spooky-storage.js backup --development --confirm-stopped
node scripts/spooky-storage.js plan --development
node scripts/spooky-storage.js apply --development --confirm-stopped --plan-hash <reviewed-64-character-hash>
```

These commands have not been run on real storage. For already matching schema without complete tracking/provenance, explicitly review `plan --development --adopt-matching`, then include `--adopt-matching` on apply using that plan's hash. Adoption records evidence for observed matching schema, not proof of its historical source. It never executes an existing migration again. No down/restore/target override command exists. Unknown/duplicate flags and inherited production/test/empty NODE_ENV fail; unset/development are accepted.

Target selection uses authoritative runtime/.env.development with distinct production guild, never inherited credentials/generic .env. Credentials are validated but omitted from reports. Existing config/dev.sqlite is required; missing files are not created. Linked directories/files/sidecars and dev/prod hardlink aliases are rejected. Branded frozen targets pin available filesystem identity and revalidate around inspection, backup and apply; replacement requires selecting/reviewing a new target. Only tests inject private fixture roots.

## Inventory and plan

Read-only transaction inventory compares fixed four-migration reference DDL/indexes/constraints from memory, reports all schema/counts, integrity/FK checks and source hashes without player rows. Classification: absent (eight seasonal tables and permanent BadgeOwnership absent), prefix (contiguous matching migrations), complete, or inconsistent (partial/changed/non-prefix/unexpected objects/reserved name collision). Equivalent differently expressed SQL conservatively requires review.

SequelizeMeta names are inspected only for the allowlisted migrations. SpookySchemaMigrations records source SHA-256, date, verified backup path and applied/adopted provenance; its metadata DDL must match exactly. These are runner metadata tables, not a fourth gameplay migration. Status/plan do not write tracking. Names alone lack historical hashes. Existing unrelated tracker entries/tables are retained.

Plans bind target application/guild/path, schema fingerprint, table counts, observed tracking/provenance, fixed migration hashes, adoption mode and precise pending/adopted lists into SHA-256. Partial/non-prefix schema, integrity/FK failure, incompatible metadata, tracker entries outside the matching prefix, duplicates or stale provenance block apply. Explicit adoption is required when matching schema lacks either name tracking or provenance; it cannot override mismatched provenance.

## Backup and atomic application

Stopped-writer confirmation is an operator declaration, not a process lease. Backups use readonly-source VACUUM INTO for committed WAL/main snapshot consistency, an exclusive generated config/backups/spooky-* directory, separate readonly integrity/FK/schema/count verification, repeated source inventory and an exclusive manifest with file hash. Source integrity/FK failure blocks allocation. Interrupted backup artifacts and failure.json remain for inspection; never reuse or overwrite outputs. Counts do not detect every value-only concurrent change: stop every writer.

Apply first validates current source hashes and reviewed plan. A changed/blocked plan fails before backup. A complete correctly tracked fresh plan is a no-op without creating a backup. Otherwise a verified backup is mandatory before opening the existing source READWRITE (without CREATE). Inside one EXCLUSIVE transaction, re-inventory and require the identical reviewed plan. All pending migration DDL, SequelizeMeta names and provenance records commit together. Optional transaction injection avoids nested migration transactions. Existing matching prefix is adopted only under explicit mode. Final schema/tracking/source checks run before commit.

An interrupted batch rolls back newly created schema/tracking together, preserves legacy/matching-prefix tables and retains the verified backup. Restart with a fresh inspected plan; never blindly rerun up or erase tracking. Concurrent reviewed runners cannot duplicate committed migrations; a stale runner fails review/revalidation. Keep writers stopped until inspection finishes. A process crash after commit but before reporting requires fresh status/plan, not an assumption that apply failed.

No destructive down/restore CLI exists. The [recovery runbook](spooky-development-acceptance.md) describes manual review and synthetic restore evidence; a real replacement needs explicit authorization, stopped connections, exact sidecar handling and preservation of displaced files. A database restore cannot retract Discord messages/roles.

## Evidence and continuation

18 storage tests (nine status/backup, nine apply) pass, full suite 202/202. Fresh/restart, explicit legacy adoption, stale plans/provenance, failures after DDL/before commit, prefix preservation, competing runners, WAL backup, source aliases and FK failures are covered. Rehearsal results were refreshed because migration wrapper source hashes changed. Offline scoped preflight passes 28 pieces, eight player/thirteen admin definitions and event boundaries; [saved results](spooky-preflight-results.json) explicitly list live gates. It opens no DB and reads no credentials.

Next: resolve balance and operational settings; review full legacy registry before bulk registration; then execute separately authorized real development acceptance. Audited backfill is complete offline; six badge artworks remain pending, no real storage/Discord operations occurred, Tasks 18/20 remain open. Read [handoff](spooky-handoff.md).


Current badge state: [permanent badge guide](badges.md) is authoritative. Task9a core and Selene first artwork implemented; 9b audited backfill is complete offline; six other badge artworks remain pending. New fourth migration creates permanent BadgeOwnership; guarded storage now requires all four groups for complete. Current disk/WAL rehearsal covers all four migrations and permanent ownership; older three-migration evidence is historical. New /badges view and /badges leaderboard share rendering with /user and level-ups; unowned = question mark, owned without emoji = medal, Selene resolves server emoji by name. Last full211/211; no real migrations, Discord registration or emoji verification. Keep all flags disabled. Offline full command registry review is complete. Exact next: resolve balance/server settings, then authorized live acceptance.
