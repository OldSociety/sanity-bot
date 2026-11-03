# Winter Wars: start here

The current development game lives in **[game/](game/README.md)**. Its editable numbers live in **[config/winter/game/](../../config/winter/game/README.md)**.

This follows the project's original feature-folder approach: commands stay in `commands/Winter/`, game files stay together, and files use ordinary names such as `game.js`, `screens.js`, `pond.js` and `dialogue.js`.

| Area | What it is |
|---|---|
| [game/](game/README.md) | Current gameplay, pages, dialogue, saves and development interaction handling |
| [studies/](studies/README.md) | Offline experiments and simulations; not the live game |
| [balance.js](balance.js), [snowman-scaling.js](snowman-scaling.js) | Small arithmetic helpers shared by the game and studies |
| `runtime.js`, `economy.js`, `battle.js`, `presentation.js`, `gym.js`, `tutorial.js`, `slots.js` | Older runtime retained for production compatibility; not where new development gameplay should be edited |
| `recipes.js`, `numbers.js`, `shovels.js`, `opponents.js` | Older/shared definitions; the current game's secret recipe is in `game/brown-snowballs.js` |

The stable command entry is [commands/Winter/Snow.js](../../commands/Winter/Snow.js). It calls `runtime.js`, which selects the current development game only in its configured environment. Production activation remains a separate decision.

For the player journey, see the [current Winter guide](../../docs/winter-guide.md). For isolated checks, run `npm run test:winter`. This does not connect to Discord or intentionally open a live player database.

Historical reports and frozen source copies remain in `docs/`, `artifacts/` and `config/backups/`. They describe their own versions. The current game is not a dated report file.
