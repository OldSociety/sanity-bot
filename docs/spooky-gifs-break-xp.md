# Curse-breaking choices, GIFs and message XP — October 2, 2026

Config **13**, manifest **2**, on unmerged `feature/S-1-spooky`. The user approved extending the existing chooser to curse-breaking, excluding Spooky chat/bot commands from message XP, and occasional outcome GIFs using their supplied GIF map. Config-12 curse/shield/nickname behavior, quiet embed-only mentions and all economy odds remain unchanged.

## Behavior

Break-curse samples up to three eligible cursed members, including the caller if cursed. With two or more candidates, it shows the existing private **20-second** choice and frozen displayed random fallback. With one, it automatically frees that person without a chooser. With none, the legacy ordinary-gift fallback remains. Selected targets are revalidated in the paid root transaction: a vanished curse rolls back without spending candy or switching targets/gifts. Replay does not show buttons or reroll; role/nickname restoration remains durable and post-commit.

Message XP is excluded in the selected guild's **SPOOKYCHANNELID** and threads directly under it, throughout the year. The handler still runs haiku and seasonal curse processing there. Slash-command text (including leading whitespace), native chat/context command message types, interaction metadata, bot-authored messages and webhook output are excluded globally before progression. Ordinary chat outside the excluded channel retains the existing first-message seed, XP amount/cooldown and level/Fate behavior. This does not attempt to infer arbitrary other bots' unknown text-command prefixes. No saved XP is removed or rescored.

GIFs attach to the **first public gameplay embed** only when its image field is empty. Routine outcomes use **20%**; successful Great Heist, Sweet Tooth Crown, curse application/spread/backfire and curse-breaking (including goodwill) always use their mapped GIF when public. No-effect/permission fallbacks, private outcomes/screens/errors, Fate purchases and quarter/badge art do not gain GIFs. A no-cursed-target gift uses the routine gift policy. Existing visibility is preserved: personal backfires/losses that are private stay private and receive no GIF. Full images and thumbnails for token/badge reveals remain intact.

Selection uses separate SHA-256 chance/asset domains keyed by the original operation ID. It consumes no gameplay RNG and freezes the remote URL with the receipt/outbox, so replay/restart cannot change the chosen animation or reward. Pools are centralized in **config/spooky-gifs.json**, with 1–2 supplied GIF IDs per outcome. The supplied Great Heist link was a browse category rather than an individual GIF; its initial pool uses the supplied candy-thief skeleton. No nonexistent break-curse-backfire outcome is added, and register/status suggestions from the pasted document are not implemented.

Direct HTTPS media URLs are used in the embed image URL, rather than a GIF search/page link. Discord documents HTTP(S) image URLs in its [embed image structure](https://docs.discord.com/developers/resources/message#embed-object). All **20 unique GIF URLs** passed HTTP HEAD checks with status 200/image-gif; no files are downloaded and no live send was made for checking. Third-party media can disappear later; the game/economy continues independently of its visual availability.

## Changed files and validation

New config/spooky-gifs.json, services/spooky/gifs.js, tests/spooky-gifs.test.js and tests/message-xp-policy.test.js. Updated config/spooky-2026.json (13), services/spooky/config.js, playful.js, controller.js, target-choice.js and presentation.js; handlers/messageHandler.js preserves its earlier pipeline fixes while adding XP exclusions. Updated controller/playful regressions and README/AGENTS/handoff/rules/checklist. No command definitions, migrations, dependencies, admin access or stored player corrections.

Focused **52/52** and full **342/342** pass: zero/one/two/three break targets, saved replay/cost, stale target rollback, generic choice authorization/timeout, stable GIF chance/pool/visibility/art guards, Spooky thread exclusions and unchanged chat behavior. Eleven syntax checks, scoped whitespace, refreshed offline preflight/full registry/positive probes pass. Existing registries match:14 development including /game,13 production. No command registration or migrations were required.

Config 13 is live after one authorized reload per bot at **9:02 PM Pacific October 2**; PM2 saved. Production online PID 28360/restarts 7; development online PID 30664/restarts 20. Both error logs retain their September sizes/timestamps with no new startup errors. Evidence: artifacts/spooky-production-launch/gifs-break-xp-{focused,full}.log, gif-link-checks.json, gifs-break-xp-probes.json, gifs-break-xp-{before-processes,process-verification}.json, gifs-break-xp-*-reload.log and gifs-break-xp-pm2-save.log. Offline reports: docs/spooky-preflight-results.json and command-registry-audit-results.json. Exact next remains human acceptance below; no real game action was triggered by the agent.

## Exact next human checks

1. With one cursed member, verify immediate freeing; with two/three, select one or wait 20 seconds. Verify one candy is spent and the correct curse role/nickname is restored.
2. Send ordinary chat in Spooky and a Spooky thread; XP/Fate should not change, while cursed messages can still transform. Compare ordinary chat outside Spooky.
3. Observe occasional GIFs on ordinary public outcomes and consistent GIFs on public major wins. Verify token/badge artwork remains in place and private outcomes have no GIF.

Keep the branch unmerged, separate live databases, one writer and existing uncertain-delivery recovery. Both bots are live; no real purchase/action/reset/correction was performed by the agent, no automated monitor is scheduled, and no merge is authorized by this task.
