# Profile background, palette and ownership-only preview

The supplied `blackhole.png` is now the default at `assets/profile-backgrounds/default/blackhole.png`, copied unchanged. Source and destination SHA-256 match: `DC476EA2EC2F280874EC6B420DABA8071464EEF4A0CEFD25AA94CD4080AD8A10`.

The card uses the image's navy/blue and crimson palette: slate-blue borders/avatar ring, blue-to-crimson progress bar, blue-gray labels and an overlay that retains the landscape. Lavender and peach accents are removed. The destination-level label, current level and role-derived ADMIN label remain.

Live card ownership was already scoped to the selected member and current guild through `BadgeOwnership`. Available server emoji supply images only after an owned badge is selected; they do not grant or add badges. The ten-icon synthetic capacity preview misleadingly supplied invented badges, so it has been replaced by a generic zero-unlock example with no filler circles. The card shows at most10 actual owned unlocks; empty ownership says “No badges unlocked yet.” Unavailable ownership storage still has its separate error message.

The development owner's two prior admin test grants remain saved; no ownership/player data was changed. This presentation task does not reset them. Other members' badges and ownership in other guilds are excluded.

Validation: **12/12 profile renderer/command tests pass**, including a new memory-database regression with selected-member, other-member and other-guild ownership plus available server emoji. Rendering, syntax and scoped whitespace checks pass; the new PNG was visually inspected. No economy, XP formula, command definition or production feature change.

Evidence: `artifacts/profile-development/palette-tests.log`, `palette-{before,after}-processes.json`; current zero-unlock preview: `artifacts/profile-card-preview.png`. Only the development bot is reloaded; `/profile` stays development-only. The isolated `feature/S-2-profile` renderer, preview and supplied asset are synchronized without a merge or branch switch.

Rollout verified October4,11:51 Pacific: development reloaded once, PID5440/restarts32, online with a fresh login. Production remains PID11728/restarts32 with its original startup time. Both fresh error baselines are unchanged: production2,838,531 bytes/18:09:50Z; development35,834 bytes/18:11:28Z, October4. PM2 saved. No command registration or database migration/reset/correction.
