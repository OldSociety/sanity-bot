# Profile occasions and development Sanity

## Current location after worktree closure

Development now runs from the primary repository on `feature/S-1-leveling`; production runs from an independent `.runtime/production` deployment. The old worktree is removed. Its unfinished feature changes and evidence were preserved in the primary checkout. Use `pm2 restart SB-development` after editing there. Historical worktree paths and runtime-root overrides below no longer describe the current startup. See [branch workflow](branch-development-workflow.md).

## Latest daily Sanity rollout — October 4, 2026

Version 2 daily-presence rules are live in development: +2 once per active Pacific day, +1 once for two qualifying messages thirty minutes apart across any qualifying shared channels, −1 per completed inactive day, gain cap 3 and balance cap 100. Starting balance remains 50; actual Fate level-up rewards are unchanged. The user explicitly chose both private nudges on the next bot interaction and two-message conversation spacing. One rolling seven-day cooldown covers all warning bands and the special first-zero notification.

458/458 full tests, 45/45 daily/profile/purchase focus, and final 2/2 reminder safeguards pass. Visual inspection confirms all five bands. The development writer was stopped before verified backup `config/backups/sanity-daily-1791163963728/dev.sqlite`; additive migration created SanityDay/SanityDailyState and seeded cutover state. All preexisting table contents/balances matched hashes before/after migration. No backdated losses, reset, rescore or player award was performed.

Development is ready on PID10248/restarts1 from the same feature checkout and authoritative primary development storage. The final user-confirmed cross-channel definition passed 11/11 daily/reminder tests and required one further scoped development reload. Fresh error bytes did not increase; production remains PID11728/restarts32 and unchanged. PM2 saved. No command registration was needed for this update. Evidence: `artifacts/sanity-daily-*` and `artifacts/profile-development-rollout/daily-*`. This section supersedes prior process IDs and version-1 rules below.

Implementation on `feature/S-1-leveling`, isolated in `.worktrees/leveling-profile`. User-authorized development activation is complete on October 4, 2026. Production remains on the primary checkout, with its unrelated Spooky edits preserved.

## Live development rollout

`SB-development` is online/logged in from this feature checkout (PID 14208, new PM2 entry ID 2/restart counter 0). It uses the original `config/dev.sqlite` and authoritative development environment via `SANITY_DEVELOPMENT_RUNTIME_ROOT=C:\Users\headm\code\sanity-bot-dev`; no database copy or second writer is used. Production remains PID 11728/restarts 32 on the primary checkout. Fresh error-log bytes did not increase in either bot.

The development writer was stopped; verified backup is `config/backups/profile-sanity-1791157063242/dev.sqlite`. SQLite integrity and foreign-key checks passed. Explicit additive Sanity migration created two empty tables. Hashes of all preexisting table contents matched before/after migration. No manual player, wallet or badge correction occurred. Normal startup maintenance remains active.

Targeted Profile and Spooky guild command updates were reviewed and GET-verified; unrelated commands, including `/game`, were preserved. Existing expiry cleanup removed inactive Winter commands (`throw`, `slots`); the resulting development registry has thirteen commands. `/profile view`, `/profile birthday`, `/profile level`, and `/spooky buy-quarter` are present. Production registry/storage were not changed. PM2 process list was saved.

Operational evidence is under `artifacts/profile-development-rollout`. The first PM2 restart retained the main script path; that development process was stopped and its entry replaced before starting the correct checkout. The initial backup attempt encountered an incompatible unused better-sqlite3 native module; no data was changed, and backup/migration proceeded with the existing working sqlite3 adapter. No dependency rebuild/install occurred.

Keep this worktree in place while development runs from it. For later scoped development updates, use `pm2 restart SB-development`; do not point it back to the primary ecosystem file unintentionally. Do not archive this checkout or run another development writer. Production and Community XP activation remain unchanged. Next is human Discord testing of regular/birthday/level previews and Sanity purchase/earning behavior.

## Full-start development rollout — October 4

Version 3 is live in development from this same worktree. Full regression suite: 460/460. Synthetic default profile was regenerated and visually checked at Sanity 100. Development writer was stopped for the verified backup `config/backups/sanity-full-start-1791166239056/dev.sqlite`. Two human development members now have 100 Sanity (one existing account refilled, one seeded). Durable per-user `baseline:v3` receipts prevent repeat resets. Existing daily activity markers are preserved; inactive-day tracking starts at cutover without retroactive losses. All tables outside SanityAccount/SanityDailyState/SanityReceipt matched their pre-change hashes; integrity and foreign-key checks passed.

Development restarted once and is online/Ready, PID 17600. Production PID 11728/restarts 32 is unchanged. Both error-log sizes match the fresh baseline. PM2 saved. No command definitions changed. Evidence: `artifacts/profile-development-rollout/full-start-*` and `artifacts/sanity-full-start-full.log`. No real reminder was sent during rollout; human DM testing remains available on qualifying chat with an eligible balance, without an additional visible testing command.

## Cards

Development-only automatic cards use the existing profile design, background and owned badge lookup (up to ten recent earned badges). Level-ups show a LEVEL UP banner and the actual old/new level. Birthdays show HAPPY BIRTHDAY. Fate, Bank and total display arrows only when their saved before/after values differ; capped rewards never claim an unavailable increment. Birthday Bank snapshots are captured around the atomic reward in one transaction. Ordinary `/profile` continues to display current balances.

The regular card is `/profile view [player]`, with the player name as its main heading. Birthday and level-up cards have large bold HAPPY BIRTHDAY! / LEVEL UP! headings, with the player's name beneath. Discord requires a subcommand for the regular view once preview subcommands exist. `/profile birthday` and `/profile level` are private development-only visual previews of the caller, using owned badges and saved balances. They simulate a capped +10 birthday Bank reward or the next level in memory, never award anything, create Sanity accounts, or settle Sanity decay. Each response is explicitly labeled as a visual preview.

Preview-command validation: 21/21 profile checks and 450/450 full-suite checks pass; syntax, offline full-registry review and whitespace checks pass. Subsequent environment-routing/reminder/profile checks pass 29/29. All three rendered layouts were inspected. Live rollout evidence above supersedes the earlier offline-only state.

The existing upper-right black hole is the only Sanity indicator. `SANITY 72 — STEADY` sits beneath it; the separate tentacled and pixel icons have been removed. Sanity remains separate from Fate and Bank, not part of Total Available Fate.

The exact landscape PNG is preserved. Transparent SVG/PNG UI overlays in `assets/sanity/blackhole-*` align at left 924/top 18 on the 1200×480 card, centered at 1044/82. Their halo/iris changes layer onto the original eye without re-generating the landscape. High Sanity preserves its dark interior with a faint halo. 70–100 Steady, 50–69 Fading, 25–49 Fraying, 1–24 Waning, exactly zero Lost; lower states progressively open, distort and glow crimson. Labels and overlays use the same normalized thresholds. No separate orb or pixel-art style remains in the renderer.

The base still contains the original eye; these overlays are a deterministic, non-destructive UI implementation. A future artist-exported clean background and painted cutouts can replace the overlays while retaining their fixed placement. Other seasonal backgrounds will need the matching eye placement/artwork before use.

Background-eye verification: exact boundary checks, transparent overlay dimensions/alpha, visual inspection of all five states, and a pixel comparison confirming that changing Sanity does not alter the landscape or wallet area below the eye. The original landscape PNG has no Git diff. No deployment or currency-rule change accompanies this visual update.

Offline, synthetic previews: `node scripts/profile-occasion-preview.js`. Output: `artifacts/profile-occasions`. Example balances and generic avatar are illustrative; no badges or balances are awarded by this script.

## Approved development economy

`config/sanity.json` version 3: enabled only when NODE_ENV is development. Production and tests do not inherit activation. Accounts start at 100, capacity 100. The approved full-start cutover also refills existing development accounts and seeds current human guild members, with durable baseline receipts. Existing qualifying shared chat channels and member exclusion rules are retained; this is independent of Community XP and personal XP.

The first qualifying message in a Pacific calendar day establishes presence and earns +2 once. A second qualifying message at least thirty minutes later that day, in any qualifying shared channel, establishes sustained conversation and earns +1 once. Further messages earn nothing and create no new Sanity write/receipt. Gains are capped at +3/day and 100 overall. Rewards forfeited at the cap cannot be reclaimed after a purchase later that day.

Each completed inactive calendar day loses exactly 1. Active days have no loss. The five-minutes-after-Pacific-midnight worker settles existing accounts; startup/profile/purchase reads catch up missed days exactly once. Calendar dates, rather than elapsed 24-hour ticks, preserve DST and midnight behavior. There is no 48-hour grace under this revised rule. The additive `migrations/sanity-daily.js` preserves all existing account/receipt rows and balances, starts tracking at cutover, and honors today's old credits toward the new cap without backdated losses.

Eye/label bands: 70–100 Steady, 50–69 Fading, 25–49 Fraying, 1–24 Waning, 0 Lost. At 69 or below the next qualifying chat post triggers a private DM nudge, at most once per rolling seven days. It snapshots settled Sanity before crediting that post. State changes never generate extra notifications. No public fallback or mention ping is sent. Bot commands and birthday/level previews never trigger nudges. At zero, one special lifetime nudge shares the weekly cooldown. Claims reserve the cooldown durably before sending; failed or uncertain delivery consumes it. Closed DMs never prevent activity credit. Player messages omit recovery formulas. See [communication research and copy](sanity-communication.md).

Development Spooky replaces `spend-fate` with `buy-quarter` on the existing `/spooky` command, costing ten Sanity. It retains the private Confirm/Cancel flow, earned collection rules and paid quarter rarity distribution. Sanity debit, award and root receipt commit together; stale quotes reject, replays debit once, and failures roll everything back. No extra top-level command is introduced. Production retains its current Fate payment policy and command name. Existing event command expiry remains in effect.

## Deployment requirements

Do not start this checkout directly without its development runtime-root override: it contains no environment file or live storage. The completed rollout uses the existing primary configuration/storage directory, a stopped-writer verified backup, explicit additive Sanity migration and reviewed development-only command updates. Do not rerun the migration, migrate production, replace either live database, or start a second writer. Community XP activation remains governed by its existing disabled configuration.

Tests use disposable SQLite connections only. The separately authorized version-3 development baseline sets Sanity to 100; Fate, Bank, badges, Spooky data and production remain unchanged.

Validation: full suite 446/446 before the last two added regressions; final affected profile/confirmation checks 9/9. Earlier Sanity/profile/Spooky purchase focused checks 49/49. Offline Spooky preflight, full command registry audit, changed JavaScript syntax and whitespace checks pass. Actual environment-selected definition probes confirm development Sanity with seven subcommands and production's existing Fate policy. Evidence is in `artifacts/profile-sanity-*`.
