Community eligibility now follows the existing Unwanted Fate role and current shared server channels, verified read-only in both guilds. Channel/role refinement can follow later; both activation flags remain disabled. See [configured baseline](docs/community-leveling.md).

Community leveling development: see [foundation and rollout requirements](docs/community-leveling.md). Work is on feature/S-1-leveling with activation disabled in both environments. No new slash commands are added. Event command scheduling/targeted cleanup is staged; live registries and bot processes have not been changed. Run npm run test:leveling and npm run leveling:rehearse for isolated checks.

Profile PNG background/palette update is live in development: supplied blackhole.png copied unchanged, slate-blue/crimson bar and accents, no invented preview badges. Live card shows only selected-member/current-guild ownership, at most10;12/12 profile checks pass with cross-member/guild/emoji regression. Dev PID5440/restarts32 ready after one reload; production PID11728/restarts32 not reloaded, both error baselines unchanged, PM2 saved. See [current profile palette evidence](docs/profile-palette.md). Saved development test-grant badges remain unchanged.

Command performance fixes are LIVE: [performance evidence](docs/spooky-performance.md). Full before/after sweeps replaced by fresh DB expiry/closure guard plus startup/minute recovery; current-operation projections follow visible saved results. Spell roster checks 900–1190 SQL ->6; ordinary candy skips inventory/access scans; modern reversal cleanup avoids needless ledger reads. Ticket listener now owns only ticket buttons, preventing game chooser/confirmation races and catching its own failures. Existing PNG profile-background path repaired; /profile stays dev-only. 411/411 full tests,56/56 and36/36 focused,9/9 repair/parity/profile/ticket pass; offline preflight/registry/syntax/whitespace pass. One reload each: dev PID28132/restarts31, prod PID11728/restarts32, both ready, PM2 saved. Fresh error baselines unchanged (prod2838531 bytes/18:09:50Z; dev35834 bytes/18:11:28Z, October4). Crown actual/ledger agree (prod1/dev0), no pending transfers. Config19/odds/economy/storage untouched; no registry deployment, migration/reset/merge. Slots/refill held MondayOct5. Prior context below is historical where superseded.

Profile revision and production Bots-role exclusions are LIVE: up to10 recent owned badges, destination level only at XP bar, no brand/XP numbers, ADMIN role label, assets/profile-backgrounds seasonal folders. 402/402 full tests,52/52 focused and19/19 final checks pass. One reload each; both ready/restarts30/error baselines unchanged, PM2 saved. /profile stays development-only (15 dev/13 prod GET verified). Two owner dev badges are prior admin test grants; no ownership reset. See [profile revision evidence](docs/profile-revisions.md).

Profile cards are now development-only and testable: /profile [player], 396/396 isolated tests pass, 15 dev commands verified with /game preserved. SB-development reloaded once and ready (PID30080/restarts29); production PID14600/restarts29 unchanged, both fresh error baselines unchanged, PM2 saved. Runtime guard rejects production/wrong guild before imports. See [development profile guide](docs/profile-development.md). Original config19 Spooky preserved; no merge/branch switch/migration/reset or automatic level-up cards.

Current implementation config19: [variety rollout](docs/spooky-variety-rollout.md). Nine new immediate candy events and persistent25%/max2 hole; eighteen ordinary Trick outcomes/caught16%. Shields12h, frozen2–3 charges, breaking hit fully blocked; Crown theft also shielded per user instruction. Same-spell buffer only; Eye13/Crown1 unchanged. Original nickname/replay/conservation preserved. 386/386 full tests,82/82 focused and64/64 controller/parity/admin pass; offline preflight/registry/26 syntax pass. Config19 LIVE after one reload each; production restarts29/development28, both online/ready, PM2 saved. Fresh pre-reload error logs unchanged; production exactly1 Crown holder matches ledger and0 pending transfers. No schema/commands/migration/reset/rescore/merge. Mirror/Copycat remain next separate stage; slots/refill held MondayOct5. Older entries below are historical.

Emergency config18 delay correction is live: Crown role scans use fresh paginated REST, replacing repeated gateway full-member requests that could stall pre-command maintenance for120seconds. Real-adapter pagination/error regression added;16/16 focused and368/368 full pass. Both online after one reload each (production/development restarts27), no pending Crown delivery, production exactly1 holder; human fresh-command response confirmed. Runtime logs previously swallowed command diagnostics. Read [current Crown guide](docs/spooky-contested-crown.md) first; no economy/schema/commands/migration/reset/merge change.

Config18 rollout verified October3 13:23 Pacific: one reload each, both online/ready, production PID8612/restarts26 and development PID8044/restarts26, PM2 saved. Error logs unchanged from fresh pre-reload baseline (production2835954 bytes/20:19:35Z; development35694 bytes/September8). Read-only post-start checks: production exactly1 actual Crown holder matches initialized ledger; development initialized with no holder. Production reversal rows34 before/27 after startup cleanup. Seven expired rows were cleaned by normal guarded maintenance, not a manual reset. Preexisting production reportHandler Unknown interaction10062 and increased prior restart count remain unresolved; no new startup error in this rollout.

Current config18: [contested Crown, 12-hour reversals and scoring](docs/spooky-contested-crown.md). Human chose 5% reversal/12h and +10 capture plus 10% positive prestige while wearing Crown (+2 becomes +2.2). One durable owner; equally rare Trick theft while held, exclusive remove-before-add recovery, first-win currency only. Leaderboard uses latest guild Spooky badge, Selene default; successful theft forces requested Rihanna GIF. 367/367 full,85/85 focused,subsequent71/71 focused,26 syntax/offline preflight/full registry pass. No schema/commands/deps/migration/reset/rescore/merge. Live rollout evidence follows in guide. Slots held MondayOct5; preserve live one-writer storage.

Config17 rollout complete October3 00:32 Pacific: 357/357 full tests and 47/47 focused pass, seven syntax checks/offline preflight/full registry/scoped whitespace pass. Both bots online/ready after one reload each, production PID28132/restarts12, development PID30096/restarts25; PM2 saved. Error logs unchanged, no new startup errors. Sanitized evidence artifacts/spooky-production-launch/repeat-buffer-{before-processes,process-verification}.json and reload/save logs. No migration, registry deployment, manual player reset or correction.

Current update (October 3), config17: backwards-name spells randomly choose an eligible alternate target, excluding existing spells and pending/conflicting restoration; no eligible target refunds the complete action. After a non-candy result, ordinary non-candy outcome weights are halved for one action (including Eyes/crown), using durable scoped action history. Candy results clear the buffer; replay/screens/restarts do not. 47/47 focused and offline preflight/registry/seven syntax checks pass. Read docs/spooky-repeat-buffer.md for rules, files, limits and exact next human checks. Earlier base-odds population evidence is historical. Keep feature/S-1-spooky unmerged; slots held Monday.

Long shield nickname fallback (October 3): protected names use ✨( Player )✨ when the complete wrapper fits 32 UTF-16 units; otherwise use a single leading ✨ and retain the name, trimming only if that prefix also exceeds 32. Saved original/null restoration and guarded maintenance refresh remain unchanged. 31/31 isolated nickname/lifecycle regressions pass, including exact length boundaries and emoji safety. Config16, commands and economy unchanged. Slots remains held until Monday. See docs/spooky-exclusive-effects.md.

# Roll For Sanity Bot

Config **16**: shield names `✨( Name )✨`, curse names `☠ Name ☠`; shields block curses and protection cast on a cursed target cures them instead. Minute/startup maintenance expires shields, safely refreshes old styles/legacy overlaps and restores names at October closure; manual edits stay protected. **353/353 full**, **96/96 focused**, ten syntax/preflight/registry/whitespace pass. [Current effect rules and rollout](docs/spooky-exclusive-effects.md). GIF10% unchanged; slots held until Monday.

Config **15** quieter GIFs: all eligible public outcomes use **10%**, 52 unique clips across 17 pools (4–6 each), recent channel GIF repeat avoidance and frozen replay. **348/348 full**, **22/22 focused**, four syntax/preflight/registry and52/52 media links pass. [Current GIF behavior and rollout](docs/spooky-gif-frequency.md). Slots decision/implementation is held until Monday October5; no reminder scheduled, refill remains unchanged.

Config **14** nickname fix: readable `☠ Name ☠` / `(( Name ))`, one visual state with baseline/null/manual-edit-safe restoration retained. **345/345 full**, **63/63 focused**, syntax/preflight/registry pass. [Current behavior, rollout and next checks](docs/spooky-readable-nicknames.md). Slots/refill remain design-only.

Slots/Spirit design research: [approved direction, proposed odds and offline model](docs/spooky-slots-design.md). Human approved 2 candy / 30 minutes (96/day), jackpot overflow above the refill ceiling, revised stage ranges and a 100% Spirit payoff/reset with faster decay at higher Spirit. These are NOT implemented; config 13 remains live. Proposed burst/decay/odds require agreement before implementation.

Config **13 is live in both bots**: **342/342 full** and **52/52 focused** tests and final static checks pass; one reload each, PM2 saved, no new startup errors. Production restarts 7, development 20. Exact next is [human curse-breaking/GIF/XP acceptance](docs/spooky-gifs-break-xp.md). No registry deployment, migration, reset or merge.

Latest config **13**: curse-breaking uses the private chooser for 2–3 cursed people (one is freed automatically); Spooky chat/threads and bot-command messages award no XP; public ordinary outcomes get GIFs 20% of the time, public major successes always do. Token/badge art and private screens keep their design. Read [current implementation and rollout](docs/spooky-gifs-break-xp.md) first; 52/52 focused tests and all 20 GIF media links pass. Runtime-only update: no command registration/schema/reset/merge.

Latest config **13**: curse-breaking uses the private chooser for 2–3 cursed people (one is freed automatically); Spooky chat/threads and bot-command messages award no XP; public ordinary outcomes get GIFs 20% of the time, public major successes always do. Token/badge art and private screens keep their design. Read [current implementation and rollout](docs/spooky-gifs-break-xp.md) first; 52/52 focused tests and all 20 GIF media links pass. Runtime-only update: no command registration/schema/reset/merge.

Config **12 is live in both bots**: 335/335 tests and final offline checks pass; one reload each, PM2 saved, no new startup errors. Production restarts 6, development 19. Exact next: human choice/timeout, nickname restoration and public leaderboard acceptance from [the current guide](docs/spooky-target-choice.md). No command registration, migration, reset or merge.

Latest update: config **12** adds private three-person curse/shield choices with a **20-second** random fallback, prevents renewing existing effects, and splits protection **80% recipient / 20% both**. Shared nickname restoration supports 🦇 curses and ✨ shields; leaderboard is public. Read [the current choice/nickname guide](docs/spooky-target-choice.md) first. **335/335 full tests**, 41/41 focused and 40/40 recovery checks pass; deployment evidence follows in that guide. Config-11 quiet mentions remain in force. No command/schema/storage migration or player reset; keep this live feature branch unmerged.

Current quiet recipient update (October 2), config **11**: randomized **embed-only** recipient mentions, no separate content tags and no permitted notification pings. Maximum **1 unregistered / 4 registered per rolling 72 hours**, at least **18 hours** between registered mentions, **20% chance** on eligible actions. Old daily reservations count toward the rolling window; no midnight reset, new registration reset or gameplay RNG use. Read [quiet recipient rules and evidence](docs/spooky-recipient-mentions.md) first; this supersedes the previous daily/pinging policy. Economy/commands/schema and BOTADMIN-only guards stay unchanged. Config 11 is live in both bots: **326/326 tests**, **26/26 focused**, seven syntax checks, offline preflight/full registry/positive probes and scoped whitespace pass. One reload each; both online (production restarts 4, development 18), PM2 saved, no new startup errors. Commands unchanged (14 dev including /game, 13 prod). Exact next: human embed-only/no-notification/cadence checks on this unmerged branch; no real action/reset/correction was performed by the agent.

Purchase/admin rollout verified: **318/318 tests**, focused confirmation/recovery/owner regressions, **26 syntax checks**, offline preflight/full registry/positive probes and scoped whitespace pass. Both reviewed registries applied once (only spooky/spooky-admin definitions changed; 14 dev with /game preserved, 13 prod). One reload each; both online, production restarts 2 and development 16, PM2 saved, no new error-log writes. No migration, real purchase, reset or manual balance correction. Current config **9** is live; detailed hashes/files/evidence and exact human Cancel/Confirm/other-account checks are in [the purchase/admin guide](docs/spooky-spend-fate.md). Existing ambiguity/one-writer/artwork limitations remain; keep the feature branch unmerged.

Current update (October 2): config **9** introduces `/spooky spend-fate` with a private two-minute Confirm/Cancel offer, Fate/Bank/Total deductions, Bank-first then Fate payment, and human-approved Fate-only **50/35/15** rarity; Eye draws stay **70/22/8**. Every admin mutation is **BOTADMINID-only**; `/spooky-admin` defaults to hidden for regular members, while Discord Administrators may still see it. Read [the current purchase/admin guide](docs/spooky-spend-fate.md) first. Older Bank-only command/permission descriptions below are historical. Production is live from the unmerged feature branch; this update's verification/rollout evidence is in that guide. Preserve config/prod.sqlite and the verified legacy-data backup; no migration or manual player correction is part of this update.

Final launch verification: **308/308 tests pass**, 25/25 production-storage/access focused checks, eight final syntax checks, scoped whitespace, offline preflight/full registry/positive probes pass. Production post-start storage is complete/integrity ok/zero foreign-key violations. SB-production online and logged in (PID 26364, one intentional restart); SB-development online (PID 17660/restarts 15). PM2 process list saved. Both error logs retain their prelaunch sizes/timestamps; no new startup errors. Latest evidence: artifacts/spooky-production-launch/process-verification.json and final-isolated-tests.log. No merge or real participant reset.


Production launch authorized and completed from feature/S-1-spooky (unmerged). Read [production launch evidence and continuation](docs/spooky-production-launch.md) first; it supersedes all historical production-disabled/no-live-operations statements below. Human development acceptance and five badge placeholders accepted. Production uses a verified preserved legacy-data copy at config/prod.sqlite, four backed-up atomic migrations and thirteen reviewed commands. Selene/Marq native emoji access is configured in both servers. Explicit productionEnabled=true; test/global default stays disabled, version 8/economy unchanged. Winner announcement: November 1 noon Pacific to SERVERANNOUNCEMENTSID with SCREAMSUPREMEID. Do not migrate/replace storage with online writers, reset production, merge or switch branches. Exact next is human live observation and scoped fixes; no automatic monitoring or merge was scheduled.


Marq badge update (October 2): supplied assets/badges/SPOOKY_MARQ_BADGE.png copied unchanged and mapped in config/badges.json (spooky_marq_badge). Completion renders it as the main image with full token thumbnail. 23/23 affected badge/access/art/launch-fix tests and offline preflight pass; prior full suite remains 304/304. Five other badge artworks use accepted placeholders. Native Marq emoji upload/collector-role configuration is not performed by this artwork integration; collection falls back to medal unless that emoji exists, and earned ownership remains durable. Production remains stopped/disabled; human acceptance, production permission/storage/registry checks and finale time/channel are outstanding.


Verification: 304/304 full tests pass; subsequent effective-winner admin inspection correction passes 42/42 affected tests. Offline preflight/full registry/positive probes and scoped syntax/whitespace pass. Development is online after two reloads (restarts 12); production stopped/restarts 0. No new error log entries (35,694 bytes, last changed September 8). No command registration or player reset.


Latest human-approved extension: [duplicate and badge-first reveals](docs/spooky-piece-reveals.md). Duplicates show saved N/5 plus cumulative token thumbnail; collection shows total extras. Completion names the character, puts badge art first and links /spooky collection; player labels are #1–#4. SWEETTOOTHID/legacy SWEETTOOTHROLEID and SCREAMSUPREMEID are wired; finale remains disabled pending time/channel. Six badge-art placeholders are accepted. Natural candy remains 1/18min = 80/day. This extension supersedes earlier badge-thumbnail/art-required notes.


Current implementation (October 2, 2026): all seven launch findings L01–L07 are fixed with positive regressions. **301/301 tests**, 51 syntax checks, offline preflight/full registry, authoritative development-target checks and synthetic four-migration storage recovery pass. Read [launch fixes and test reset](docs/spooky-launch-fixes.md) first; it supersedes the historical audit readiness/next-step statements below. Config 8/manifest 2 and approved economy are unchanged.

Development-only reviewed registry update is applied: fourteen commands match, /game retained, only spooky-admin changed (fifteen leaves/four groups). Development reloaded once, online/restarts 10; production remains disabled/stopped/restarts 0. Selene's supplied badge artwork and restricted native emoji are configured only in the pinned development guild. No migration, manual player reset, balance correction or production change occurred.

Use /spooky-admin event reset-testing player:@you confirm:true reason:testing for a complete development test reset. It clears seasonal registration/resources/pieces/scores/effects, this event's test badges and Crown eligibility; preserves Fate/Bank, other seasons' badges and audit history. The old reset-development preserves permanent badges. Completion now emits one public reveal, with the earned badge thumbnail. Exact next: human reset/re-register/re-earn Selene; check collection emoji/native emoji access before and after reset, single completion/Bank fields, wording gallery, off-channel redirects and restoration/cancellation recovery. Six artworks, finale role/channel/November time, balance targets and human acceptance remain open; production launch still waits. Earlier entries are chronological evidence.


Latest verification: **288/288 tests pass** for Bank display/channel restrictions; development reloaded and online (restart count 9), production stopped. No command re-registration or migrations. See [display/channel guide](docs/spooky-bank-and-channels.md) for current acceptance steps.

Latest verification: **288/288 tests pass** for Bank display/channel restrictions; development reloaded and online (restart count 9), production stopped. No command re-registration or migrations. See [display/channel guide](docs/spooky-bank-and-channels.md) for current acceptance steps.

Latest display/channel correction: [Fate bank and Spooky channels](docs/spooky-bank-and-channels.md). Fate rewards and quarter purchases show **Fate / Bank / Total** fields, with Bank before → after, above the candy/Eye footer. Committed snapshots preserve replay accuracy. Player/admin commands use only the selected environment's Spooky or bot-testing channel; private redirects run before gameplay processing. Production policy was validated offline against its two configured channels; production stays stopped/disabled. Config 8 and all economy settings are unchanged.

Config 8 validation: **284/284 tests**, offline preflight/full registry and syntax/whitespace pass. Development leaderboard registration preserves all fourteen commands including /game; PM2 development online after one reload (restart count 8), production stopped. First weekly Fate reminder verified with only Unwanted mentioned. Human visual/role acceptance and finale role/time remain pending. See the [current handoff](docs/spooky-handoff.md).

Latest Spooky update (2026-10-02): [crown, goodwill and Scream Supreme](docs/spooky-crown-and-finale.md), config **8**. Caller-only 1% Sweet Tooth awards +5 banked Fate, +5 candy and +10 hidden prestige once; Great Heist has a +5 prestige bonus. Cursed generosity breaks the curse after a hidden 10–30 delivered candies. Currency wording uses 🧿/🍬. Weekly Unwanted Fate reminders run during October; `/spooky leaderboard [page]` shows combined ranks and badges, keeping scores private. Final November announcement/role delivery is implemented but awaits the winner role and Pacific time; its config remains disabled. Development verification/reload evidence is in the [handoff](docs/spooky-handoff.md); production remains disabled/stopped. Earlier five-percent/shared-crown/two-title and offline-only descriptions below are historical.

Latest Spooky update (2026-10-02): [crown, goodwill and Scream Supreme](docs/spooky-crown-and-finale.md), config **8**. Caller-only 1% Sweet Tooth awards +5 banked Fate, +5 candy and +10 hidden prestige once; Great Heist has a +5 prestige bonus. Cursed generosity breaks the curse after a hidden 10–30 delivered candies. Currency wording uses 🧿/🍬. Weekly Unwanted Fate reminders run during October; `/spooky leaderboard [page]` shows combined ranks and badges, keeping scores private. Final November announcement/role delivery is implemented but awaits the winner role and Pacific time; its config remains disabled. Development verification/reload evidence is in the [handoff](docs/spooky-handoff.md); production remains disabled/stopped. Earlier five-percent/shared-crown/two-title and offline-only descriptions below are historical.

Latest presentation correction (2026-10-02): Sweet Tooth fallback now says the named player tried the crown but it did not fit; committed fateBonus supplies the consolation wording exactly once. At cap/ineligible, no fate grant is claimed. Costume/role-permission fallback is playful jack-o'-lantern mischief, not an unavailable-effect message. Personal Eye finds, self crown/fate/candy wins and collection rewards are PUBLIC; ordinary personal failures, screens and nudges remain private. Registration-only recipient mention rules are unchanged; actor uses safe name. Fate/repair acquisitions omit the generic parcel preamble, retaining a single public quarter reveal. Gallery reuses these designs. Historical receipts/outbox visibility are deliberately preserved. Config version 7/manifest 2, all resource/odds/permission rules unchanged. Changed flavor.js, presentation.js and flavor/audit/token-art presentation tests; **276/276 full** and **35/35 focused** pass, syntax/scoped whitespace pass. Evidence: artifacts/spooky-development-session/wins-{full,focused}.log. Development-only reload verified: SB-development online/logged in, restart count 7; production stopped at restart 0, error log unchanged from September 8. No command registration, migrations or real resource correction; next is human channel visibility and wording review.


Final UI validation: full **273/273 pass** after the committed fate balance/footer and delivery-error fixes; latest focused **18/18 pass** includes an additional preview-button acknowledgement/permission-loss regression added afterward. Live GET confirms all fourteen definitions match and /game survives. Final development-only reload verified: SB-development online/logged in, total intentional restart count 6, SB-production stopped at restart 0, September 8 error log unchanged; no real player repairs, migrations, production changes or optional activation occurred. Changed controller now saves candy/Eyes in every finalized acquisition receipt; cursed replacements/error embeds use the same footer helper. Next: human visual acceptance with /spooky-admin inspect wording, collection icons and zero-candy countdown/private nudges. Custom admin-role visibility may require the explicit server command permission override described in the UI guide.


Latest human-approved UI: [private candy nudges and admin wording gallery](docs/spooky-private-ui.md). Current config **version 7**, piece manifest 2; refills use shared 18-minute ticks. Both 50-candy (1–24h since gameplay, 48h cooldown) and full-bucket (weekly) nudges are ephemeral on a qualifying interaction; the public bucket worker is disconnected. Status removed; six player commands, balance footers/countdown at zero, no embed timestamps, collection ❔/earned badge emoji. Admin tools have inspect/repair/event/queue groups and Administrator default visibility; custom admin roles need server command permission override. Wording preview uses real embeds, Previous/Next, fresh authorization and ten-minute expiry. Full **273/273** tests, static preflight/registry pass. Reviewed development definition update applied once under hash 95e1decf185689348b284c318baca039d261292d62318919b6155124ea32b887, preserving all fourteen commands including /game. Earlier public reminder/status/per-player clock descriptions are historical. Next: verify development reload then human UI testing; no production/schema/odds changes.


Version 6 development reload verified: one intentional PM2 restart (total 4), SB-development online/logged in, v6 maintenance observed, SB-production stopped (restart 0). Error log unchanged from September 8. No command re-registration, migrations or manual player corrections; human refill/reminder visual acceptance remains pending.


Latest human-approved change: [steady candy and weekly bucket reminders](docs/spooky-candy-refill.md). Current configuration **version 6**, piece manifest 2: **1 candy every 18 minutes**, same 80/day, initial 10 and backend cap 80. New balance displays omit the capacity fraction. Registered full-bucket players receive a Spooky-channel reminder at most once per rolling seven days, with only their user mention. Durable cooldown/outbox and eligibility/closure guards survive restart; sending/uncertain needs admin inspection. Resident recruitment stays disabled. No schema, command definitions, outcome/draw odds or ownership changes. Validation: **268/268 full tests**, **38/38 focused**, offline preflight/registry and source syntax/scoped whitespace pass. Next human acceptance is steady refill and reminder visuals. Earlier versions/refill descriptions are historical.


Latest approved update: [character rarity map](docs/spooky-character-rarity.md), configuration **version 5**, manifest **version 2**. Pools: 17 common / 7 rare / 4 legendary; ordinary odds remain 70/22/8. Stable IDs, existing ownership and historical receipts are preserved. Lost-candy wording explicitly identifies the one action candy (6 → 5); no additional penalty. Full **261/261** tests, offline preflight and registry audit pass. Earlier version 4 statements and population results are historical; balance for the new map still needs measurement. Version 5 loaded with one development-only PM2 restart (total 3): online, production stopped, no new startup errors. Human visual acceptance is next; optional activation remains unchanged.


Latest presentation update: [legacy Spooky flavor restored](docs/spooky-flavor.md), with themed outcomes, avatar/timestamp/resource footer and no routine “Action Recorded” popup alongside delivered public results. Lost/caught still spend exactly one action candy. `/spooky-admin transactions` provides the private actor/command/outcome activity log. Latest full suite **257/257 pass**.

Latest presentation update: [legacy Spooky flavor restored](docs/spooky-flavor.md), with themed outcomes, avatar/timestamp/resource footer and no routine “Action Recorded” popup alongside delivered public results. Lost/caught still spend exactly one action candy. `/spooky-admin transactions` provides the private actor/command/outcome activity log. Latest full suite **257/257 pass**.

**Development is running (2026-10-02):** Authorized migrations/verified backup and fourteen-command registration completed; existing `/game` preserved. `SB-development` is online through PM2 in the development environment; production remains stopped. Gameplay activates only in development (`developmentEnabled=true`, global `enabled=false`); optional workers/access remain disabled. See [startup evidence and hands-on next steps](docs/spooky-development-live-session.md). Earlier offline-only statements below are historical.

Begin hands-on testing with `/spooky register`, then `/spooky status` in the configured bot-test channel. Registration includes the short introduction, player avatar and footer balances (🍬 candy / 🧿 Evil Eyes); `/spooky help` keeps the detailed rules. Separate `/spooky welcome` is removed. Re-registering preserves balances and never repeats the starting candy grant.

Latest onboarding verification: **253/253 tests pass**; updated seven-subcommand definition registered in development and SB-development restarted. Existing /game preserved; production remains stopped.

Latest onboarding verification: **253/253 tests pass**; updated seven-subcommand definition registered in development and SB-development restarted. Existing /game preserved; production remains stopped.

**Preparation update (2026-10-02):** The supplied development `CURSEDROLEID` is verified: `npm run spooky:check:dev` passes for all required role IDs and the bot-test channel. Server ownership/permissions still require live checks. No credentials were printed, databases opened or Discord calls made. See [acceptance gates](docs/spooky-development-acceptance.md).

Latest full offline suite: **250/250 pass**. All activation flags remain disabled.

Final preparation checks pass. The [development session plan](docs/spooky-development-session.md) records the target, reviewed migration/command sequence, tester needs and deferred features. Live execution has not begun.

**Spooky development status (2026-10-01): all nine audit findings fixed offline.** On `feature/S-1-spooky`, **244/244 tests pass**, including 20 positive audit regressions; static preflight/full registry review pass. See [fixes and remaining work](docs/spooky-audit-fixes.md), [the original audit](docs/spooky-feature-branch-audit.md) and [current handoff](docs/spooky-handoff.md). Member requests are shared/rate-aware, committed public rewards survive private reply failure, stale intents are guarded, and chat level/fate transitions are claimed once. Deployment now requires an explicitly reviewed registry hash. Gameplay/reminder/winner/access flags remain disabled; no real migration, login or registration occurred. Next is separately authorized development acceptance; public-launch balance, six artworks and optional settings remain open.

**Roll For Sanity** is a Discord bot designed to enhance server engagement through a leveling system, achievements, and role-based rewards. Built using `discord.js`, this bot provides a robust platform for tracking user interactions, managing achievements, and maintaining user balances of fate points, allowing for a dynamic and interactive community experience.

## Features

- **Fate Points System**: Track, add, and manage fate points for server users. Admins can also modify user balances.
- **Leveling System**: Engage users through conversation tracking and reward them based on their activity.
- **Achievements**: Spooky character sets award permanent badges in SQLite; `/badges`, profiles and level-ups share rendering. Implemented and audited offline; live acceptance remains pending.
- **Server Information**: Easily display details about the server.
- **User Profiles**: View individual user data, including fate points, achievements, and join date.

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/OldSociety/sanity-bot.git
cd sanity-bot
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

In the root of your project, create `.env.development` with the development bot credentials and channel/role IDs:

```env
TOKEN=your-discord-bot-token
CLIENTID=your-discord-application-id
HELLBOUNDCHANNELID=channel-id-for-commands
BOTTESTCHANNELID=channel-id-for-testing
ADMINROLEID=your-admin-role-id
BOOSTERROLEID=your-booster-role-id
UNWANTEDROLEID=role-id-for-banned-users
GUILDID=your-discord-guild-id
```

#### Production configuration

Production requires a separate `.env.production` and explicit `NODE_ENV=production`. The runtime does not load `.env` or use `DATABASE_URL`; see the database paths below. Development and production must use different guilds.

### 4. Running Migrations

```bash
npx sequelize-cli db:migrate --env development
```

### 5. Deploy Commands

```bash
npm run deploy:check:dev
# Only during an authorized development session: read/save the live registry plan.
npm run deploy:dev -- --plan
# Review listed removals and the saved snapshot, then supply its exact SHA-256.
npm run deploy:dev -- --apply REVIEWED_SHA256
```

### 6. Run the Bot

For development:

```bash
npm run start:dev
```

For production:

```bash
npm run start:prod
```

## Usage

The bot includes several commands for both users and admins to manage their experience on the server.

### Commands Overview

#### **Fate Points Management**: `/fate`
- Fate points are a currency for the Meridian Campaign setting and are used as a replacement for 5e's Heroic inspiration.

| Subcommand    | Description                                                | Permissions Required  |
| ------------- | ---------------------------------------------------------- | --------------------- |
| `add-fate`    | Adds fate points to yourself.                              | User                  |
| `reroll`        | Deducts 10 fate points or bank points automatically.       | User                  |
| `balance`     | Shows your current fate points and bank balance.           | User                  |
| `manage`      | Admins can manage the fate points or bank of any user.     | Admin Role            |

- Fate points cap at 100 per user. Excess points can be added to the bank for users with Booster or Admin roles.
- Rolling fate deducts points from the bank first, then from fate points if the bank is insufficient.

#### **Server Information**: `/server`

Displays server statistics, such as:
- Server name
- Total number of members

#### **User Information**: `/user`

Provides information about the user executing the command:
- Username of the user
- The date the user joined the server

---

## Halloween / Spooky 2026

Work remains on `feature/S-1-spooky`. Tasks 1–8, 10–17 and **18a maintenance/18b reminder worker/18c1 snapshots/18c2 winner delivery** are implemented offline. All nine audit fixes are complete; **244 tests pass**. Task 18 activation and Task 9 remaining six artworks/live badge checks stay open. Event/reminder/winner/access flags are **disabled**; no real migration, bot login, registration or deployment occurred. Live behavior is not yet validated.

Read [AGENTS.md](AGENTS.md), the [current handoff](docs/spooky-handoff.md), [rules](docs/spooky-rules.md), and [checklist](docs/spooky-implementation-checklist.md) before continuing. The [Task 17 balance report](docs/spooky-population-balance.md) and [seeded results](docs/spooky-population-results.json) evaluate the approved economy: casual/regular completion targets are not met, and theft plus gifted candy invalidate independent 13%-yield/80-action assumptions. Approved settings remain unchanged. Task 20a acceptance/storage preparation is complete; 20b status/backup/apply tooling and 20c scoped offline preflight are complete; next: **reviewed full command registry and settings, then authorized live development acceptance**; balance approval is required before enabling play. Delivery ambiguity is resolved through explicit audited admin decisions; there is no blind resend. Older audits/simulations contain superseded proposals; chronological checklist entries preserve historical evidence.

Run `node scripts/spooky-preflight.js` for offline configuration and scoped command checks; [saved results](docs/spooky-preflight-results.json) list remaining launch gates. It reads no credentials, opens no DB and contacts no Discord. The [storage guide](docs/spooky-storage-tools.md) documents development-only status/backup/plan/apply: mandatory verified backup, reviewed plan hash, atomic schema/tracking and explicit adoption. Nine new apply tests are included in the 208-test suite. Existing three migration up APIs now support injected transactions with unchanged DDL; no destructive down/restore CLI exists. These storage commands have not been run against the real development database.

### Commands and presentation

Current command definitions: `/spooky help`, `/spooky register`, `/spooky status`, `/spooky collection`, `/spooky trick`, `/spooky treat`, `/spooky fate`. Registration is the newcomer introduction; its private embed shows the caller's avatar and committed candy/Eye balances. The command wrapper routes through the new runtime; the old implementation is preserved at `docs/legacy/spooky-command.js` for reference and is not loaded.

Personal screens are ephemeral. Events involving another player are public and tag registered targets only; nonparticipants appear as plain names. Quarter and newly completed character reveals are prominent public notifications. Permanent ownership commits with completion; reveals distinguish newly unlocked from already retained badges. Selene is configured; other earned badges use medals while art is pending. Exact prestige weights stay out of player rendering.

Start with 10 candy, +10 per three elapsed hours, capacity 80. First economic touch starts the refill clock; registration reuses any victim balance. Every action costs exactly one. Capped surplus is discarded before spending, partial intervals below cap remain. No refill worker is required for accrual correctness. Five Eyes automatically award a quarter; five extras automatically award a uniformly random missing piece, preserving first copies. Ordinary rarity is approved 70% common / 22% rare / 8% legendary. Ten banked fate buys an extra quarter for any registered bank holder; no hard daily draw ceiling. Sweet Tooth's normal 5% treat branch additionally grants Unwanted callers +1 bank point, cap 100. Config version 4, scoring version 1. October boundaries use local Pacific time with no redemption grace.

Administrator source definitions: /spooky-admin player, /spooky-admin transactions, /spooky-admin config, /spooky-admin deliveries. All responses are private; fresh server authorization and configured guild/channel checks apply even while play is disabled. Inspection never refills or changes state. These commands are not registered with Discord. Repairs add `/spooky-admin adjust`, `grant-quarter`, and `remove-quarter`, requiring reasons and replay-safe ledger entries. Award notifications are public and belong to the repaired player. Controls add `/spooky-admin clear-effect`, `pause`, and `reset-development`; reset requires explicit confirmation, development environment and matching actual database path. Effect restoration is queued atomically and reconciled after commit for the selected user. Queue tools add `/spooky-admin resolve-notification` and `resolve-delivery`, with inspected-status/revision guards, trusted evidence and explicit duplicate-risk confirmation for uncertain resends. See the [admin tools guide](docs/spooky-admin.md) for options, last-copy intent, lifecycle restrictions, pagination and limits.

### Architecture and current limitations

| Files | Responsibility |
| --- | --- |
| `config/spooky-2026.json`, `config/spooky-pieces.json`, `services/spooky/config.js` | Versioned rules, lifecycle/approval validation, 28 stable piece IDs; no artwork imports |
| `services/spooky/models.js`, `economy.js`, `participants.js` | Injected seasonal models, atomic root operations/ledger/replay and lazy candy accrual |
| `services/spooky/collection.js`, `fate-purchases.js`, `progression.js` | Automatic draws/exchanges, bank-only purchases, Sweet Tooth bonus and separate prestige tracks |
| `services/spooky/actions.js`, `theft.js`, `effects.js`, `playful.js` | Outcome/cost selection, random scoped theft, protection, gifts, curses, nicknames and legacy Sweet Tooth |
| `services/spooky/controller.js`, `presentation.js`, `command-definition.js`, `runtime.js` | Private/public screens, persisted render/mention plans, complete member/permission snapshots, configured guild/channel gates |
| `services/spooky/delivery.js`, `notifications.js`, `cursed-messages.js` | Durable role/nickname intent, persistent public send tracking, safe grapheme-aware message replacement |
| `services/spooky/lifecycle.js`, maintenance in `runtime.js`/`app.js` | Injected minute/startup scheduler, atomic effect restoration and once-only closure marker; inventories retained |
| `config/spooky-winners.json`, `services/spooky/winner-snapshot.js`, `winner-awards.js` | Frozen once-only results and audited title intents/outbox from proof; disabled configuration, drift guards, role hierarchy and admin recovery |
| `config/spooky-reminders.json`, `services/spooky/reminders.js` | Optional three-Pacific-day recruitment reminders, latest-only downtime handling, role mention allowlist and durable guarded outbox |
| `services/spooky/admin.js`, `admin-repairs.js`, `admin-controls.js`, `admin-resolution.js`, `admin-command.js`, `admin-runtime.js`, `commands/Holiday/SpookyAdmin.js` | Private authorized inspection and audited balance/inventory corrections, replay binding and public award outbox; safe effect restoration, durable pause and guarded development reset; evidence-backed queue resolution and explicit resend copies |
| `services/fate-wallet.js` | Stale `/fate` update rejection and atomic level-up/booster/birthday credits |
| `services/guild-members.js`, `spooky/post-commit.js`, `spooky/pending-notifications.js`, `spooky/discord-adapter.js` | Shared complete roster/allowance, saved reply/public isolation, bounded pending recovery and fresh intent/hierarchy guards |
| `services/command-registry.js`, `deploy-commands.js` | Shared strict registry and hash-reviewed live plan/snapshot/apply |

All seasonal writes and effects share one root economy transaction; Discord writes occur after commit. Replays return saved outcomes rather than rerolling. Pending role updates retry with fresh Discord state; nickname restoration preserves independent changes. Cleanup runs on interaction entry/exit and, when enabled, immediately at startup and every minute. Closure atomically freezes a validated winner proof and sets archivedAt once without deleting inventory, scores, wallets or history. Disabled play creates no scheduler/storage access; disabling does not automatically restore effects. Invalid restoration metadata blocks cleanup safely for inspection. See the [lifecycle guide](docs/spooky-lifecycle.md). Frozen winner snapshots and title delivery worker are complete offline; final title names/role IDs/announcement channel and activation remain pending. See the [winner guide](docs/spooky-winners.md). Single bot process required; no distributed delivery lease.

Reminders are source wired after maintenance with an independent enabled=false operational file; channel ID, Resident role IDs and local HH:mm time are null/empty pending user input. `/spooky-admin config` includes these settings. Once configured and enabled, reminders occur every three Pacific calendar days, latest due slot only after downtime, during ACTIVE/unpaused/unarchived play. Older pending messages cancel with audit; ambiguous sends require inspection. Channel lookup/claim boundaries recheck eligibility and reminder failure does not block gameplay. See the [reminder guide](docs/spooky-reminders.md). No real reminders have been sent.

Public notifications persist pending/sending/sent/uncertain state and channel/message IDs. Sent rows never resend on delayed replay. Crashes or ambiguous network failures require inspection instead of blindly resending after Discord's short nonce window. Private inspection and reset cancellation exist; explicit ambiguous-send resolution is now implemented offline, with fresh evidence and audited confirmation. Cancelled replacements never authorize deletion of an original cursed message. Cursed messages only delete originals after confirmed delivery; attachments/replies remain intact, and mentions are disabled. Unsafe legacy delete-first code was replaced.

Covered bank writers use compare-and-swap or atomic SQL in the shared connection queue. Chat XP/level/timestamp and fate reward transition are claimed once; concurrent messages cannot award the same level twice. Booster join reward requires an actual role transition; birthday credits respect the bank cap. Legacy birthday/booster schedules still lack duplicate-job identity.

Required additive migrations, in order: `20261001000000-create-spooky-core.js`, `20261001000001-create-spooky-delivery.js`, `20261001000002-create-spooky-notifications.js`, `20261001000003-create-permanent-badges.js`. Only disposable test storage has run them. Keep dev/prod untouched until authorized acceptance/backup review. Permanent ownership is implemented; six artworks, public-launch balance, optional activation and live checks remain. No buttons/action batches yet; current UI uses slash commands.

### Offline balance simulation

`node scripts/spooky-population-simulation.js 40` reproduces eight seeded scenarios (40 guilds each, 6,720 player-months total) without a bot or real database. It writes `docs/spooky-population-results.json`; review the balance report for assumptions, conditional milestone timing, never-reached rates, duplicates/exchanges/theft, remaining resources and prestige distributions. A meaningful parity test compares the in-memory adapters against actual SQLite services. Simulation does not alter event settings or award permanent badges. It measures behavior under an explicitly heavy-activity population; it is not a forecast of actual server participation.

## Development Workflow

### Using `.env` Files for Different Environments

- **Development**: `.env.development` is required. Unset `NODE_ENV` defaults to development for both startup and deployment; `.env` is not a fallback.
- **Production**: explicitly select `NODE_ENV=production` and use `.env.production`.
- **Test**: `NODE_ENV=test` selects in-memory SQLite and rejects Discord startup/deployment.

Startup and deployment use the same loader in `config/runtime.js`. `TOKEN`, `CLIENTID`, and `GUILDID` must be present in the selected environment file; inherited shell credentials cannot substitute for missing values. Unknown environments and conflicting file environments are rejected. When both guild IDs are configured, development and production must target different guilds. Paths are resolved relative to this repository, independent of the terminal working directory.

You can switch between development and production environments using the commands:

- For development: `npm run start:dev`
- For production: `npm run start:prod`

This setup ensures that the bot uses the correct environment variables based on the environment it's running in.

### Offline checks before running the bot

```powershell
npm test
npm run check:dev
npm run deploy:check:dev
```

`npm test` uses Node's built-in test runner (Node 22) with `NODE_ENV=test`. Tests use fake credentials and disposable in-memory SQLite; the independent-connection contention test deliberately creates a uniquely named temporary SQLite file under the OS temp directory and removes it afterward. Neither `dev.sqlite` nor `prod.sqlite` is used. Temporary environment fixtures are also removed after tests. No additional packages were installed. The previous test command targeted a nonexistent `__tests__` directory.

`check:dev` verifies and displays the selected application/guild IDs and database path while withholding the token. `deploy:check:dev` inspects the deployment target **without loading commands, opening a database, or calling Discord**. These checks confirm configured targets, not whether the token belongs to the application or the bot has server permissions. Actual login/registration remains a later development acceptance task. `deploy:dev` and `deploy:prod` perform real command registration; they are not offline checks.

### Database Configuration

The runtime uses SQLite in each environment:

| Environment | Storage |
| --- | --- |
| Development | `<repository>/config/dev.sqlite` |
| Production | `<repository>/config/prod.sqlite` |
| Test | `:memory:` |

`config/sequelize.js` uses the environment selected by `config/runtime.js`; it no longer always opens the development database. Test storage is forced to memory. `DATABASE_URL` is not used by this runtime. The existing `config/config.json` remains for historical/tooling configuration, but runtime selection is controlled by `config/runtime.js`. No real database schema or data was modified during Task 2.

Winner delivery uses one scoped final-awards operation after CLOSED/archive, retaining proof and targets across restart. Titles retry from fresh Discord state; ambiguous announcements wait for inspection. Changing settings blocks old pending titles/announcements without minting another award. Invalid settings cannot block cleanup/archive. Sweet Tooth remains separate. Token artwork/permanent badges are implemented independently; read the [winner guide](docs/spooky-winners.md) before configuring delivery.


Development acceptance and recovery preparation is documented in the [runbook](docs/spooky-development-acceptance.md), with [saved synthetic storage evidence](docs/spooky-storage-rehearsal-results.json). Run `node scripts/spooky-storage-rehearsal.js` for a fresh disk/WAL backup → migrate → populate → reverse rollback/reapply → restore verification. It accepts no arguments/targets, opens only generated OS-temp SQLite files and removes them after checks. Development status/backup/plan/apply tooling is complete offline; live acceptance remains pending; no existing database was inspected or changed by this rehearsal.


The [storage tools guide](docs/spooky-storage-tools.md) documents guarded development-only status/backup/plan/apply. Apply requires reviewed hashes, stopped writers and verified backup; it is implemented/tested only on synthetic fixtures. No real DB was opened or backed up. Real application and restore require separate authorization; generated backups are excluded from Git.

## Historical milestone notes

These dated snapshots retain earlier evidence. Their test counts, deferred-art claims and next-step instructions are superseded by the current status and audit correction guide above.

Current token art state (2026-10-01): all 105 single/combined/full-circle PNGs are shipped; four-piece rewards and character completion show full circles. Hellfed Marq square artwork was edited into a circle with transparent exterior; other six full circles are unchanged. The token artwork guide records the built-in edit prompt, source mapping and durable attachment behavior. Permanent badge core/profile/level-up are implemented with Selene; audited backfill is complete offline; six artworks remain pending. Full224/224 tests and refreshed preflight pass; no real DB/Discord changes. Next review the full command registry, obtain badge artwork and resolve balance/operational/live gates.


Current badge state: [permanent badge guide](docs/badges.md) is authoritative. Task9a core and Selene first artwork implemented; 9b audited recompute/backfill is complete offline; six other badge artworks remain pending. New fourth migration creates permanent BadgeOwnership; guarded storage now requires all four groups for complete. Current disk/WAL rehearsal covers all four migrations and permanent ownership; older three-migration evidence is historical. New /badges view and /badges leaderboard share rendering with /user and level-ups; unowned = question mark, owned without emoji = medal, Selene resolves server emoji by name. Last full224/224; no real migrations, Discord registration or emoji verification. Keep all flags disabled. Offline full command registry review is complete. Exact next: resolve balance/server settings, then authorized live acceptance.


Badge emoji access update: [access guide](docs/badge-access.md) verifies Discord guild emoji role restrictions and implements seven independent cosmetic access roles projected from permanent ownership. Config enabled=false/all role IDs null; no live emoji/role changes. Explicit setup allows each badge role plus dedicated managed bot role for embeds. Post-commit gameplay and year-round badge/profile/leaderboard/level-up views reconcile roles; permission/channel-overwrite validation fails closed, errors preserve ownership. Four mocked tests; no new schema/dependency/gameplay odds/version. Next configure/test Selene first on the verified development server; permanent disk recovery and live acceptance gates remain. No periodic/member-join worker: rejoining repairs on next view/level-up/action.

## Task 9b — audited badge reconciliation (2026-10-01)

Complete offline on `feature/S-1-spooky`. `/spooky-admin recompute-badges player confirm:true reason` reconciles one existing event-registered participant's inventory with permanent ownership. Fresh admin/guild authorization, explicit confirmation and a private reason are required. The request is bound to its interaction ID; changed requests fail and replays return the committed receipt. Valid registration must fall inside October. Unknown pieces or invalid quantities reject the entire operation. This is a per-player backfill, not a bulk server scan or forced badge grant.

All four owned positions make a character eligible. New ownership, badge ledger, zero-delta reconciliation audit and public completion outbox commit together; finalization failure rolls all of them back. Only newly awarded badges queue big public completions mentioning the owner; repair reasons remain private. Already-owned badges survive missing quarters. Reconciliation is allowed while play is disabled/paused and after closure/archive, but not before opening. It does not reopen redemption or alter candy, Eyes, fate, quarters, prestige, event archive or frozen winner proof.

Private player inspection includes permanent ownership IDs, source event and award time even if seasonal participation no longer exists. Development reset verifies ownership before/after in its root transaction, records `badge_preservation` evidence, retains wallet and audit, and cancels pending recompute announcements. In-flight/uncertain announcements retain the existing inspection policy. Replaying an old reset cannot delete a newly registered participant. Admin grants and recomputes reconcile configured emoji-access roles after commit; role API failures leave durable ownership intact. Access remains disabled with null role IDs.

Changed: services/spooky/admin-badges.js (new), services/badges.js, services/spooky/admin.js, admin-controls.js, admin-command.js, admin-runtime.js, scripts/spooky-preflight.js, tests/spooky-admin.test.js, tests/spooky-admin-badges.test.js (new), preflight report and current documentation. No new schema, dependencies, gameplay version or odds. Verification: full suite 220/220 passed; the six-test badge-administration file subsequently passed, including one additional controller/replay test not present in that full run. Static preflight passes with eight player/thirteen admin subcommands plus /badges. No real database or Discord access, registration, migration or deployment occurred.

Permanent disk/WAL recovery now covers all four migrations, actual badge ownership and seasonal-reset retention. Offline full command registry review is complete. Exact next task: resolve launch settings and balance; obtain six remaining badge artworks, configure dedicated development access roles/Selene emoji permissions, settle balance and reminder/winner settings, and perform authorized live acceptance. Task9 overall remains open for live verification/artwork; the permanent disk recovery coverage gap is closed. Existing balance targets remain unmet; approved version4 is unchanged. All event/reminder/winner/access flags stay disabled.

## Permanent badge disk recovery — 2026-10-01

Complete offline on `feature/S-1-spooky`. The synthetic-only disk/WAL rehearsal now applies all four migrations, earns Selene through the real collection service in an economy transaction, and snapshots the independent BadgeOwnership table alongside seasonal state. Baseline and populated restore match full schema/data/index/AUTOINCREMENT hashes. Ownership IDs, source event and award time survive restore. Replaying the restored operation returns its stored receipt without awarding again. The actual admin development reset retains ownership, badge ledger and bank/fate balances, while preserving an uncertain announcement for inspection.

Removing the three seasonal schemas preserves permanent ownership. The fourth migration's destructive down is exercised separately only on generated synthetic storage to prove full schema rollback preserves preexisting User/server data; it is never a seasonal reset. All four can reapply cleanly. Cleanup is verified after interruptions at baseline backup, populated backup and restored badge/reset, plus parallel isolated runs. No real target/path arguments are accepted, no Discord calls occur, and no destructive production/development CLI was added.

Changed scripts/spooky-storage-rehearsal.js, tests/spooky-storage-rehearsal.test.js and docs/spooky-storage-rehearsal-results.json, plus README/AGENTS/current guides/checklist. The report includes four migration hashes and explicit badge restore/replay/reset/seasonal-schema retention evidence. No migration source, dependencies, odds, version4 or activation settings changed. Existing balance targets remain unmet, six badge artworks and live configuration/permission verification remain pending. All event/reminder/winner/access flags stay disabled.

Exact next task: review the full Discord command registry offline, including /badges and the thirteen /spooky-admin subcommands, for duplicate names, invalid definitions and unintended legacy command removal before any bulk registration. Then resolve approved balance and server settings, supply six badge artworks and configure/test Selene access on the development server as part of authorized live acceptance. No login, registration, real migration or deployment occurred in this task.

Recovery validation: focused disk rehearsal 3/3 passed; full npm test 221/221 passed; two changed JavaScript syntax checks and README diff whitespace check passed. Saved report confirms integrity ok, zero foreign-key violations and all generated temporary files removed.

## Full command registry review — 2026-10-01

Complete offline on feature/S-1-spooky. See [registry guide](docs/command-registry-audit.md) and docs/command-registry-audit-results.json (paths are relative to repository root). scripts/command-registry-audit.js validates all working-tree command definitions against local HEAD with inert substitutes for global models and execution-only imports. No credentials, DB, Discord or interaction execution. Thirteen active commands; three disabled files; no duplicate/invalid definitions or missing active HEAD commands. Deleted Halloween command was already commented out. Additions spooky/spooky-admin/badges plus preexisting Winter throw/slots are preserved. The report records definitions, hashes and baseline commit; full registry runtime handlers and server-only commands remain live acceptance work. Bulk PUT is still a replacement: compare live guild commands before registration.

Changed: new audit script, tests/command-registry-audit.test.js, registry guide/report, scripts/spooky-preflight.js, refreshed preflight report and current docs. Existing loaders, game config/version4/odds/schema/dependencies and disabled flags are unchanged. Next resolve launch settings and unmet balance targets with the user; then authorized development live registry/migration/interaction/access/recovery acceptance. Six badge artworks remain pending. Nothing was registered, deployed or migrated into real storage.

Registry validation: focused audit tests 3/3 passed; full npm test 224/224 passed; three changed JavaScript syntax checks, static preflight and README whitespace check passed.
