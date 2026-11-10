# Snowball Fight replacement: initial repository audit

This audit describes the working tree on the `snowball-fight` branch before replacement implementation. Existing uncommitted changes were already present when the branch was created and must be preserved. This is an investigation, not an activation or migration.

## Entry points and retirement boundary

`commands/Winter/Snow.js` registers `/snow`; `services/winter/runtime.js` routes to the development playtest or the older runtime. `app.js` starts Winter maintenance at ready, and `events/InteractionCreate.js` routes `snow:` buttons to that runtime. The development playtest starts an interval in `services/winter/game/interactions.js`; its captures and `saved-progress.js` settlement can advance idle combat and production. The legacy `services/winter/live.js` worker ticks due battles, while `services/winter/economy.js` materializes elapsed production when actions execute. Replacing only the command would therefore leave mutation paths active. Both worker and interaction/settlement entry points must be retired for the replacement, with stale controls safely rejected. Preserve the old source and data for historical recovery and do not restart either deployed process as part of implementation.

## Data and transactions

The selected environment's SQLite connection comes from `config/database/sequelize.js`. The current playtest stores JSON state in `WinterPlaytestProfiles`, plus runs, sessions, interaction receipts, checkpoints, timings, permanent character unlocks and an outbox, created by `services/winter/game/saved-progress.js`. The older economy uses `WinterPlayers`, `WinterInteractions`, `WinterProgress`, `WinterShopProgress`, `WinterTutorialGifts`, `WinterKitchen`, `WinterRecipeDrafts`, `WinterBattles` and `WinterSlotJackpots`. These are historical data, not tables to repurpose or delete. The existing store uses the shared `serialize` helper and SQLite immediate transactions with interaction receipts; those patterns are appropriate for new feature-specific state and replay protection. Schema creation/migrations must be tested against isolated databases, including existing populated databases.

## Game and presentation

The current rules and idle progression are in `services/winter/game/game.js`, with configuration in `config/winter/game/`; screens, NPC dialogue and art are in `screens.js`, `screen-style.js` and related modules. The old economy and battle modules also contain idle-specific behavior. Their visual conventions and individual assets can inform new views, but the screens and control lifecycle are tightly coupled to idle state and timed captures, so directly reusing the whole runtime would retain unwanted behavior. `services/winter/game/buttons.js` manages private, expiring screens and assumes fights continue offline; it needs adaptation rather than wholesale reuse. Character badge art exists for five Classics under `assets/badges/Classic/`, including Hendrix, Kylax and Azulis; asset coverage for the full roster needs verification before activation.

`services/badges.js` and `BadgeOwnership` provide stable guild/user/badge ownership and transaction-aware awarding. The catalog and profile display must also recognize any new badge IDs. The generic achievement command is currently disabled. `services/achievement-preview.js` renders a sample using fetched emoji and fixed empty/half/full layouts; it is not a persistent achievement tracker or a general progress-bar helper. Adapt its established appearance with a suitable fallback and avoid assuming it provides progression or automatic awards.

## Daily, economy and testing

`commands/Daily/Daily.js` is commented out and listed as inactive by the command registry. A Monster Hunter daily implementation was not found in the searched current source; it must not be represented as reusable without locating it. Winter's legacy shop, recipes, shovels, gym and currencies depend on the retired economy, so their rules should not be imported into the replacement. Reuse the transaction and idempotency patterns, presentation conventions, and existing badge service where their contracts fit.

The repository uses Node's test runner and Sequelize/SQLite fixtures; `npm run test:winter` runs the existing Winter suite. Tests cover both the playtest and historical behavior. New isolated tests must exercise duplicate interactions, immediate transactions, restart persistence, quest claiming and worker retirement. Historical suites should remain as regression evidence rather than being rewritten to conceal removed behavior. Simulations must use a seeded random source and report their assumptions.

## Implementation implications

Create a separate, development-only command and feature store with server-scoped stable identifiers. Build collection, PvP, daily and character progression as explicit transactional actions, with a durable receipt for each interaction and no scheduled gameplay settlement. Preserve historical tables and assets. The new command's channel checks must include the configured bot-tests channel via `services/command-channels.js`; stale `/snow` entry points and maintenance must be disabled in development when the replacement is ready. Production command registration and reload require separate authorization. Do not expose subcommands until their complete behavior is tested.
