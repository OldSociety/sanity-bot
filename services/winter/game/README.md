# Editing the current Winter game

Start with the thing you want to change:

| I want to change… | Open… |
|---|---|
| HP, damage, prices, generation rates, attack intervals | [config/winter/game/balance.json](../../../config/winter/game/balance.json) |
| Emporium prices or clothing bonuses | [config/winter/game/emporium.json](../../../config/winter/game/emporium.json) |
| S4's preceding-victory requirement | [config/winter/game/snowman-4.json](../../../config/winter/game/snowman-4.json) |
| Buttons and the Snowman selection screen | [snowman-selection.js](snowman-selection.js), [screens.js](screens.js) |
| NPC dialogue, portraits and page layout | [screen-style.js](screen-style.js) |
| Hendrix's rotating Gym lines | [dialogue.js](dialogue.js) |
| Brown supply, damage, hidden recipe and its seven clues | [brown-snowballs.js](brown-snowballs.js) |
| Fishing and donations | [pond.js](pond.js) |
| Secret character name or placeholder art | [characters.js](characters.js) |
| Purchase rules, resources, combat and training | [game.js](game.js) |
| Chapter availability and the player's next-goal guidance | [progression.js](progression.js) |
| Required tutorial steps | [tutorial.js](tutorial.js) |
| What players have discovered and can see | [discoveries.js](discoveries.js) |
| Diagnostic recap text | [recaps.js](recaps.js) |
| Saved player state, transactions and permanent discoveries | [saved-progress.js](saved-progress.js) |
| Discord interaction handling, live screens and stale buttons | [interactions.js](interactions.js), [buttons.js](buttons.js) |

`game.js` applies the rules. `screens.js` builds controls and basic page data; `screen-style.js` supplies the existing character artwork, dialogue and final layout. The split is explicit because older artwork/presentation is still reused; there is no second current gameplay engine hiding behind the old filename.

**Settings and saves are different things.** Edit rules under `config/winter/game/`. Keep test starting balances under `config/winter/testing/`. Do not edit SQLite player rows to change game balance. Internal table names and old fingerprint IDs are retained for save compatibility, not used as the folder layout.

Run `npm run test:winter` after changes. Bot processes load code/settings at startup; source edits do not hot-reload the running bot. Use a fresh screen after a separately authorized restart. Production has separate runtime/configuration and must not be assumed to match development.

Unknown future snowmen and Yellow/Necro mechanics remain unimplemented until their values and behavior are supplied. The layout supports growth without making those features usable prematurely.
