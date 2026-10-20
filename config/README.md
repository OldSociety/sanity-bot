# Configuration guide

| Folder                      | Contents                                                                        |
| --------------------------- | ------------------------------------------------------------------------------- |
| [arena/](arena/README.md)   | Arena balance, testing, visuals, character builds, and Arena runtime state      |
| [spooky/](spooky/README.md) | Spooky game rules, pieces, GIFs, reminders, performance, spotlight, and winners |
| [badges/](badges/)          | Badge catalog and badge access settings                                         |
| [leveling/](leveling/)      | Personal/community leveling, Plot Points, and Fate overflow grace               |
| [commands/](commands/)      | Command availability and event command windows                                  |
| [sanity/](sanity/)          | Sanity settings                                                                 |
| [idle/](idle/)              | Idle combat balance                                                             |
| [database/](database/)      | Sequelize setup and environment database configuration                          |
| [runtime/](runtime/)        | Environment and credential-file selection                                       |

SQLite databases remain at `config/dev.sqlite` and `config/prod.sqlite`; historical backups remain in `config/backups/`. Credentials remain in the existing project-root environment files.

For Arena fighter HP, Attack, and abilities, start with [the character build guide](arena/characters/README.md). Character filenames follow `arena-<skin>-<character>.json`, for example `arena-hellfed-marq.json`. Template has its own file for unfinished builds.

Arena's mutable preferences, message leases, and production-access state live under `arena/state/` and are managed by the bot. The move preserves their contents and existing Git ignore rules.

Configuration files are loaded at startup. Restart the affected bot after an intentional settings edit; new Arena fights use the newly loaded stats. Development and production remain separate environments.
