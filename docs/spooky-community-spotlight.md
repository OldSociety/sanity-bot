# Community Spotlight

Config21 adds a Community Spotlight every four days at noon America/Los_Angeles, beginning October5,2026. Initial order is Hadley → Selene → Marq, repeating until another completed design is appended. Scheduled dates start October5/9/13/17/21/25/29. The event closes November1; no spotlight posts or boost survive closure.

Edit `config/spooky-spotlight.json` to append character IDs in artwork completion order. Add the finished PNG under `assets/badges/Spooky` and its `imageAsset` mapping in `config/badges.json` first. Reordering/removing an established rotation is rejected. Deploy reviewed config/artwork to the independent production runtime and restart the named bots; a branch edit alone does not update production.

The embed says **Community Spotlight**, names the character, uses their finished badge as its thumbnail, and explicitly mentions only the selected server’s existing Unwanted role. It posts in the existing Spooky channel through the startup/minute maintenance worker. No command definitions change.

Each unowned featured quarter gets a relative **1.25× selection weight**, after the existing rarity weights are apportioned across missing quarters and before final normalization. Both Eye-generated and purchased quarters use the boost. This modestly changes the resulting rarity mix; it does not alter the 13% Eye-find chance, candy, cost, balances, duplicate policy, or Crown odds. Fully owned featured characters leave the ordinary draw unchanged. Two gameplay RNG calls remain per quarter.

Guild-scoped companion Operation receipts freeze each active character inside the same economy transaction as the first draw or announcement. Adding artwork cannot rewrite an active spotlight. Announcement receipts/outbox separately freeze the payload and prevent repeats across restarts. Downtime posts only the currently applicable spotlight; old pending slots are cancelled. Ambiguous delivery requires inspection and never automatically resends. Existing pause/archive and event boundary guards remain in force. No schema changes, migrations, resets, or historical draw rewrites.

Production keeps its Fate payment behavior and existing independent database. Profile/Sanity code stays development-only. Deployment evidence and stopped-writer verified backup live in ignored `.runtime/spooky-spotlight`.

Verified October5 before the first scheduled noon: 474/474 full tests, 7/7 focused spotlight tests, source syntax/whitespace, offline Spooky preflight and unchanged command registry pass. Both bots restarted once and are Ready, with no new error-log bytes; PM2 saved. Read-only Discord checks confirmed the correct guild channels, artwork/embed permissions, Unwanted role and permission to ping it in both environments. No spotlight announcement exists yet because noon has not arrived. Production source deployment preserved every database byte and its Fate configuration, with a verified stopped-writer backup.
