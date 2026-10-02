# Spooky expanded design audit

**Historical analysis, not a continuation specification.** Later human decisions supersede proposals below, including manual redemption, hard draw caps, fate funding, and badge timing. Use the [current handoff](spooky-handoff.md) and [rules specification](spooky-rules.md) for current constraints, implemented work, and next steps. Existing simulation results do not validate the final population economy.

## Latest first-pass probability and candy specification

These user-supplied tables supersede prior candidate Eye payouts and independent Eye bonus rolls. They are agreed inputs for the next simulation, not implemented gameplay. Exactly one normal outcome is selected per action. Legacy curse overrides remain a separate 10% replacement layer; for a cursed caller the normal 13% Eye branch occurs on 11.7% of all actions, which the user accepts.

| Treat outcome | Probability |
| --- | ---: |
| Lost candy | 20% |
| Sweet Tooth | 5% |
| Double gift | 15% |
| Temporary immunity | 10% |
| Break curse | 5% |
| Standard gift | 32% |
| Find an Evil Eye (+1 Eye) | 13% |
| Total | 100% |

| Trick outcome | Probability |
| --- | ---: |
| Steal | 25% |
| Great Heist | 10% |
| Reverse nickname | 10% |
| Curse target | 5% |
| Curse backfires | 5% |
| Caught stealing | 32% |
| Steal/find an Evil Eye | 13% |
| Total | 100% |

Candy: **80 newly generated naturally per full day, balance capacity 80**, rather than an 80-action daily limit. Candy earned/lost through gifts, theft, or effects changes action supply; there is no separate fixed action ceiling. At capacity, refill cannot credit more until candy is spent. Refill timing and starter balance remain undefined; choose a continuous accrual rate or explicit intervals before implementing. Continuous accrual would be 80/24 candies per hour, with integer credits and a persisted time anchor. Do not assume the old three-hour schedule or unlimited credit bank while full.

2,480 is the full-month theoretical natural candy supply (80 × 31), not a guaranteed action count. Starter candy, refill waste, legacy multi-candy costs, and transfers must be reported separately. Candy spending and action count are distinct. All actions must spend candy, including successful steals/heists; the legacy code currently does not charge those successes.

Locked trick resource rules:

- Steal (25%): transfer one candy from another player to the caller.
- Great Heist (10%): transfer candy from multiple players as before: up to one candy each from three eligible funded targets. Preserve that mechanic while correcting the legacy nonrandom target selection.
- Evil Eye (13%): transfer one Eye from a valid funded player. If nobody has an Eye available among valid targets, find one Eye instead.
- Candy and Eye theft debit and credit equal amounts in one transaction; theft never creates either resource. Finding is explicitly recorded as minting.
- Each action spends candy independently of its outcome. Candidate action-cost details still need specifying for legacy exceptional costs.

All resource choices above are confirmed. Target eligibility, protection, victim loss limits, and action costs still require exact configuration. Resolve eligibility and funding transactionally; if a candidate is exhausted by a concurrent operation, re-evaluate valid targets before choosing the no-available-Eye find fallback. A failed permission check or database operation must not itself turn into a minted Eye reward.

Theoretical natural-supply play gives 322.4 Eye outcomes at 13% before curse overrides, transfers, costs, fate purchases, and refill waste. Treat Eye outcomes mint; trick Eye outcomes transfer whenever valid funded targets exist and mint only on the no-target fallback. Therefore 322.4 is not an estimate of newly created Eyes for a mixed population. A 13% trick Eye outcome is no longer a separate very-rare roll; the supplied table supersedes that earlier wording. Simulate the population together to measure the actual supply, recipient gains, victim losses, protection effects, and draw timing.

The existing 5% treat-only fate bonus remains an agreed policy from earlier discussion, but how it fits a one-outcome table is unresolved. Do not silently add an unrelated bonus roll to failed treats or increase table totals. Decide whether it is a coherent secondary benefit of a specific successful treat outcome or a separate outcome funded by reallocated probability. The prohibition on independent Eye rolls is explicit; the fate integration must also be clearly described in help/config.

2026-10-01. Branch verified: `feature/S-1-spooky`. Planning and simulation only; no further gameplay code, deployment, emoji upload, reminder scheduling, or database changes. This audit supersedes conflicting proposals in `spooky-redesign-plan.md`. The previously enabled legacy command still contains the defects described in `spooky-audit.md` and is not launch-ready.

## Authoritative gameplay correction

The user clarified that this is **last year's game with tokens and permanent badges added**, not a replacement built around collection. Preserve the playful trick/treat outcomes, including cursed text and nickname/role effects, while repairing their known bugs and making their lifecycle reliable. The earlier suggestions to replace the game with only stealing/protection or defer its signature effects are superseded. Collection supplements the social game; it is not the sole reason to participate.

- Both tricks and treats consume candy.
- Treats are the main source of Evil Eyes. More treating generally means more Eyes. A rare treat outcome may also award another player an Eye. Distinguish minting a gifted Eye from transferring the caller's existing Eye in configuration and ledger entries.
- Tricks very rarely mint an Eye directly and more often attempt to steal existing Eyes. Trick theft remains zero-sum. Quarters are never stolen.
- Protection is one treat benefit alongside the carried-over outcomes, not the complete definition of treats.
- Casual players should typically finish approximately one or two character badges; regular/mid-engagement players approximately four.
- All seven should be a very unlikely high-engagement achievement, requiring approximately **87.5% of the candy earned over the full event to be spent**. This is a design target, not a completion probability or a guarantee from spending that amount.
- No new player catch-up and no implicit promise that every player can complete the set.

This correction invalidates the equal-one-Eye-per-action assumption as a proposed game economy. The cohort tables below remain reproducible diagnostics of a discarded baseline, not forecasts of the intended game. Do not use them to select final reward amounts without a new simulation.

### Revised balancing work required

First inventory the legacy outcome families and retain their thematic purpose, then assign candy costs, Eye minting/transfer amounts, protection, temporary-effect duration, and prestige deltas explicitly. Sweet Tooth, temporary immunity, curse breaking/spreading/backfire, gifting, theft/heist, nickname reversal, and cursed messages all require review. Preserve the fun without preserving unreachable outcomes, misleading probabilities, unsafe message handling, or permanently stuck effects. Any replacement of a legacy outcome needs an explicit design decision.

Simulate a interacting player population with treat-heavy, mixed, and trick-heavy strategies for every activity cohort. Eye theft redistributes progress rather than creating it, so isolated player draw calculations cannot model these strategies correctly. Treat gifts can help another player's progress and must be included in recipient accounting. Include full and empty target balances, protections, no-target outcomes, late joiners, missed days, and fate purchases.

Measure candy utilization separately from visit frequency and action count. Proposed utilization denominator: starter candy plus all natural regeneration actually credited during the event, with time wasted at cap reported separately; also report total theoretical natural supply so cap waste does not make low activity appear highly engaged. Do not count stolen candy or admin corrections as natural earnings. Final denominator definition needs agreement before claiming the 87.5% target has been met.

For each cohort, report badge-count distribution (not only averages), milestone timing, Eyes minted/gifted/stolen/lost, duplicate exchanges, fate spending, and candy utilization. Compare 75%, 87.5%, and 100% utilization directly. Determine how often all-seven completion occurs at each level and for each action mix. "Very unlikely" still needs a numerical probability target; 87.5% utilization alone does not define one.

Extra fate-funded draws can bypass the activity target. Keep the user's bank-first extra-purchase rule in simulations, but explicitly report how starting fate changes completion at low activity. If high fate balances let players obtain all seven without spending most candy, the two goals conflict and require a deliberate tradeoff rather than a hidden adjustment.

Uniform five-extra exchanges strongly accelerate completion after duplicate accumulation. Tune ordinary acquisition rate and distribution of early character completion together; do not weaken or silently rarity-weight the confirmed exchange rule. A featured-character/first-badge guarantee is only an optional proposal, not an adopted rule.

## Where the design stands

The core loop is coherent: regenerate candy, spend candy on tricks/treats, earn Evil Eyes, purchase collectible quarters, automatically turn five extra copies into a missing quarter, and permanently unlock character badges. Tricks offer theft; treats offer defense and rare fate bonuses. A separate seasonal prestige competition can reward the two event titles without controlling collection progress.

Confirmed collection manifest: seven characters, four pieces each; `tl` and `tr` common/blue, `bl` rare/purple, `br` legendary/gold. Piece IDs remain stable. Ordinary draws cost five Eyes. The desired Eye-purchase pace is four draws/day, but enforcing a hard limit versus merely balancing toward that pace is still unresolved. Ten-fate purchases spend banked fate first and provide additional draws outside the Eye limit. Quarters cannot be stolen. The latest correction makes Eyes the theft currency; candy theft remains an earlier suggestion requiring a decision, not an implemented mechanic.

Anyone can play, including admins. Registration is participation tracking and onboarding, not role-based access control. Unwanted-role eligibility applies only to the treat fate bonus. No newcomer catch-up. Badge art is not a prerequisite for saving ownership.

## Automatic duplicates: exact semantics

On every ordinary draw, fate purchase, or applicable admin grant:

1. Add the awarded piece to inventory. If its ID is already owned, the newly added copy is an extra.
2. Count extras across all pieces; different characters and positions can contribute.
3. If at least five extras exist and a missing piece exists, consume exactly five extras, keeping at least one copy of every owned ID.
4. Uniformly select one missing piece ID across all rarities, grant it, and resolve newly completed characters.
5. Repeat for any additional groups of five arising from a batch acquisition. A normal single acquisition from four extras leaves zero after exchange. An admin/batch operation can leave a remainder; do not discard it.
6. Commit acquisition, consumption, exchange award, and badge ownership together. Show the quarter and automatic exchange in the private result after commit.

There is no exchange button, cost, cooldown, daily limit, or player-selected recipe. Remove those manual exchange flows from the earlier plan. Inventory must still record which exact five extras were consumed, using a deterministic selection order, even if the player sees a single duplicate counter.

An exchange can never award a duplicate because it samples missing IDs. If all 28 pieces are owned, no valid missing piece exists. Recommended terminal behavior: retain subsequent extras, mark collection complete, and stop exchange; do not silently reset them or invent a replacement reward. Confirm the eventual use of those extras if desired.

"Popup" should mean the private quarter-result embed/follow-up in the interaction that caused the exchange. A bot cannot independently open a native Discord dialog for an absent user. Admin corrections can report to the administrator and leave a durable notification for the player on next access. Private message delivery failure must not roll back a successfully committed reward.

## Candy regeneration and visit frequency

A periodic candy worker was originally proposed to write refills automatically. It is optional if candy is derived from stored balance and elapsed eligible time whenever state is read or mutated. A player receives accrued candy even if the bot was offline, without needing to visit each refill interval. Persist a refill anchor, apply it atomically, cap the result, and discard time accumulated while already full. Do not create an unlimited hidden reserve at the cap.

If everyone has candy by default, there is no need to pre-create rows for every guild member. A nonparticipant can have a virtual capped balance based on the event's default start rule; a row is materialized only on first action or actual theft. Onboarding must reuse that balance rather than giving a second starter allocation. Decide whether nonparticipants accrue from event opening or guild entry and whether participants start full.

There is still value in a background job for event transitions, safe effect expiry, role delivery retries if ever used, reminders, and a final announcement. Candy workers, reminder workers, and maintenance workers serve different purposes. None has been scheduled in this audit.

Proposed candidate to test: capacity 40, start 20, refill 20/day continuously, one candy/action. This accommodates several 5–10-action visits or one large daily visit, with roughly two days of storage. A capacity of 60 would allow roughly three days of storage. Larger capacity helps busy people but does not increase daily generation or award catch-up. It also magnifies theft exposure if candy theft is retained. Actual numbers require approval and simulation; the current code implements none of them.

## Cohort simulation: baseline evidence

Reproducible script: `spooky-cohort-simulation.js`; full outputs: `spooky-cohort-results.json`. Seed 20261002, 5,000 trials/profile. Assumptions: 20 starter candy, capacity 40, 20/day discrete refill, one Eye/action, five Eyes/draw, at most four Eye draws/day; 70% common / 22% rare / 8% legendary, uniform pieces within rarity; automatic five-extra exchange. These are candidate settings, not the final action tables. Daily refill approximates continuous accrual. Late joiners receive the ordinary starter balance but no missed-day credit.

The model has no interacting population, theft, protection, fate purchases, prestige, or activity targeting. Its zero theft loss is an input, not evidence that theft is harmless. Fate purchases would accelerate completion, especially for players with high starting balances. It continues ordinary purchases after full completion to expose surplus duplicates.

Milestone cells show **percentage reaching the milestone by October 31 / median October date among those reaching it**. Conditional dates must not be mistaken for an outcome achieved by every player.

| Profile | First quarter | First badge | Three badges | Seven badges |
| --- | --- | --- | --- | --- |
| Casual: 3–4/day, six missed days | 100% / Oct 2 | 16.56% / Oct 26 | 0% / — | 0% / — |
| Regular: 6–10/day | 100% / Oct 1 | 100% / Oct 16 | 94.98% / Oct 25 | 4.54% / Oct 30 |
| Engaged: 20/day | 100% / Oct 1 | 100% / Oct 6 | 100% / Oct 10 | 100% / Oct 15 |
| Late Oct 10: 20/day | 100% / Oct 10 | 100% / Oct 16 | 100% / Oct 19 | 100% / Oct 24 |
| Late Oct 15: 20/day | 100% / Oct 15 | 100% / Oct 21 | 100% / Oct 24 | 96.44% / Oct 29 |

Means at October 31:

| Profile | Paid draws | Duplicates generated | Exchanges | Remaining candy | Eyes | Extras | Unique pieces |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Casual | 17.09 | 4.73 | 0.55 | 37.17 | 2.03 | 1.97 | 12.91 |
| Regular | 49.18 | 29.47 | 5.48 | 32.00 | 2.00 | 2.05 | 25.19 |
| Engaged | 124.00 | 103.83 | 7.83 | 0 | 0 | 64.68 | 28 |
| Late Oct 10 | 88.00 | 67.83 | 7.83 | 0 | 0 | 28.69 | 28 |
| Late Oct 15 | 68.00 | 47.83 | 7.79 | 0 | 0 | 8.88 | 27.96 |

Currency lost to theft: zero in every baseline profile because theft was excluded. Remaining fate is not modeled; starting fate distributions have not been provided. Event spending after completion should be an explicit choice rather than encouraged by an empty reward loop.

**Finding:** one Eye/action produces a flat early game for casual and regular players but makes completion fast for engaged players. Raising all Eye rewards makes the latter easier still. A design that improves first-badge timing separately is preferable. Options to simulate, not approved changes: let the player choose a featured character for initial ordinary draws; add a first-character completion guarantee after a bounded number of acquisitions; or provide progress toward a chosen character through treats. Preserve stable rarity/duplicate rules and disclose any such player-facing guarantees. Changing ordinary rarity weights alone will not solve this cleanly.

Next simulation must include 1, 2, and 4 daily visits; missed days; 40 versus 60 capacity; actual outcome tables; random attacker selection and victim protections; theft losses; starting fate at 0/50/100/200 combined balance; and treatment-heavy, trick-heavy, and mixed strategies. Also simulate late joiners at regular activity, not only the engaged late joiners above. Measure net resources and reward concentration across a population, plus all milestones listed above. Do not advertise completion odds from the baseline as the finished game's odds.

## Trick/treat balance and targeting

Recommendation: allow choosing a specific person for treats, with a random option as default. That creates meaningful cooperation: players can protect a friend while tricks remain random. Limit repeated protective benefits per recipient, refresh rather than stack indefinite shields, and never increase sender rewards simply for choosing the same friend. Rewards should require a paid valid action, not successful targeting of an alternate account.

Both actions need an ordinary progression reward. Tricks gain theft upside and risk; treats gain protection and the 5% Unwanted-only fate chance. Treats should remain valuable for people who cannot receive fate. For example, a shield blocking a future Eye theft has a concrete value. Whether shields protect only Eyes or also candy must follow the final theft policy.

Random tricks should choose from the outcome's eligible target pool, not choose any member and discover afterward that the action is impossible. Eye theft requires an actual funded balance, and should normally use recently active registered participants. Never create an Eye balance to supply a target. Default candy is a source only if candy theft is deliberately retained; it is not a source of Eyes. Nonparticipants can receive harmless narrative effects/invitations without being mentioned, enrolled, cursed, or having messages deleted.

No quarter theft of any kind. Permanent badges and collectible ownership are safe. Define no-target fallback before charging; it should permit solo progression without uncontrolled bonus generation. Proposed safeguards to simulate: one Eye per successful steal, a per-victim daily loss ceiling, temporary immunity, and an attacker/victim cooldown. Select randomly among valid targets rather than allowing player choice for tricks. Use a private generic label for unregistered targets and suppress allowed mentions; for public event outcomes, do not identify or ping nonparticipants.

## Fate purchases and bonuses

Confirmed: ten fate per quarter, bank first, extra draws outside Eye purchases. Recommended debit rule: combine balances if needed (for example, bank 6 + fate 4), rather than copying the current reroll code which requires ten in one balance. State both debits in the receipt. Use the same ordinary rarity table, inventory operation, automatic exchange, and badge resolution as Eye draws. Admin-adjusted fate cannot bypass interaction replay protection.

At 100 bank + 100 fate, a player could buy 20 extra quarters immediately, before earning Eyes. Existing commands normally cap those balances at 100 each, but actual data and manual practices must be checked. This intentionally makes players with accumulated fate progress faster, and should appear in simulations. Clarify whether anyone holding fate may spend it or only the Unwanted role; current fate-command usage is role restricted, while the event itself is open to everyone.

Treat fate bonus remains 5%, proposed +1 banked point, capped at 100, no overflow. Award amount and any daily ceiling are still open. A full bank gives no bonus credit; disclose this when a bonus rolls. At ten treats/day for 31 days, uncapped expectation is 15.5 points. A 100 bank permits ten quarter purchases. The reward/purchase loop must be atomic, with consistent caps and ledger entries.

## Prestige and end-of-event awards

Prestige should be separate from Eyes, quarters, and badges. Hidden precise scoring can provide surprise, but player help should explain that paid activity earns prestige, with mostly positive outcomes. Do not imply random odds are secret if they materially affect purchase value. Store the scoring version and individual score deltas so admins can diagnose and recompute fairly.

Recommendation: a general prestige leaderboard plus two separate title tracks: treat prestige for Sweet Tooth and trick prestige for Scream Supreme (name remains open). A single score cannot meaningfully pick the best treat player and best trick player without tracking action categories. Count only successful committed paid actions, bound negative outcomes, and ensure endlessly treating an alternate account does not outperform normal activity solely through target choice. Decide eligibility/ties, whether an admin can win, whether one player can win both, and whether purchased fate draws contribute. Recommended: purchases do not directly add prestige, so existing fate wealth does not purchase the event title.

Take a final snapshot and award titles once. Permanently stored badges survive regardless of prestige rank. The final announcement requires its own durable delivery status; retrying it must not repeat economy changes or title awards.

## Event lifecycle

Adopt `UPCOMING → ACTIVE → REDEMPTION → CLOSED` as explicit configured states, with UTC instants derived from local `America/Los_Angeles` boundaries. October 31 remains playable through 23:59:59 local time. October uses Pacific daylight time; fixed UTC-8 would be a different schedule.

| Capability | UPCOMING | ACTIVE | REDEMPTION | CLOSED |
| --- | --- | --- | --- | --- |
| Welcome/help/config | Yes | Yes | Yes | Yes |
| Candy regeneration and trick/treat | No | Yes | No | No |
| Eye/fate purchases | No | Yes | Optional, explicit policy | No |
| Automatic duplicate/badge resolution | Repair only | On acquisition | On allowed acquisition/repair | Audited repair only |
| Seasonal leaderboard | Preview | Live | Frozen final activity score | Archived |
| Permanent badge viewing | Yes | Yes | Yes | Yes |

The user proposed redemption but has not selected duration or whether post-October badge acquisition is allowed. This conflicts with the earlier October-only earning rule if purchases remain enabled after October. Recommended launch configuration: a zero-duration redemption stage until a grace window is explicitly agreed; retain the state architecture for future events. With automatic exchanges, redemption is not a manual duplicate cash-in phase. Normal operations should have no pending five-copy groups; repairs can resolve interrupted legacy state.

Closing archives seasonal records rather than deleting them. Admin repairs should be possible after closure with a reason and ledger evidence. Boundary checks happen inside every economy mutation, not only in a timer, so downtime cannot leave actions active past closing. A temporary operational pause is separate from lifecycle state; pausing actions must not silently stop allowed purchases or alter deadlines.

## Permanent badges and presentation

Use one permanent badge service and render function for `/badges`, profiles, level-up messages, and future events. Halloween only submits eligibility/award events; the leveling system does not contain seasonal rules. Unique badge ownership is `(guildId, userId, badgeId)`; season/source stays in award metadata. A deleted/reuploaded emoji changes rendering configuration, not earned ownership.

Implement textual placeholders and rarity emoji labels first. Later import the actual character badges as server custom emojis. The quarter images are available but badges are not yet supplied. Unknown/deleted emojis fall back to character names. Removing an inventory quarter administratively does not automatically revoke a previously earned permanent badge: eligibility recomputation reports the discrepancy; a deliberate revocation needs a separate audited policy.

Welcome explains candy, Eyes, random tricks, protective treats, draws, automatic duplicates, end date, and limited badges. `/spooky help` provides the same player rules plus protection/cooldowns, fate spending, prestige overview, and reminder policy. Private menus include collection and balances; use one clear acquisition receipt for ordinary plus exchanged quarters. Optional batch actions should resolve sequential effects internally while committing once per interaction and displaying a short summary. Do not build long interactive hunts as a launch dependency.

Discord interaction delivery constraints and emoji requirements were checked in the preceding planning pass: [interaction documentation](https://docs.discord.com/developers/interactions/receiving-and-responding), [emoji documentation](https://docs.discord.com/developers/resources/emoji). Defer promptly, authorize component owners, expire stale controls, and validate balances server-side. Private embeds do not replace transaction safety.

## Reminders

Plan a separate reminder every three days during ACTIVE in the configured fuckery channel, with an allowlist of Resident role IDs. No reminders after the event and no backlog of missed reminders after downtime. Persist last successful send and avoid multiple workers issuing duplicate messages. Tag only the specified Resident roles in this reminder; game actions never ping nonparticipants. Confirm the exact role/channel IDs and local send time before enabling.

The existing `handlers/reminderHandler.js` is for a different biweekly game reminder, uses host-time scheduling, and has an alternate branch that builds a string without sending it. Do not repurpose or copy it unchanged. No reminder has been created or sent by this audit.

## Admin repair surface

Use a private `/spooky-admin` surface authorized by the configured admin identity/role on every command and component, not only hidden command visibility. Ordinary participant actions stay open to everyone.

| Operation | Required behavior |
| --- | --- |
| Inspect player | Effective candy/refill anchor, Eyes, inventory/extras, badges, protection, prestige, draw count, event state |
| Recent transactions | Paginated filters by user, interaction, operation, date; link both sides of theft |
| Correct candy/Eyes | Explicit set/add, reason, before/after, bounds checks, ledger |
| Grant/remove quarter | Stable piece ID, quantity, reason; normal grant can trigger exchange/badge; removal distinguishes extras/last copy |
| Recompute badge eligibility | Preview mismatches; idempotently grant missing awards; no implicit permanent revocation |
| Clear effect | Identify durable effect and restore/reconcile only its changes |
| Inspect config | Effective version, dates/states, odds, costs, caps, roles/channels; no secrets |
| Disable actions | Reason and status; independent operational pause flag |
| Reset development participant | Explicit development environment check, confirmation, seasonal scope, ledger; preserve permanent badges |

No tenth operation was specified in the user's list. Recommended addition: preview an economy/eligibility repair before applying it. Admin mutations are idempotent too; a grant must not be duplicated by a retried interaction. Grant/removal paths must state whether they resolve automatic duplicates; recommended normal grants do, with a separate tightly scoped repair mode if necessary.

## Service contracts and ledger

Adopt the user's ten contracts verbatim as acceptance criteria:

1. Candy is action energy.
2. Collection currency purchases quarters.
3. Every piece has one stable ID.
4. The first copy of a piece can never be consumed.
5. Duplicate exchange consumes exactly five extras.
6. Exchange always awards an unowned piece.
7. A badge is awarded exactly once per character.
8. Seasonal reset never deletes badge ownership.
9. Theft can never create currency.
10. A Discord interaction can mutate economy state at most once.

Fate purchases extend contract 2 by allowing an explicit second payment resource. An administrator deliberately removing a sole quarter is an exceptional repair, not duplicate consumption; it requires a separate reason and must not silently revoke permanent badges.

Ledger minimum: `operationId, interactionId, eventId, guildId, userId, operationType, resource, delta, relatedUserId, metadata, timestamp`. Add `actorId`, before/after values, rule/config version, and a correlation/group ID. Every theft has equal debit/credit entries linked to one operation, including candy theft if adopted. Refill/minting are explicitly distinct operation types. Inventory entries reference piece IDs; exchanges record all five consumed extras plus the granted piece. Badge awards are permanent ownership entries, not just UI messages.

An operation has many ledger entries: do not make each entry's interaction ID globally unique. Enforce a unique processed-operation record for the root interaction, write every related ledger entry and state mutation in the same transaction, then save a durable result receipt. Retries return that receipt without rerolling outcomes. Workers use deterministic operation keys per reminder/refill interval/event-close task rather than fake Discord IDs. Economic atomicity cannot include Discord message delivery; queue/retry delivery separately after commit.

Service boundaries: event policy/config; participant/refill; targeting/effects; economy/ledger; acquisition/duplicate exchange; permanent badges/rendering; prestige; interaction UI; admin repairs; maintenance/reminders. Keep these small modules in this bot, not separate deployed services. Migrate explicit tables and unique indexes; avoid runtime schema sync as a substitute for migrations. Existing Sequelize SQLite storage needs short transactions and a tested contention/retry policy.

Required tests: duplicate sequences across mixed pieces; exact-five and batch-ten consumption; completion with no missing IDs; safe first copies; zero-sum theft; simultaneous last-Eye theft; combined fate debit; bank caps; replayed clicks; refill at cap and after downtime; late registration without a second starter grant; boundary/pause behavior; single badge award under concurrency; seasonal reset preserving awards; admin scope; and expired/non-owner UI. Probability tests should exercise boundary outcomes deterministically, while simulations evaluate pacing rather than asserting random sample values as correctness.

## Remaining decisions and risks

Highest impact: early-first-badge policy; final candy rate/cap; action Eye rewards; hard Eye draw limit; candy theft versus Eyes-only theft; shield duration/limits; fate purchase eligibility and combined debit; bonus amount/cap; redemption duration and post-October acquisition; prestige scoring/ties. Role/channel IDs and existing fate data require environment verification before launch.

The new game cannot be achieved by only tweaking the enabled legacy spooky command: it currently treats candy as both energy and reward, lacks piece ownership/ledger, auto-enrolls targets, and has unsafe state updates. The holiday code provides a footer style, not a correct foundation. Implement the minimal collection/economy path first, then add effects and competitive scoring against those contracts.

## Minimum viable product to get the game up immediately

"Immediately" means the shortest coherent implementation, not deploying the current legacy command. No time estimate is justified before coding and development-server verification.

Launch scope:

1. **Set the minimum rules:** event boundaries, candy cap/rate, baseline Eyes/action, four Eye draws policy, ordinary rarity weights, ten-fate eligibility/debit, and first-badge pacing. Record them in one versioned configuration.
2. **Build the safe core:** migrations, lazy capped candy refill, Eyes/fate purchases, stable 28-piece manifest, quantities, automatic five-extra exchange, permanent badge service, and economy ledger/replay protection. Store badges with text placeholders while artwork is pending.
3. **Carry forward the playable legacy actions:** retain the silly trick/treat outcomes, including curses and nickname/message effects, with reviewed probabilities, permissions, safe delivery, expiry/recovery, and the audit's logic fixes. Add treats as the primary Eye source, rare recipient gifts, very rare direct trick Eye rewards, zero-sum Eye stealing, protection, and the configured 5% treat-only banked fate bonus for Unwanted players. Include fair no-target outcomes. A theft/protection-only replacement would not satisfy the clarified goal; optional new effects and candy theft can wait.
4. **Provide compact private screens:** welcome, help, status, draw result including automatic exchange, collection, and `/badges`. Support small batch action spending if low-click play is a launch requirement. Treat targeting can initially be random; a user selector is a small follow-up.
5. **Provide launch-critical admin tools:** inspect state/ledger, correct balances, grant/remove piece, recompute badges, clear shield, inspect config, pause actions, and development-only seasonal reset. These enable diagnosing and repairing a live event safely.
6. **Validate and enable on development first:** critical invariants, concurrent/replayed operations, actual quarter/placeholder display, event boundaries, and a complete action → draw → duplicate → badge flow. Confirm that credentials and database resolve to development before registering commands or starting the bot.

If the prestige winner competition is advertised at launch, capture/version treat and trick prestige from day one and implement final award selection before closing. Otherwise explicitly defer that competition; do not retroactively pretend an unrecorded metric was tracked. Persistent three-day reminders, styled quarter art, final badge emojis, optional level-up rendering, public leaderboard polish, entirely new trick families, and a nonzero redemption grace period can follow without blocking the safe core. Existing effects must be deliberately carried forward with their bugs fixed and participation/expiry rules applied; they are part of the intended game, not incidental legacy behavior to discard.

No new gameplay implementation was performed during this audit. The next step is reviewing the highlighted policy decisions and approving a bounded core implementation phase.
