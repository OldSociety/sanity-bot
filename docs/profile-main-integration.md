# Profile cards on main

Profile-only integration from the live `feature/S-1-spooky` checkpoint `f5f361b` and the preserved `feature/S-2-profile` worktree. The Spooky gameplay feature remains unmerged. The running bots stay on their current checkout; this Git integration does not reload either bot or deploy slash commands.

`/profile [player]` is enabled only in explicit development and the configured development guild. Main's runtime and command registration also filter its development-only command metadata, so future production registry deployments omit it. The execution guard remains before any model/renderer imports. Production activation is a separate future decision.

The card uses the supplied `assets/profile-backgrounds/default/blackhole.png`, with blue/crimson accents, current/destination level, a progress bar without numeric XP, Fate/Bank/Total, an Admin-role label, and at most10 newest badges personally owned in the current guild. Server emoji provide art only for already-owned badges. The sample preview uses zero unlocks. Saved development test grants remain unchanged.

The profile includes the existing badge model/catalog/access helpers, runtime environment helper and connection queue/economy helper used by its read path. It does not include Spooky command registration, event configuration, migrations, action handlers, workers or rollout artifacts. Missing badge storage is handled as unavailable rather than creating tables or granting ownership. No database operation is part of this merge.

Run `npm run test:profile` for the isolated renderer, command, ownership-scoping and development-only regressions. Run `node scripts/profile-preview.js` for the generic offline preview. Existing unrelated main behavior is retained.

Background edits must be preserved: edit/export the active PNG directly or supply a new named asset. Do not overwrite the active image from an older attached source without explicit instruction.

Integration validation: 13/13 focused tests pass, both entry points pass Node syntax checks, and scoped Git whitespace checks pass.
