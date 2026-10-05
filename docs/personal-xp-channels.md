# Personal XP earning channels

October 5, 2026: the human restricted personal XP to three production channels. This configuration is independent of the paused Community XP channel list.

| Production earning channel | Verified ID |
| --- | --- |
| fuckery-table | 1259991510410334221 |
| fuckery-forums | 1282776842385752181 |
| chat-in-hell | 1262878387551342602 |

Public forum posts and public threads inherit an allowed parent. Private threads, voice chat, party channels, other channels and other guilds do not earn personal XP. The existing real-bot, production Bots-role, slash/webhook/interaction and Spooky exclusions remain. An excluded channel does not create a User or consume the XP cooldown. Channel filtering applies to personal XP/Fate earning only; seasonal processing, haiku and the separately configured development Sanity system retain their existing routing.

Fresh read-only Discord channel GETs verified these IDs, names and types. Development uses its actual text channel fuckery963830636467077181 and forum fuckeryforums1104077000647389194. It has no verified chat-in-hell counterpart, so no substitute or voice channel was added. Evidence is under ignored `.runtime/personal-xp-channels`.

The IDs are stored in `config/personal-leveling.json`. `services/personal-xp-channels.js` applies guild/channel/type checks before `applyChatMessage`. No XP rate, reward amount, level curve, cooldown or launch overflow dates are changed. This does not reset, deduct or retroactively adjust XP already saved before the routing change. No schema or command changes are needed.

## Live deployment and checks

502/502 full isolated tests and20/20 focused channel/message/economy checks pass. Coverage includes the exact production IDs, allowed public posts, private/voice/party/wrong-guild exclusion, development counterparts, excluded-channel User/cooldown preservation, and independent seasonal processing. The actual deployed production handler was additionally exercised in disposable memory, confirming allowed forum XP still awards personal Fate and the active capped-Fate Bank overflow notice.

Both named writers were stopped for fresh hash/integrity-verified exclusive backups under `.runtime/personal-xp-channels`. Only the personal-channel config/helper and a scoped production message-handler patch were deployed. Both databases remained byte-identical throughout deployment. Root development loads its corresponding committed helper/handler on restart. Production received no Community/Profile/Sanity imports or activation. No schema, registry, balances, XP correction/reset, or grace-window changes occurred.

After one named restart each, production PID20212 and development PID30212 are fresh Ready, with zero new error-log bytes. PM2 was saved. Source rollback copies, deployment hashes, channel GET evidence, database backups and before/after process verification remain under the ignored evidence directory. Existing untracked check-in design work was preserved; no main merge, push or worktree was created.