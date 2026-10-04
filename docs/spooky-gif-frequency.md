# Quieter, varied GIFs — October 2, 2026

Config 15 on unmerged feature/S-1-spooky. The human requested approximately one GIF per ten results, broader Buffy/pop-culture variety and fewer repeated animations during 25-candy batches. Slots implementation/decision is held until Monday October 5; no automatic reminder or monitoring is scheduled. Previously approved refill/overflow changes remain unimplemented; no economy change is part of this task.

## Current behavior

All eligible public trick/treat outcomes use a 10% cosmetic roll, including significant successes. This supersedes the earlier 20% routine / always-significant policy. Private results/errors, no-effect fallbacks, non-gameplay commands and embeds with image art retain their design. Only the first public gameplay embed can receive a GIF. Average 2.5 GIFs per 25 eligible public results, not a quota or upper bound; private/fallback outcomes reduce that average. Text still celebrates major wins even without a GIF.

Config pools expand from 20 to 52 unique GIPHY assets across 17 outcome families, each with 4–6 choices. Thirty-two additions come from Buffy, Hocus Pocus, Scooby-Doo, Ghostbusters, Beetlejuice and Addams Family. Discovery sources: [Buffy](https://giphy.com/explore/buffy-the-vampire-slayer), [Hocus Pocus](https://giphy.com/explore/hocus-pocus), [Scooby-Doo](https://giphy.com/explore/scooby-doo), [Ghostbusters](https://giphy.com/explore/ghostbusters), [Beetlejuice](https://giphy.com/explore/beetlejuice), [Addams Family](https://giphy.com/gifs/meettheaddams-the-addams-family-meet-UtEvubvQl0kAjNf4Wh). Candidate IDs are linked in artifacts/spooky-production-launch/gif-expansion-assets.json; the configured catalog is authoritative. All 52 configured direct URLs return HTTP 200 and image/gif by HEAD; no media downloads. Editorial fit still needs human visual acceptance.

When the cosmetic roll passes, read up to 100 most recent channel notification rows inside the root transaction. Ignore cancelled rows and non-GIF image art; exclude the last two distinct GIPHY IDs in this recent window from the current outcome pool. Pending/uncertain reservations count to avoid duplicates during delayed delivery. There is no in-memory rotation state, new schema or gameplay RNG consumption. Channel IDs are globally unique; rotation is channel-wide across players, not per user. The 100-row window bounds the read; it cannot promise avoidance across arbitrary long gaps, cross-channel traffic or reordered deliveries.

Both chance and asset choice use operation-ID SHA-256 domains; the selected URL freezes in the saved outbox. Replaying a committed operation never reruns selection against new history. For controllers explicitly constructed without the notification service, preserve the supported direct-send mode and omit history reads; the production/development runtime uses durable notifications. Cosmetic projection reads/writes share the root transaction and serialized economy queue; Discord calls remain post-commit.

## Files and acceptance

Runtime: config/spooky-2026.json (version15/rate10), config/spooky-gifs.json, services/spooky/gifs.js, services/spooky/controller.js. Tests: tests/spooky-gifs.test.js, tests/spooky-controller.test.js. Documentation: this guide, README, AGENTS, handoff and checklist. No slash definitions, deployment PUT, database migration, dependency, resource/rarity/refill/prestige, participant correction or merge.

Focused **22/22** and full **348/348** pass: statistical 10% hash distribution, significant rate/no-effect/private/art guards, root-scoped history exclusion, cancelled/art filtering, real SQLite outbox rotation, one action candy and saved replay. Four syntax checks, offline preflight/full registry and all52 direct media links pass. Evidence: artifacts/spooky-gif-frequency-{focused,full}.log, spooky-gif-frequency-{preflight,registry}.json; artifacts/spooky-production-launch/gif-frequency-link-checks.json. Scoped whitespace passes.

The first validation exposed the intentional no-notification controller fixture querying a missing outbox; history is now explicitly disabled without a notification service. Focused regression and full follow-up passed before adding the real-store regression; final suite includes that regression. Do not bypass history errors in durable runtime by swallowing database exceptions.

## Exact next

Config15 is live after one reload per bot, verified at **11:50 PM Pacific October2** (06:50:21 UTC October3). Development online/ready PID22076/restarts22; production online/ready PID29800/restarts9. PM2 saved. Both error logs match the before snapshot; no new startup errors. Sanitized evidence: artifacts/spooky-production-launch/gif-frequency-{before-processes,process-verification}.json plus development/production reload and save logs. Command registries unchanged; no real action/reset/migration/merge.

Human batch acceptance: observe occasional GIFs, broadened clip variety and recent-repeat avoidance; verify quarter/badge art and private screens remain intact. No real action is triggered by the agent. Keep branch unmerged and one writer per live database. Slots stays held until Monday; the preexisting production 10008/10062 traces documented in the nickname guide remain a separate review item.
