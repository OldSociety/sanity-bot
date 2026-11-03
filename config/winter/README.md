# Winter configuration

| Folder | Purpose |
|---|---|
| [game/](game/README.md) | Current editable development game settings |
| [testing/](testing/) | Diagnostic starting-state fixtures; not free resources for ordinary players |
| [studies/](studies/) | Inputs for offline experiments |
| [legacy/](legacy/) | Older runtime rules retained for production compatibility |

Start in `game/` when you want to tune the game. Historical dated reports and source snapshots are preserved elsewhere; there is one current editing location.

Player databases stay at `config/dev.sqlite` and `config/prod.sqlite`. Backups stay at `config/backups/`. No databases or credentials were moved.
