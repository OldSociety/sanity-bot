The latest card revision and production exclusion rollout supersede the original activation evidence below; see [profile revisions](profile-revisions.md). /profile remains development-only.

# Profile cards — development testing

The S-2 renderer and command are integrated into the existing live checkout without switching branches or replacing the current config19 Spooky implementation. The independent `feature/S-2-profile` worktree is retained; no merge occurred.

Use `/profile` in the development server to show your card, or `/profile player:@member` to view another member. It sends a public PNG with avatar, per-level XP, Fate/Bank/Total and newest guild-owned badges. The command only reads player data. Automatic level-up cards are deferred.

`commands/Server/Profile.js` rejects any environment other than explicit `development`, missing configured guild IDs and interactions outside the configured development guild before loading models or the renderer. It is registered only in the development guild. `/user` keeps its original behavior. The shared runtime now has Sharp installed; production is not reloaded.

Registration uses a single-command POST after reviewing the development GET snapshot and a SHA-256 plan. Verification compares every other command's saved ID and full definition against a fresh GET, preserving `/game` and all existing commands. No bulk registry replacement or production registration is performed.

Evidence is stored in `artifacts/profile-development/`: reviewed registry plan, before/after registry snapshots, full isolated test results, and sanitized process/error-log baselines. Synthetic preview: `artifacts/profile-card-preview.png`.

## Activation verified — October 4, 2026

**396/396 full isolated tests pass**, including the production/wrong-guild rejection regression. Rendering, syntax and scoped whitespace checks pass. Reviewed plan hash `f4e29622eac4022fc0feb1e3454cf14d24541cf83d0eb9dd53b5d021bb1d068a` was applied once with a profile-only POST. Fresh GET confirms all 15 development commands, the new definition matches, and all 14 preexisting commands are unchanged.

Development reloaded once: PID30080, restarts28→29, online with a fresh login after startup at08:05:18Z. Production remains PID14600/restarts29 with its original startup time and no reload. Both error logs are unchanged from the fresh pre-reload baseline: development35,694 bytes/September8; production2,837,332 bytes/2026-10-04T06:59:30.824Z. PM2 saved. No migration, database replacement, player action/reset/correction, level-up change, branch switch or merge. Human `/profile` visual acceptance is the next step.

Human acceptance: run `/profile`, confirm your name/avatar and XP bar; compare balances with `/fate`; check newest badges and `/profile player` for a second member. Missing avatar or badge art uses a fallback. A new member's profile shows zero balances without creating/resetting their player row. Badge storage failure is labeled separately from an empty collection.
