# Branch development and independent production runtime

The profile/leveling worktree was closed October 4, 2026 at the user's request. Open `C:\Users\headm\code\sanity-bot-dev` in your editor. It currently checks out `feature/S-1-leveling`; unfinished profile/Sanity changes remain available as working changes. Production is an independent deployment, not another Git worktree.

| Bot | Source folder | Database |
| --- | --- | --- |
| SB-development | Main repository folder | `config/dev.sqlite` |
| SB-production | `.runtime/production` | `.runtime/production/config/prod.sqlite` |

Production has its own dependency copy and credentials. Its development environment file contains only the comparison guild ID, without development credentials. `.runtime` is ignored by Git and survives branch switches. Do not edit or delete this directory. The original `config/prod.sqlite` is now a retired pre-cutover copy, not the live production database. Production runtime resolution in this feature checkout points production tools to the independent deployment. No migration or player reset accompanied this relocation.

## Everyday development

Use normal `git status`, `git add`, `git commit` and `git push` in the main folder. No separate worktree folder is needed. Changes saved there are the files development loads on restart:

```powershell
pm2 restart SB-development
```

Commit or stash unfinished work before switching branches. Stop development while switching branches that change its runtime code, then restart it when the intended branch is checked out:

```powershell
pm2 stop SB-development
git switch <branch>
pm2 restart SB-development
```

Stopping before a switch prevents the running bot from loading a mixture of files from different branches. Production continues independently.

## Production

```powershell
pm2 restart SB-production
```

This restarts the deployed snapshot. Committing, switching or merging development branches does not deploy new production code. A future production update requires a deliberate deployment into its runtime folder with appropriate checks; keep its live database intact and maintain one writer. Do not run the root `app.js` with production credentials or reuse historical worktree PM2 configs. The current feature's ecosystem configuration routes `--env production` into the independent deployment; saved named PM2 restarts are the normal workflow across branches.

## Preservation and rollback evidence

`.runtime/transition` contains a Git bundle of pre-transition branches, patches, a verified copy/hash manifest of 731 feature files, a retained Git stash reference, the prior PM2 dump, and verified stopped-writer backups of both databases. Stash restoration encountered only the three badge files already incorporated from main; their contents were preserved. Main's recent badge moves and Spooky wording changes were merged into the feature branch; its outdated title assertions were updated to match the edited text.

Production was prepared from main commit `6713652`, including the approved badge resolver updates. Production dependencies exclude the repository's self-referencing `node_modules/sanity-bot` junction; the accidental recursive copy was removed. Both SQLite integrity and foreign-key checks passed, with byte/content-identical production copy at cutover. Development storage stayed in place. No commands, credentials, balances or event settings were changed by the relocation.

PM2 entries were recreated to guarantee their new script/cwd paths, so restart counters begin again at zero. Production PID 28752 and development PID 12904 were online/Ready after relocation. Error-log sizes matched the fresh baseline, and PM2 was saved. `git worktree list` now contains only the main repository. Operational scripts and sanitized verification artifacts are in `.runtime/transition`.

Final verification: 460/460 development tests, 40/40 production runtime checks and 26/26 final routing/flavor/profile checks pass. Both named processes remained online/Ready with unchanged fresh error-log sizes after worktree removal. Feature file preservation comparison differed only for the intended branch integration/operational changes and the two badge files deliberately moved into their Spooky folder.
