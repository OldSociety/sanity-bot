# Winter configuration

On the `snowball-fight` branch, edit [snowball-fight.json](snowball-fight.json) for the development replacement.
It holds collection, PvP, daily, encounter, shop and character settings. See the [replacement guide](../../services/winter/snowball-fight/README.md).
The folders below preserve the earlier Winter implementation and its studies.

| Folder | Purpose |
|---|---|
| [game/](game/README.md) | Current editable development game settings |
| [testing/](testing/) | Diagnostic starting-state fixtures; not free resources for ordinary players |
| [studies/](studies/) | Inputs for offline experiments |
| [legacy/](legacy/) | Older runtime rules retained for production compatibility |

Use `game/` only when investigating the preserved idle game. Historical dated reports and source snapshots are preserved elsewhere.

Player databases stay at `config/dev.sqlite` and `config/prod.sqlite`. Backups stay at `config/backups/`. No databases or credentials were moved.
