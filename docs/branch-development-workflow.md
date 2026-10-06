# One-folder workflow

Both bots now run from `C:\Users\headm\code\sanity-bot-dev` on `main`. Edit, commit and review code in this folder. No separate production source folder or additional Git worktree is needed.

| Bot | Environment file | Database |
| --- | --- | --- |
| SB-development | `.env.development` | `config/dev.sqlite` |
| SB-production | `.env.production` | `config/prod.sqlite` |

Both use the same source and dependencies. Their credentials, guilds and saved data remain separate. Production's authoritative database was copied from its old deployment with every byte and table row verified; the retired root database was backed up first. Neither environment was reset. Credentials and databases remain ignored by Git.

Start both bots:

```powershell
pm2 start ecosystem.config.js
```

Start only one:

```powershell
pm2 start ecosystem.config.js --only SB-development
pm2 start ecosystem.config.js --only SB-production
```

After editing, restart whichever bot should load the changes:

```powershell
pm2 restart SB-development
pm2 restart SB-production
pm2 save
```

Use the explicit bot names instead of the old `--env` naming convention. Changes to shared source affect each bot when it next restarts; stop both before switching branches or replacing source during maintenance. Ordinary edits and restarts no longer need a production copy/deploy step. Keep exactly one running process for each bot name/database.

The old production source is archived under `C:\Users\headm\code\sanity-bot-backups\2026-10-06-runtime\main-consolidation\archived-production` solely for recovery. That folder is not an active runtime. Recovery copies now live outside the project; neither `.runtime` nor `.worktrees` remains in the project folder. Verified databases, credentials, source backups, the pre-merge Git bundle and PM2 configuration are retained alongside it. Restore only while both bots are stopped; never copy a database over an active writer.

Production still uses Fate/Bank for Spooky purchases, while development's configured Sanity purchases remain separate. Sanity tracking stays active in both. Community XP remains paused; this consolidation does not activate it or redo the personal XP reset/grace window.
