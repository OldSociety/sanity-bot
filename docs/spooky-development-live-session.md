# Development startup evidence — 2026-10-02

The human explicitly authorized development migration, registration and PM2 startup, confirmed the bot stopped, and will perform hands-on testing in the second server. This supersedes earlier offline-only status. Branch remains `feature/S-1-spooky`; no production process/database/registry was changed. Hands-on player acceptance remains pending.

## Completed setup

- Confirmed no bot writer before apply; PM2 contained only stopped SB-production. Node processes were PM2/Codex helpers.
- Authoritative development target: app `1291847176569360476`, guild `684459745167671453` (Meridian Campaign Setting), bot-test channel `1076618367294771200`, config/dev.sqlite. Token matched the configured application; production guild differs.
- Required roles belong to that guild, curse/Sweet Tooth hierarchy is manageable, guild ManageRoles/ManageNicknames and channel ViewChannel/SendMessages/EmbedLinks/AttachFiles/ReadMessageHistory/ManageMessages pass. Portal GuildMembers/MessageContent/GuildPresences flags pass. Member-specific nickname/role eligibility still depends on the target.
- Existing database integrity ok and zero foreign-key violations. All four Spooky migrations were absent; applied atomically with tracking/provenance using reviewed hash `a393911a9b030172caef99f7625d98591b0c1938c08913b461b8467d085b78ca`. No adoption or destructive operation. Verified backup retained at `config/backups/spooky-01zi6l/dev.sqlite`. Post-apply classification complete; existing nontracking legacy table counts unchanged.
- Saved original live registry revealed `/game` absent from source. Preserved its definition instead of approving removal. Reviewed fourteen-command plan hash `cd0f70777baa58ec59e96ad6eb5ee7323357af11a01875afac96a9124dda1b64` removed nothing. One PUT registered the thirteen source definitions plus preserved /game. This checkout has no /game handler; preservation does not implement it. Future standard bulk plans still propose its removal and need explicit review.
- Discord's returned definitions omit empty options and false required/autocomplete defaults. Initial post-PUT verification reported mismatch; did NOT retry PUT. Corrected only those equivalent omissions in deploy-commands.js, added a regression, and inspected live GET: all thirteen desired definitions match; /game retained; fourteen total. Other supplied fields/true flags/nonempty lists remain strict.
- Enabled only development gameplay: JSON global enabled=false, developmentEnabled=true; selectEvent activates it exclusively for NODE_ENV=development. Production/test/unset retain disabled; v4/odds/resources unchanged. Reminder/winner/access settings remain disabled. Added isolation regression.
- ecosystem.config.js now pins cwd and supplies env_development. Started `pm2 start ecosystem.config.js --env development --only SB-development`; one SB-development online, SB-production stopped. Logged in as Sanity Bot [DEV]#8984 and first maintenance transaction committed successfully.
- Historical PM2 error log contains September 8 errors from a different `sanity-bot-dev - Copy` checkout. It was unchanged by this startup; do not misclassify them as fresh failures or erase logs.

## Evidence and changed files

Ignored local files: artifacts/spooky-live-storage-{status,plan,apply,after}.json; original/review/pre-PUT registry snapshots under artifacts/command-registry; session permissions/registry GET+verification/test logs and operational helper under artifacts/spooky-development-session. Backups/manifests live under config/backups. Never publish environment/token values. The operational helper preserves the exact inspected /game and uses the existing reviewed deployment service; it is a session artifact, not a new supported CLI.

Changed source: deploy-commands.js, services/spooky/config.js, config/spooky-2026.json, ecosystem.config.js; tests/command-deployment.test.js, tests/spooky-config.test.js, tests/command-registry-audit.test.js; .gitignore and current README/AGENTS/handoff/checklist/runbook. Focused eleven tests pass. First full run: 251/252, with one stale assertion requiring newly added commands relative to HEAD. Human implementation commit is now dd89501 (Spooky 2026), so the test now checks actual presence and preserved active commands regardless of commit status. No Git commit/reset/stash was performed by this setup. Final full-suite result is recorded in the current handoff after completion.

## Hands-on continuation

Final verification: **252/252 offline tests pass**; changed runtime/deployment/PM2 JavaScript syntax and scoped whitespace checks pass. Development PM2 startup and first maintenance succeeded; registered definitions verified by GET. Source test logs are retained under ignored artifacts/spooky-development-session. Full player acceptance is still pending.

Start in the configured bot-test channel with `/spooky welcome`, `/spooky register`, `/spooky status`, then a treat/trick. Use the private admin tools to inspect and prepare quarter/duplicate/badge cases following the [acceptance matrix](spooky-development-acceptance.md). Human users invoke slash commands; no player action/award/role effect was fabricated during setup. No live matrix row is complete merely because startup passed.

PM2 commands: `pm2 logs SB-development`, `pm2 stop SB-development`; restart after source/JSON updates with `pm2 restart ecosystem.config.js --env development --only SB-development`. Keep one writer; stop before any storage apply/backup declaring stopped. No pm2 save/global startup changes were made.

Development now runs maintenance and ordinary legacy XP/fate/holiday jobs. Disabling gameplay does not undo external effects and stops its cleanup scheduler; inspect/resolve effects before ending testing. No OS/live clock override, arbitrary outcome command or post-October redemption exists. Public-launch balance, six badge artworks, optional workers/access and remaining product enhancements stay open.
