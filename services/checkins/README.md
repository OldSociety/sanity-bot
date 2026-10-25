# Check-in feature layout

```text
commands/CheckIn/
  CheckIn.js                     Role/channel-gated /check-in entry point
  CheckInTest.js                 Slash command definition and delegation
services/checkins/
  runtime.js                     Stable application entry point and worker setup
  application/controller.js      Questionnaire, authorization, review and delivery
  application/access.js          Fresh environment, channel, member and reviewer guards
  presentation/messages.js       Questions, buttons, receipts and decision messages
  storage/sqlite-store.js        SQLite schema, transactions and outgoing deliveries
  scheduling/calendar.js         Pacific dates, fortnightly windows and holiday skips
  scheduling/scheduler.js        Paginated role roster and opening/last-day notices
config/checkins/
  checkins.json                  Development/production scopes and destinations
  state/                         Ignored separate development and production databases
scripts/checkins/
  development-preflight.js       Read-only Discord access and permission checks
  development-register.js        Scoped development command plan/registration
  development-rollout.js         Rollout evidence, backup and verification
  production-preflight.js        Read-only production roles/channels/calendar check
  production-register.js         Scoped /check-in registration from a reviewed plan
  production-rollout.js          Stopped backup, activation and production verification
tests/
  checkins.test.js               Test entry point discovered by npm test
  checkins-scheduling.test.js     Calendar, role access and scheduler regressions
  checkins-backup.test.js         24-hour fallback, conditional deadlines and outage recovery
  checkins/fixture.js            Discord mocks and isolated test setup
  checkins/production-fixture.js  Synthetic production-role tests; no real server access
docs/
  checkin-design.md              Full planned Appy replacement design
  checkins-development.md        Active development test and acceptance instructions
  checkins-reminders-2026-10-25.md Current production behavior and activation evidence
  checkins-reminder-backup-2026-10-25.md Fallback policy and follow-up activation
```

`app.js`, the interaction dispatcher and slash command import `runtime.js`. Internal modules belong to the responsibility folders above. Operational tools belong in `scripts/checkins/`, rather than the scripts root. Keep configuration separate from generated state; never move or delete a live SQLite/WAL/SHM set during source cleanup.

The root test entry point is intentional: the existing `npm test` command selects `tests/*.test.js`. Command definitions also stay one directory below `commands/` to match the shared command loader. Do not deepen either entry point without updating and validating discovery.

Run focused verification with `NODE_ENV=test node --test --test-concurrency=1 tests/checkins.test.js tests/checkins-scheduling.test.js tests/checkins-backup.test.js`. On PowerShell, set `$env:NODE_ENV='test'` first. Operational commands use `node scripts/checkins/<environment>-<purpose>.js`; retain their explicit environment, plan-hash and stopped-writer requirements. Historical backups and rollout evidence keep their original paths.
