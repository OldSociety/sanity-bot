# Check-in configuration and state

`checkins.json` contains explicit environment scopes, production role IDs, reviewer IDs, command/review channels and the confirmed Pacific schedule. Production `liveEnabled`/`scheduledEnabled` are active after owner approval; development `testCommandEnabled` independently gates its owner-only test. The role exemption never applies to production.

`state/` holds separate ignored SQLite databases and their WAL/SHM companions. Keep generated state apart from editable configuration. Never delete it to retry a message or move a live SQLite/WAL/SHM set. Use a stopped-writer verified backup before storage/source activation.

Current behavior, channel/role IDs, schedule and evidence: [deployment guide](../../docs/checkins-reminders-2026-10-25.md). Remaining future work includes Discord configuration/recovery commands; JSON editing is not an authorization to reset or replay existing submissions.

`schedule.backupDelayHours: 24` enables next-day backup slots only for originals without a successful or ambiguous send. `extendForMissedLastDayReminder: true` grants affected recipients through the backup day's end, with the saved per-player extension and existing drafts preserved. See [the fallback policy](../../docs/checkins-reminder-backup-2026-10-25.md). Keep delivery state; deleting it can defeat duplicate suppression.
