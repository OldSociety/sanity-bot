# Spooky 2026 rules specification

For actual implementation, changed files, known bugs, and the exact next task, read the [current handoff](spooky-handoff.md). This specification describes intended rules; it does not imply commands already implement them.

Status: confirmed core specification, 2026-10-01. Tasks 1–8, 10–17 and 18a/18b worker/18c1 snapshots/18c2 awards are complete offline and gameplay is wired in source. The event remains disabled; real migrations, Discord registration and live acceptance have not occurred. Task 16 admin tools are complete offline/source wired; Task 20a development acceptance/storage preparation is complete; 20b status/backup/apply and 20c scoped offline preflight are complete; live acceptance is next; permanent badge artwork/integration remains pending. Remaining decisions are tracked below. Branch verified: `feature/S-1-spooky`.

This document is the implementation reference for the core. Historical audits explain the reasoning but do not override this specification. Do not infer approval of an unresolved value from its presence here.

## Confirmed economy and participation

Task 6 implementation choice: first economic access starts the candy clock, with 10 candy and no catch-up. Registration reuses any materialized row. Below capacity keep partial intervals; on reaching/sitting at capacity discard surplus and reset anchor to access time before spending. Accrual is lazy, so no periodic refill worker is needed for correctness. Pause blocks registration but refill maintenance continues; disabled/inactive/archived events reject new participant mutations. Wired through the command runtime in source; not live validated.

- Anyone in the server may participate, including administrators. Registration tracks event participation; no role is required to join.
- Candy is action energy. Natural generation is 80/day, balance capacity 80. There is no daily action ceiling. Candy gifts, theft, and losses affect total possible actions.
- Start with 10 candy. Regenerate 10 every three elapsed hours, capped at 80. Eight refill intervals provide up to 80 natural candy per 24 hours. Persist the refill anchor and credit whole elapsed intervals; time spent full cannot become an invisible surplus. Apply only eligible event time. First registration reuses any already-materialized nonparticipant balance.
- Candy accrual stops at capacity, with no hidden surplus available immediately after spending. Materializing a nonparticipant's balance and later registering must not grant starter candy twice.
- Evil Eyes are a separate collection currency. Whenever a registered player reaches five Eyes, automatically debit five and grant a random quarter in the same transaction. Repeat for multiple groups in a batch. No manual redemption, Eye shop purchase button, or hard daily draw limit. Four quarters/20 Eyes per day is a balancing aspiration, not an enforced maximum or a guarantee.
- Ten **banked** fate points purchase an additional ordinary random quarter, with no daily draw limit. The latest explicit bank-only rule replaces earlier proposals to combine bank and unbanked fate. Insufficient bank means no purchase even if unbanked fate exists. Any registered player with sufficient banked fate may purchase; no Unwanted/admin restriction (confirmed 2026-10-01).
- Quarters and permanent badges cannot be stolen. Theft transfers equal resource quantities; finds/minted gifts are distinct ledger operations.
- Returning to the game means retaining its playful outcome families, not replacing them with collection-only mechanics.
- No newcomer catch-up. Automatic duplicates and earned badges are not rewards requiring repeated check-ins to claim.

## Normal action selection — confirmed

Select one mutually exclusive normal outcome. Never independently roll an Eye reward on top of another outcome. Legacy curses may replace the normal action first as specified below. Eligible-target and mutation failures are not extra random outcomes or excuses to mint resources.

| Treat | Probability | Existing/new mechanic |
| --- | ---: | --- |
| Lost candy | 20% | Action candy is lost |
| Sweet Tooth | 5% | Retain legacy random role/generosity; final winner titles are separate |
| Double gift | 15% | Give two candies to a recipient |
| Temporary immunity | 10% | Protect giver and recipient from theft for one hour |
| Break curse | 5% | Retain curse removal/backfire/fallback behavior; one-candy cost confirmed |
| Standard gift | 32% | Give one candy to a recipient |
| Find Evil Eye | 13% | Mint +1 Eye to the caller |
| Total | 100% | |

| Trick | Probability | Existing/new mechanic |
| --- | ---: | --- |
| Steal | 25% | Transfer one candy from another player |
| Great Heist | 10% | Transfer one candy each from up to three eligible funded players selected randomly |
| Reverse nickname | 10% | Reverse a target nickname with safe restoration/lifecycle rules |
| Curse target | 5% | Apply the cursed role/effect |
| Curse backfires | 5% | Curse the caller |
| Caught stealing | 32% | Action fails; candy is spent |
| Evil Eye | 13% | Transfer one Eye from a valid funded target; if no valid funded target exists, mint +1 Eye to caller |
| Total | 100% | |

Every action spends its approved candy cost regardless of successful theft. Every action costs exactly one candy, including break-curse and cursed distributions (user confirmed in Task 11). No extra delivery charge. The legacy free theft/heist behavior is a bug relative to this rule. No-target handling must be determined before charging or given a documented paid fallback. Invalid permissions or a failed transaction must not produce an Eye-find fallback.

## Curse behavior — confirmed carryover

Task 13 user confirmations: curse and reversed nickname persist until broken or October end; Sweet Tooth keeps its legacy random role award; temporary immunity shields both giver and recipient from theft for one hour. All effect handlers and restoration are implemented offline and wired in source. Sweet Tooth remains the random gameplay role; final competition titles are distinct, with names/IDs pending.

- A cursed caller has a 10% chance that their normal action is replaced by a curse action. Otherwise use the normal table.
- Cursed treat replacement: 20% spread curse to a recipient, 80% distribute candy to up to three recipients. Across all cursed treats these occur at 2% and 8% respectively.
- Cursed trick replacement: distribute candy to up to two recipients; 10% of all cursed tricks.
- A normal 13% Eye outcome therefore occurs on 11.7% of cursed actions. The user explicitly accepts this reduction.
- Preserve cursed messages: 20% transformation chance, split equally between reversed text and shuffled words. Repair safe delivery/attachment handling and scope rather than silently discarding the mechanic.
- Effects preserve the first original nickname on repeat hits, restore only bot-applied current nicknames, and remove only bot-owned curse roles. Durable cleanup/reconciliation is implemented; startup/scheduled maintenance remains Task 18.

Candy distribution accounting must use actual recipients; never subtract three if only one is credited. Distributions spend only the one action candy; there is no additional caller charge for delivered gifts.

## Collection — confirmed

Seven characters: Hadley (`had`), Hellfed Marq (`hfm`), Marq (`mrq`), Maxim (`max`), Niklaus (`nik`), Qam (`qam`), Selene (`sel`). IDs use stable character and position keys, for example `had_tl`; display names can change without changing IDs.

| Position | Rarity | Color |
| --- | --- | --- |
| tl | Common | Blue |
| tr | Common | Blue |
| bl | Rare | Purple |
| br | Legendary | Gold |

Ordinary rarity weights are approved by the user on 2026-10-01: 70% common / 22% rare / 8% legendary (approved in version 2; current configuration version 4). Each rarity has uniform piece selection unless another selection policy is explicitly agreed. Exchange selection is always uniform across missing piece IDs, independent of ordinary rarity weights.

On each acquisition, retain the first copy and count later copies as extras. At five extras across any pieces, automatically consume exactly five and grant one uniformly random unowned piece. This has no daily limit, extra cost, or manual confirmation. Repeat if a batch creates multiple groups. Save acquisition, exchange, and eligibility state atomically; send one coherent result after commit. At full collection, retain extra copies and stop missing-piece exchange; this conservative terminal behavior avoids destroying inventory without an agreed replacement reward.

Four pieces of a character qualify for permanent badge ownership exactly once. Seasonal reset never removes earned ownership. One permanent service/render interface is implemented for `/badges`, profiles, optional level-up display, and future events. **The user has now supplied token combinations and authorized token image integration.** Cumulative images for every nonempty subset, including seven full circles, are implemented. Permanent ownership/service, /badges, profile and level-up rendering now exist with Selene as the first custom emoji. Audited eligibility recompute/backfill is complete offline; six artworks remain pending. Acquisition and badge ownership commit together; claim unlocked only from the committed badge receipt.

## Event and presentation — confirmed

Task 15 visibility correction from user: effects involving another player are public, registered targets are tagged, nonregistered targets are public without pings. Solely personal screens/actions may be ephemeral. Quarter rewards and full-character completion are prominent public notifications. Permanent badge announcements wait for actual badge integration/artwork; inventory completion alone must not be called an awarded badge.

- Event is October in local Pacific time (`America/Los_Angeles`); include all of October 31. Proposed implementation interval is October 1 00:00 inclusive to November 1 00:00 exclusive. Fixed UTC-8 has not been requested as a correction to the local-Pacific interpretation.
- Model UPCOMING, ACTIVE, REDEMPTION, CLOSED explicitly. Only ACTIVE allows actions/regeneration/acquisitions. No post-October redemption: the redemption interval is zero, and normal play closes after October 31. Permanent ownership survives closure. Task 18a startup/minute maintenance is source wired: expired effects restore, CLOSED sets archivedAt once and preserves seasonal inventory/wallet/scores/history. This marker does not claim final titles/badges were awarded. Disabled runtime does not start maintenance or automatically clear old effects; metadata corruption fails safely for inspection. See the [lifecycle guide](spooky-lifecycle.md).
- Randomize tricks and treats where appropriate. Specific treat targeting is not a launch requirement. One-hour theft protection is confirmed. Registered players may be Eye theft targets without an additional recent-activity or daily-loss restriction; protection still applies. Candy theft may target any eligible human in the server, registered or not. Do not silently exclude admins from ordinary play.
- For unregistered candy victims, credit the transferred candy and identify its source using a plain-text name without pinging or enrolling them. Economic eligibility excludes bots/self and protected victims where applicable. Refill/materialize the victim's actual default candy before transferring; do not mint a theft reward without its matching debit.
- No nonparticipant mentions in game messages. Recruitment reminders may mention configured Resident roles in the fuckery channel every three Pacific calendar days. Task 18b worker is source wired with strict role-only mentions, latest-only downtime handling and guarded durable outbox. Operational config remains disabled with channel/roles/local time pending user input; no real reminders sent. See the [reminder guide](spooky-reminders.md).
- Private welcome/help/status/collection and solely personal action receipts follow the supplied BloodHunter style; other-player actions are public under the mention rules above. Automatic quarter reveals and eventual badge announcements should be prominent and bold. Quarter reveals are public reward embeds, not native unsolicited dialogs. Actual command definitions must match README and the final announcement.
- Admin tools inspect player/config/ledger, correct balances, grant/remove pieces, recompute badges, clear effects, pause actions, and reset only development seasonal state. Corrections require authorization, reason, and replay-safe ledger entries.

## Fate and prestige — implemented; final awards pending

Current Task 14 policy: Sweet Tooth +1 existing bank for Unwanted/cap 100 is implemented offline. User approved scoring v1: success +2, lost/caught -1, curse override +1; other no-effect 0. Separate tracks, admins eligible, shared ties, one winner may lead both; only players acting in a track qualify. Sweet Tooth remains random gameplay role; final distinct winner title names/role IDs are pending. Exact scores are private audit data, not player-facing rules. Config version 4; command UI is wired in source, final awards remain Task 18.

Confirmed fate reward: the 5% Sweet Tooth treat outcome also grants **+1 banked fate** to an Unwanted-role caller, capped at 100. No independent fate outcome/roll. Retain its thematic Sweet Tooth effect; other participants can still roll that effect without fate eligibility. The curse override makes this 4.5% of all cursed treats. A full bank receives no credit. The reward and ledger update are implemented in the action transaction.

Separate seasonal scoring and category tracking are implemented. Only final title names/role IDs and lifecycle award delivery remain pending. Sweet Tooth is the legacy random role and does not identify the final treat winner.

## Follow-up decisions by implementation task

| ID | Decision | Status | Relevant task |
| --- | --- | --- | --- |
| D1 | Starter candy/refill cadence | Confirmed 10 start, +10/3h, capacity 80 | 3/6 |
| D2 | Exceptional curse costs | Exactly one for every action; no exceptional costs, confirmed Task 11 | 11/13 |
| D3 | Fate bonus integration/amount | Confirmed +1 bank on Sweet Tooth, Unwanted only, cap 100 | 14 |
| D4 | Eye acquisition | Confirmed automatic conversion at five; no hard daily limit | 7 |
| D5 | Fate purchase debit | Confirmed bank-only, ten per quarter; any registered bank holder eligible | 10 |
| D6 | Protection and targeting | Confirmed one hour; no Eye recency/daily loss limit; any eligible human for candy theft | 12/13 |
| D7 | Shield recipients and other-effect immunity | Confirmed giver and recipient, one hour, theft protection | 13 |
| D8 | Full collection extras | Retain without exchange; no unapproved replacement reward | 8 |
| D9 | Redemption | Confirmed no post-October redemption | 18 |
| D10 | Ordinary drop weights | User approved 70/22/8 on 2026-10-01; approved in version 2; current version 4 | 3/7/17 |
| D11 | Legacy roles/effect lifetimes | Curse/nickname until broken or October end; retain random Sweet Tooth, distinct winner titles | 13/14 |
| D12 | Prestige | Approved v1 +2/−1/+1/0; admins eligible, shared ties, one player may win both | 14/18 |
| D13 | Rare recipient Eye gifts | Deferred: absent from locked table; do not add implicitly | 11 |

D13 is deferred unless the user approves attachment to an agreed outcome without silently changing total Eye supply. The latest locked treat table otherwise grants its Eye only to the caller. Table totals do not permit simply adding a new branch.

Core effect, rarity, scoring and admin repair policies are confirmed and implemented offline. Task 17 has evaluated balance; the casual/regular targets conflict with current action budgets and stealable Eye accumulation. See the [population balance report](spooky-population-balance.md) before any adjustment. Approved config remains version 4 unchanged. Remaining work includes balance decisions, lifecycle awards/reminders, deferred art/badges and live acceptance. See the handoff for exact next steps. Routine implementation choices (IDs, transaction structure, persisted receipts) do not require new approval.

## Validation performed

Treat table: 20 + 5 + 15 + 10 + 5 + 32 + 13 = 100.
Trick table: 25 + 10 + 10 + 5 + 5 + 32 + 13 = 100.
Natural refill arithmetic: 24 / 3 × 10 = 80 candies per day before cap waste; starter supply is 10 separately.
Curse Eye arithmetic: 0.90 × 0.13 = 0.117.
Last full implementation suite: 211/211 tests pass, including nine storage tooling, three storage rehearsal, fourteen winner award, seven winner snapshot, eleven reminder, seven lifecycle and two population simulation checks, 26 administrator and eight resolution tests; eight Task 18c2 JS syntax checks pass. Task 17 runs eight seeded scenarios with 40 guilds each; resource conservation and actual SQLite service parity are verified. Its hashes record that source snapshot; later cleanup and reminder safety changed without changing balance. Real database migrations and Discord deployment have not occurred. Simulation proves neither release readiness nor achievement of the desired balance; see the report/handoff for limits.

Final results are now frozen once at CLOSED, atomically with cleanup/archive. Only actual scoped October actors qualify per track; shared ties/admins/both titles are preserved and empty tracks award nothing. Ledger evidence must reconcile with stored scores. The implemented title delivery worker consumes this proof without recomputing; title configuration/activation remains pending. See [winner guide](spooky-winners.md). New prestige participant IDs disambiguate reset generations; legacy timestamp fallback has same-time ambiguity. Current gameplay odds/config version 4 remain unchanged.

Final title settings are separate disabled operational configuration, with distinct names/role IDs and explicit announcement channel. Final awards enqueue exactly once per event/guild after snapshot/archive; shared ties and both-track wins use separate role intents. Changed configuration blocks delivery and never rerolls/requeues. Public announcements hide scores and allow only frozen winner mentions; empty tracks announce no qualifying players. Permission failures retry desired state; ambiguous sends require administrator evidence/recovery. Sweet Tooth remains the random gameplay role. No old title-role removal/next-year rollover policy is implemented. Gameplay rules/balance remain version 4.

Task 20a adds synthetic storage recovery evidence and a [development acceptance runbook](spooky-development-acceptance.md), not a rule change or real migration. WAL-consistent backups restore receipts and unresolved queues; schema down intentionally destroys seasonal data and is distinct from archive. Real migration tooling/live acceptance, operational settings, balance choices and badge artwork remain pending.

Task 20b1 adds development-only read-only schema status and exclusive verified backups without gameplay changes. No real database operation or automatic tracker adoption occurred. See [storage tools](spooky-storage-tools.md); migration plan/apply/tracking is now complete offline and live acceptance remains unperformed.

Current token art state (2026-10-01): all 105 single/combined/full-circle PNGs are shipped; four-piece rewards and character completion show full circles. Hellfed Marq square artwork was edited into a circle with transparent exterior; other six full circles are unchanged. The token artwork guide records the built-in edit prompt, source mapping and durable attachment behavior. Permanent badge core/profile/level-up are implemented with Selene; audited backfill is complete offline; six artworks remain pending. Full211/211 tests and refreshed preflight pass; no real DB/Discord changes. Next obtain badge artwork and resolve existing balance/operational/live gates.


Current badge state: [permanent badge guide](badges.md) is authoritative. Task9a core and Selene first artwork implemented; six other badge artworks and9b audited recompute/backfill remain pending. New fourth migration creates permanent BadgeOwnership; guarded storage now requires all four groups for complete. Historical three-migration disk rehearsal remains seasonal-only and needs extension before live acceptance. New /badges view and /badges leaderboard share rendering with /user and level-ups; unowned = question mark, owned without emoji = medal, Selene resolves server emoji by name. Last full211/211; no real migrations, Discord registration or emoji verification. Keep all flags disabled. Exact next:9b audited reconciliation/inspection/reset evidence and permanent disk recovery rehearsal, then reviewed command registry/balance/server settings/live acceptance.
