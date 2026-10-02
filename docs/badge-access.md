# Badge emoji access — individual native unlocks

User authorized implementing this if practical. It is practical for seven independent character badges: one dedicated cosmetic role per character, not one shared event role. Discord guild emoji roles grant access to any listed role; a shared event role would allow all its members to use the same emojis. SQLite remains the permanent ownership authority, and native Discord use is its role projection.

Official verification (2026-10-01): https://docs.discord.com/developers/resources/emoji documents guild emoji roles and Modify Guild Emoji, and https://docs.discord.com/developers/topics/permissions documents role hierarchy. Installed discord.js GuildEmoji.edit accepts roles/reason; GuildEmojiRoleManager.set delegates to edit. Server emoji role restrictions support this design; application emoji are not used for player picker access. Live client behavior remains a development acceptance check.

## Configuration and setup

New config/badge-access.json is enabled=false, with all seven explicit role IDs null. Null permits partial rollout (Selene first). Each configured role must be distinct, unmanaged, non-hoisted/non-mentionable, zero guild permissions, below the bot's highest role and absent from all channel permission overwrites. Never reuse event, curse, winner, subscriber, moderator or channel-access roles. Suggested names: Badge • Hadley / Hellfed Marq / Marq / Maxim / Niklaus / Qam / Selene. Non-hoisted means no separate member-list heading; these roles remain visible in member role lists.

During reviewed development setup, create dedicated roles, record IDs, and verify intended guild/bot/emoji configuration. With the bot stopped, use configureEmojiAccess on the verified guild with explicit enabled settings. It validates all target roles/emojis first and then edits each available configured badge emoji's allowlist to exactly its badge role plus this bot's dedicated managed role. Selene is the only currently named badge emoji. The bot role preserves embed rendering without granting collectors other badges. Requires ManageGuildExpressions to restrict this human-uploaded emoji and ManageRoles/bot hierarchy for member role projection.

Setup intentionally replaces a formerly unrestricted emoji's access list; no broad event/Patreon/public role is added. Other existing emoji are untouched. Setup is an explicit exported service operation, not a login/provisioning CLI, startup side effect or player command. No automatic role creation, emoji upload or live restriction occurred. Multi-emoji REST setup can partially succeed on API error; inspect actual restrictions and retry reviewed settings, do not claim atomic external configuration. Save previous emoji allowlists before real setup.

## Role reconciliation

createBadgeAccess reconciles current ownership against freshly fetched member/bot/roles/channels. Validate every configured role before any membership writes; only dedicated configured roles can add/remove. Owning a badge adds its role if missing; an unowned configured badge role is removed. Manual role additions are not permanent ownership. Bot members are skipped. Transient errors leave SQLite ownership unchanged and are retryable; fresh desired state makes a crash after a successful role add safe to retry. Changes have Discord audit reasons.

Gameplay controller invokes projection after the economy commit, including replays. Shared profile/badge-view/level-up rendering and /badges leaderboard invoke it year-round. A failed projection is logged and does not roll back quarters/badges or block rendering. Disabled settings make no ownership query, Discord fetch or role write. Guild scope checks still apply. No new DB table/migration needed; BadgeOwnership already supplies durable desired state.

No periodic access worker/member-join hook is implemented: rejoining/retry reconcile on the next badge/profile/leaderboard view or level-up; gameplay awards reconcile immediately. Separate reconstructed render helpers do not share a global role queue; desired adds/removes are idempotent but live use is one bot process, with ownership monotonic under current service. No automatic retry loop or destructive badge revoke/reset.

## Validation and next steps

Four new mocked tests cover disabled no-I/O, exact separate roles, guild scope, ownership/replay/removal, transient failure retry, permissions and channel-overwrite rejection, and collector-plus-bot emoji restriction with invalid setup making no edit. Focused16/16; final full count is recorded in README/handoff. No live Discord calls were made.

New services/badge-access.js, config/badge-access.json, tests/badge-access.test.js and this guide. Changed badgeField, badge command, Spooky controller/runtime and preflight. Existing badge storage/ledger, config version4, gameplay math/dependencies and other legacy features remain unchanged. Update runtime JSON requires restart.

Next: obtain/create dedicated development roles and record IDs; configure only the supplied Selene emoji first with previous allowlist recorded; test collector/non-collector/bot in live messages and leaderboard embeds, failure/restart/rejoin recovery. Keep access disabled until setup is complete. Task9b is complete offline; six artwork names, permanent disk recovery and full development acceptance remain pending. Production changes still need an explicit release request.

Task9b update: admin quarter grants and recomputes now invoke ownership-based role reconciliation after commit, including replays. No live role changes occur while access is disabled. Audited per-player backfill is complete offline; permanent disk recovery is complete offline; full command registry review is complete offline; launch settings and balance decisions are next.
