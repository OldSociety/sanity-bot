# Winter scripts

Current gameplay is in `services/winter/game/`, not in this folder.

- Run `npm run test:winter` for isolated game checks.
- `playtest-rollout.js` is the existing development-only activation/backup tool. Its filename is retained for operational compatibility; do not run it as a balance experiment.
- `playtest-rehearsal.js` walks a source-engine purchase policy without Discord.
- The other progression, weapon, calendar and audit scripts are offline studies. Read each script's header and its matching report before rerunning it. Several use historical policy assumptions and are not current balance forecasts.

Study engines are grouped in `services/winter/studies/`, and their configuration is in `config/winter/studies/`. Frozen report inputs under `artifacts/` were not rewritten during the organization audit. Production registration and reload remain separate actions.
