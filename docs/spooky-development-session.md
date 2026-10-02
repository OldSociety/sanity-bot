# Spooky development session plan — 2026-10-02

This plan has now been executed through development startup under explicit human authorization; see [actual evidence](spooky-development-live-session.md). The original text below records the prepared sequence. Hands-on testing remains pending; development writer is now running.

This is the prepared live-session scope, not evidence that it ran. Work remains on `feature/S-1-spooky`. The last full suite passed 250/250; no source changes since that run. Final offline target/settings/deployment-target/preflight/full-registry checks pass. All flags remain disabled. No real database or Discord actions have occurred.

## Reviewed target and scope

- Development application: `1291847176569360476`.
- Development guild: `684459745167671453`; configured production guild is distinct.
- Database: `C:/Users/headm/code/sanity-bot-dev/config/dev.sqlite`, selected by authoritative `.env.development`.
- Gameplay channel: configured BOTTESTCHANNELID. Required curse/Sweet Tooth/Unwanted role IDs pass syntax; their actual guild and permissions remain unverified.
- Four additive migrations; thirteen active source command definitions, including seven Spooky and thirteen private Spooky admin subcommands. Registration is the introduction; separate welcome removed. No active local HEAD command is missing. Live-only commands require separate comparison.
- Core development correctness uses approved economy v4. No balance changes, production operations, reminders, final awards or badge emoji restrictions are included.

## Execution order

1. Obtain explicit live-session authorization and confirmation every development bot/database writer is stopped. The stopped-writer declaration is required for migration apply; do not infer it from offline checks. Preserve dirty source and all existing data.
2. Inspect development storage status and migration plan using the commands below. Review integrity, foreign keys, existing tables/tracking, pending migrations and plan hash. Unexpected schema blocks continuation. Matching untracked schemas require separately reviewed explicit adoption mode.
3. Apply the reviewed migration hash with writers stopped. The tool makes and verifies its exclusive backup before schema writes and commits all pending schema/tracking/provenance atomically. Retain backup and manifests; inspect status after apply.
4. Obtain the live command plan, review the saved snapshot and every proposed removal. Preserve unexplained live-only commands rather than approving their removal by default. Apply only the freshly reviewed hash, retain the pre-PUT snapshot and verify returned definitions. Ambiguous PUT failure requires inspection before retry.
5. Verify actual development guild, roles/channel, bot permissions and hierarchy. Check developer-portal privileged intents, including GuildMembers and MessageContent (startup also requests GuildPresences). Keep optional workers/access disabled.
6. Enable only gameplay for this authorized development session after storage/permissions gates pass, then start one development writer. The existing start command also runs legacy holiday/XP/fate behavior; observe it rather than assuming the Spooky flag controls it. JSON changes require restart.
7. With the administrator, two registered human test players and an unregistered member, follow the acceptance matrix: help/register/status, one-candy actions and visibility, automatic quarter/fate draw, duplicates/completion/badges, repairs, cancellation/restart recovery. Record interaction/operation/message IDs and before/after inspection, never tokens. Human testers invoke slash commands; a bot token cannot impersonate them.
8. Resolve/inspect external temporary effects before ending the session. Disabling gameplay stops maintenance too and does not undo roles/nicknames/messages. Retain tested storage and evidence; no automatic reset, restore or production deployment.

```powershell
node scripts/spooky-storage.js status --development
node scripts/spooky-storage.js plan --development
# Replace the placeholders with freshly reviewed hashes; never paste them literally.
node scripts/spooky-storage.js apply --development --confirm-stopped --plan-hash REVIEWED_STORAGE_SHA256
node scripts/spooky-storage.js status --development
npm run deploy:dev -- --plan
npm run deploy:dev -- --apply REVIEWED_REGISTRY_SHA256
# Only after the storage, configuration, permissions and one-writer gates above:
npm run start:dev
```

The commands above are live operations and have not been executed. See [acceptance matrix/recovery](spooky-development-acceptance.md), [storage contract](spooky-storage-tools.md) and [registry contract](command-registry-audit.md). No destructive restore/down command exists.

## Items that can remain deferred during core testing

Six badge artworks (generic medals render earned ownership), optional reminder/winner/access settings, public-launch balance decisions and prestige leaderboard/product enhancements. They remain open, not silently accepted or implemented by this session plan. Exact closure/rare outcome coverage already uses offline injected clocks/RNG; no live clock override is available.
