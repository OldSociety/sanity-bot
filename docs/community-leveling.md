# Community leveling foundation

Work begins on `feature/S-1-leveling` from merged main. The community system is disabled in development and production. No live migration, reload, command deployment or player correction is part of this implementation. The user's message ended after step 6's introduction; further requirements remain to be supplied.

## Locked launch rules

Normal Fate is 0–100. A reroll costs 10, spending Bank before normal Fate, including mixed payments. Community levels always require 300 XP, credit +5 normal Fate to every current campaign player and retain excess XP. Someone at 98 reaches 100; their Bank does not change. Participation is not required to receive the reward. Community state starts at level 1 with zero XP; existing personal XP and balances are not converted.

Any qualifying human chat message earns one Community XP if the user has not earned in the preceding 30 minutes, has earned fewer than 4 points that Pacific calendar day, and the guild has earned fewer than 24. The cooldown persists across midnight. Day boundaries use America/Los_Angeles, including daylight saving changes. There is no probabilistic roll. Spectators can contribute to public community chat but are not campaign reward recipients. Production excludes the Bots role; real bot/webhook/interaction messages never count, including in development.

Channels are explicit environment-specific allowlists in config/community-leveling.json. Public threads inherit an allowed parent; private threads and unlisted channels are excluded. Party, command, spam, counting, administrative and private channels must stay outside that list. Configured campaign roles identify recipients; excluded roles can identify inactive former players. A fresh complete paginated REST roster is resolved at each level, outside the transaction and connection queue. Missing roles or failed pagination abort the level attempt rather than awarding a partial roster.

## Storage and atomic rewards

The additive migration creates CommunityGuild (level and current XP), CommunityDay (server daily total), CommunityMember (member daily total and last earning timestamp), and CommunityReceipt (saved message results and all communal reward transitions). Guild/message identity prevents replay credit. One immediate SQLite transaction commits the earning, level transition, complete roster award and receipt together. All services share the existing wallet connection queue. Any failure rolls everything back; repeating the original message can finish the same attempt. Migration is explicit and is never invoked by chat or startup.

Existing Users.fate_points and Users.bank already store separate durable balances. They are retained. The new reward planner permits overflow into Bank only for explicitly exceptional rewards; communal rewards never use it. Existing birthdays, supporter credits and explicitly designated prizes already credit Bank. Its existing 100-point cap is retained because this request did not specify a new Bank cap. No existing balance is reset or rebased.

Once community leveling is enabled for an environment, personal XP/profile levels continue but personal level-ups stop awarding Fate in that guild. Spooky purchases in that environment switch to normal Fate only, including their confirmation quote, debit and help text. Rerolls always use Bank first. Existing normal-Fate shop purchases use the shared compare-and-swap wallet path so stale shop reads cannot overwrite communal awards. Until activation, the old Spooky and personal reward policies remain selected in both live environments.

## Keep the slash menu small

This feature adds no slash commands. Event metadata and configuration filter event commands from registration and runtime outside their windows. Spooky reads its existing approved event boundaries. Both /spooky and /spooky-admin retire at event end. Winter /throw and /slots remain hidden while no Winter event window has been configured; config/event-commands.json holds its explicit disabled schedule.

A startup/minute lifecycle worker deletes only this application's explicitly marked inactive event commands in its pinned guild. It leaves unrelated/server-only commands such as /game intact, retries failed deletions, and stops querying once that event's commands have been retired. Restart catches up an event that ended while the bot was offline. The dispatcher rejects expired commands even before Discord's menu updates. New event commands must declare an eventKey and an approved schedule; general commands retain their existing behavior. Existing administrative command default permissions remain intact.

## Checks and next rollout

Run `npm run test:leveling`, `npm test`, and `npm run leveling:rehearse`. Rehearsal creates only a disposable in-memory schema. Tests use isolated memory or temporary SQLite files and mocked Discord responses.

The user has now directed retaining existing role/channel eligibility as far as possible. The baseline below is configured and verified against actual Discord role/channel data. The rest of the truncated plan and any further community UI/announcement requirements can follow separately. During a backed-up, stopped-writer deployment window, apply migrations/community-leveling.js to the selected development database through its QueryInterface, verify existing wallets and new tables, and only then set that environment's enabled flag and reload development. Do not use sync/alter on live storage. Production remains a separate rollout; no production activation is implied here. Command cleanup needs a deployed/reloaded worker before it can remove live menu entries.

## Existing eligibility baseline

Keep the current Unwanted Fate eligibility role: development 1144411920766615574 and production 1262472426399469590. No extra campaign, spectator, booster or admin role is added as an alternative. No new inactive-role convention is invented; removing Unwanted removes communal reward eligibility, as with the existing Fate system. Bots exclusions and the development Bots-role exception remain in place.

| Environment | Existing shared channels retained |
| --- | --- |
| Development | fuckery, game-updates, maps, game-discussion forum, one-shot forum |
| Production | fuckery-table, chat-in-hell, fuckery-forums, activities, looking-for-game forum, introductions, troubleshooting, Meridian player-resources forum |

Public forum threads inherit their configured parent. Shared chat can be gated to verified/server-player roles without being a private party channel. The existing HELLBOUND command locations are also normal shared chat in these servers, so ordinary conversation there counts; slash commands and bot output do not. Bot-test-only, administration, archived/private channels and each party's Monday/Wednesday/Eos/Pathos/Revel chats remain unlisted. The production general-chat and general names identify Eos/Revel party spaces, rather than shared server chat. Spooky remains excluded as in the existing XP pipeline.

The old personal XP handler broadly accepted guild chat outside Spooky; it did not have a narrower shared-channel allowlist. Consequently this Community XP baseline preserves existing shared venues while applying the user's explicit exclusions for party/private/admin/bot-command-only channels. Existing personal XP channel behavior is not changed by this baseline.

Read-only evidence: artifacts/community-baseline-inspection.json (guilds, role names/IDs and channel role-view permissions, no tokens, member roster or message content). The inspector performs only role/channel GETs. Both community activation flags remain false; no migration, Discord registry write, role/channel write, bot reload or balance correction occurred.

Validation: 433/433 full tests passed (artifacts/leveling-final-full-tests.log). Final channel/expiry checks passed 6/6; subsequent wallet/legacy-balance checks passed 34/34, including the added above-cap preservation regression. The earlier integrated launch focus passed 33/33. In-memory migration rehearsal, config19 offline preflight and changed-source syntax/whitespace checks pass. Both community environment flags remain false. Live storage and Discord registries were not opened or changed for this task.
