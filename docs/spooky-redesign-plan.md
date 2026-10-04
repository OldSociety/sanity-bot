# Spooky 2026: proposed design and implementation plan

**Archived proposal.** Sections below retain superseded values despite labels such as “latest confirmed.” Do not implement directly from this document. The [rules specification](spooky-rules.md), [current handoff](spooky-handoff.md), and [implementation checklist](spooky-implementation-checklist.md) govern continuation. Current boundary: Tasks 1–8 and 10–15 complete offline/source wired; Task 16 next; permanent badge/art tasks deferred.

Status: planning only, 2026-10-01. Branch: `feature/S-1-spooky`.

Latest inputs: the first-pass tables and candy specification at the top of `spooky-design-audit.md` govern the next simulation: 13% mutually exclusive Eye outcome; natural candy generation 80/day with capacity 80; no 80-action ceiling; 10% curse override retained. No gameplay implementation has been made for these rules.

**Superseded design:** see the authoritative gameplay correction in `spooky-design-audit.md`: preserve last year's playful outcomes; treats are the primary Eye source, tricks primarily steal, and badge targets are casual 1–2, regular about 4, all seven a very unlikely achievement around 87.5% monthly candy utilization. Equal-reward simulations, manual exchange proposals, quarter theft, and a theft/protection-only replacement are obsolete. Earlier candidate values below are planning history, not the current contract.

## Latest confirmed rules — supersede earlier candidate settings

- Collection currency: **Evil Eyes**. Ordinary quarter draw price: **5 Eyes**.
- Desired pace: four ordinary quarters/day, costing 20 Eyes. Still distinguish a hard daily purchase limit from an income target; the proposed default is a hard limit of four paid draws per Pacific calendar day. Duplicate exchanges are proposed to be additional, not charged against this purchase limit; this choice needs agreement.
- Top-left and top-right: common, blue. Bottom-left: rare, purple. Bottom-right: legendary, gold. Also display rarity in text.
- All seven badges should be achievable through sustained activity but not easy. No newcomer catch-up.
- Earning occurs during October only. Interpret "Pacific standard timezone" as local Pacific time (`America/Los_Angeles`), which observes daylight time in October. Proposed boundaries: October 1 at 00:00 inclusive through November 1 at 00:00 exclusive, so October 31 is fully playable. If fixed UTC-8 was intended instead, boundaries must be changed before implementation.
- October badges are limited rewards: new ownership can only be earned during the event. Already earned badges remain available in year-round profiles, consistent with the earlier requirement. No post-event purchase/exchange grace period is proposed.
- Tricks steal Eyes; treats protect the caller and others against theft. Outcomes, protection durations, and loss limits are still design proposals.
- Fate: treats only, 5% chance, deposited directly into the caller's existing fate bank, capped at 100. Eligibility remains Unwanted-role players. Proposed amount is +1 per successful bonus; amount and any extra daily cap remain undecided. Do not apply the prior 0.5% proposal, trick bonuses, or booster-only overflow policy to this event reward.

### Balance proposal for discussion, not implementation

Both actions should provide baseline Eyes so collecting does not depend on finding victims and treats are useful to players without the Unwanted role. Start by evaluating one candy per action and one baseline Eye per paid action. A successful trick can transfer one additional Eye from an active, unprotected participant; a treat grants short-lived protection to the caller and one active participant. Protection can block the next theft and expire after a defined interval. Refresh rather than indefinitely stack protection. No target means a clearly defined fallback before charging, and nonparticipants receive harmless flavor/invitations rather than economic effects.

Candidate safeguards: max one Eye per theft, max two Eyes lost per victim per Pacific day, and a per-attacker/victim cooldown. These values require simulation alongside refill/action budgets. Role titles can recognize most treats/tricks, but the functional rewards are protection, theft, collection progress, and treat-only fate bonuses.

A hard four-paid-draw limit allows saved Eyes without letting theft or hoarding bypass the daily draw pace. It also means stolen Eyes above the day's spending need provide reserves rather than immediate extra draws; test whether that still makes tricks appealing. An alternative is a 20-Eye daily award cap, but that does not itself limit purchases from saved/stolen balances and may diminish theft incentives once capped.

Four ordinary draws/day gives 124 ordinary draws for full-month participation, plus duplicate exchanges. Under the provisional drop model below, 70 draws complete all seven for about 96.64% of players and 80 for 99.99% in simulation. At four/day, those are about 18 and 20 days. Therefore, easy access to the maximum every day would make completion fairly easy for sustained players. Preserve the requested exchange rule and tune the effort needed to earn 20 Eyes/day, rather than claiming the four-draw limit alone makes completion difficult. Full action/steal/protection simulations are still needed.

At 5% and +1 fate per treat, 20 treats/day for 31 days would award 31 fate points in expectation before the bank cap; at ten/day, 15.5. This is noticeably more generous than the earlier 0.5% suggestion. The user's chosen 5% is retained; decide explicitly whether a daily bonus cap is desired.

## Work completed

Enabled the existing `commands/Holiday/TrickorTreat.js` by removing its outer comment prefix while preserving internal comments, including disabled immunity assignments. Parsed the enabled JavaScript successfully using Node's VM compiler. This makes the command eligible for the existing loaders; it does not deploy the command, start the bot, restore candy rewards, fix legacy bugs, or establish database readiness. The old audit still describes its mechanics and defects, but its statement that the command is commented out is now historical.

No redesign mechanics, migrations, reward schedules, or UI changes have been implemented. Existing uncommitted holiday work remains intact. Do not run the old command against a live server as though it were the redesigned game.

## Confirmed requirements

- Players spend automatically replenished, capped candies on tricks and treats.
- Actions earn, steal, or otherwise obtain a separate collection currency used to obtain token quarters. Candy is action energy; the separate-currency choice is confirmed.
- The collection contains seven tokens and 28 unique pieces. Top-left and top-right are common. The bottom pieces are rare and legendary; the exact left/right assignment remains open. Differentiate rarity visually, such as a border, and with a text label.
- Collecting all four pieces of a token unlocks that character's badge. Badges are persistent bot-profile collectibles outside the October game, using server custom emojis created from the forthcoming artwork. Optional level-up display is desired. Discord roles are not currently planned.
- Five extra copies, mixed across any tokens, are consumed for one random unowned quarter. The first owned copy of each piece is retained.
- Duplicate exchange ignores ordinary rarity weights. This proposal samples uniformly from all missing piece IDs, so every missing piece has equal probability. Equal probability per rarity category would be a different rule.
- The event lasts 31 days. Progression must be feasible within that window.
- Some effects target active participants; others can include nonparticipants to encourage joining.
- Very rare rewards grant existing fate points to Unwanted-role players.
- Embeds should follow the supplied BloodHunter examples and use private responses to avoid player interference.

## Asset inventory

The ZIP was read without executing its contents or importing files into the game. README content was treated as asset metadata, not instructions.

| Prefix | Character name from ZIP | Pieces |
| --- | --- | --- |
| had | hadley | tl, tr, bl, br |
| hfm | hellfed_marq | tl, tr, bl, br |
| mrq | marq | tl, tr, bl, br |
| max | maxim | tl, tr, bl, br |
| nik | niklaus | tl, tr, bl, br |
| qam | qam | tl, tr, bl, br |
| sel | selene | tl, tr, bl, br |

The archive contains 28 PNGs and a README. The user confirmed both top pieces are common and the bottom pieces rare/legendary; bottom-left versus bottom-right and display-name capitalization still need defining. Rarity assignment must be explicit in a manifest. Proposed rare color: purple; legendary: gold; common: neutral. Include rarity text/icons so color is not the only distinction. Preserve the original images; implement border styling or derived assets in the later art/UI phase. Keep character and piece IDs stable across asset revisions.

## Proposed player loop

1. Register explicitly, receive a starting candy balance, and see the event end and rules.
2. Open a private event menu showing candies, next refill, collection currency, unique pieces, duplicates, and badges.
3. Spend a candy on a trick or treat. Show the outcome, exact balance changes, and any rare fate bonus.
4. Spend collection currency for a random quarter using the published ordinary drop weights. Show its image, rarity, character progress, and whether it is a duplicate.
5. Exchange five selected extra copies for a uniformly random missing quarter. Show the selected costs and confirm once. Disable exchange when fewer than five extras remain or the collection is complete.
6. On first completion of a character, persist its badge and announce it once. It remains available through a server profile/badge command after Halloween ends.

Suggested commands: retain `/spooky register`, `/spooky status`, `/spooky trick`, `/spooky treat`; add menu/shop/collection/exchange entry points as appropriate, with buttons handling navigation. Add a separate year-round `/badges` or shared profile view. Player-to-player quarter trading is not part of the current request.

## Economy: candidate numbers, not approved settings

Use candy as action energy and a separately named collection currency for progression, as confirmed by the user. Quarter ownership and badges should never be stolen.

### Collection simulation

The reproducible planning script `docs/spooky-collection-simulation.js` models 10,000 complete collections with seed 20261001. It assumes:

- Ordinary rarity odds: common 70%, rare 22%, legendary 8%.
- Fourteen common, seven rare, seven legendary piece IDs, with equal odds within each rarity.
- Independent draws; no ordinary-draw pity system.
- Five extra copies exchanged immediately whenever possible; each exchange uniformly selects one missing piece and does not produce a duplicate.
- All seven tokens available throughout the event; no fate bonuses, targeted purchases, or player trades affect the model.

| Measure | Ordinary draws needed for all 28 |
| --- | ---: |
| Mean | 59.56 |
| Median | 60 |
| 90th percentile | 68 |
| 95th percentile | 68 |
| 99th percentile | 72 |

Completion rates: 60 draws = 66.43%; 70 draws = 96.64%; 80 draws = 99.99% in this sample. These are simulated estimates, not guarantees. Five-for-one duplicate exchange bounds the worst case at 136 ordinary draws: one initial unique plus 135 extra copies can supply the remaining 27 missing pieces. Ordinary acquisition of additional unique pieces reduces that bound.

The exchange intentionally makes legendary pieces achievable near the end. The rarity of ordinary drops does not imply equally rare final ownership. Uniform missing-piece selection also means the share going to each rarity depends on how many pieces of that rarity are still missing.

### Translating draws to daily play

Illustrative starting point:

| Setting | Candidate |
| --- | --- |
| Candy capacity and starting balance | 24 |
| Automatic refill | 1 candy per hour, capped at 24 |
| Action cost | 1 candy |
| Mean net collection reward | 1.25 currency per action |
| Ordinary draw cost | 10 currency |
| Target monthly draws | 70–80 |

The 1.25 mean is a balancing target, not an implemented outcome table. One illustrative distribution is 10% zero, 60% one, 25% two, and 5% three currency, giving mean 1.25. Steals, gifts, curse outcomes, bonuses, and any costs must be incorporated into the actual net reward model before adopting it.

At that mean, 70 draws cost 700 currency, or about 560 actions: 18.1 actions per day for 31 days. Eighty draws require about 640 actions: 20.6 per day. Using 24 actions every day gives 744 actions and about 930 currency, enough for 93 draws in expectation. End-of-event draw count is random; these arithmetic expectations do not establish a completion probability for the full game.

That action load may be excessive. If the preferred effort is about ten actions/day, aim for roughly 2.6 currency/action at a ten-currency draw price to average 80 draws over 31 days, or lower draw cost. Consider a concise repeated-action UI or a bounded batch option, but only if it preserves meaningful player decisions and target protections.

A daily refill can be more convenient than hourly energy but must define timing and carryover. Hourly regeneration with capacity 24 permits a daily visit without requiring overnight logins. A missed day loses earning opportunity once capped. Consider newcomer catch-up, event-ending conversion of unused currency, and an end-of-event guarantee if completion should be certain rather than merely likely. Decide these before tuning reward tables.

Next simulation must combine actual actions, reward variance, available victims, stealing losses, immunity, candy waste at cap, missed days, late joining, and role bonuses. Compare casual, daily, and maximum-use players. Report completion of at least one badge as well as all seven, and the distribution of required daily effort. Completion should not depend on other people being online.

## Targeting and effect rules to define

| Effect family | Proposed target pool | Proposed limits |
| --- | --- | --- |
| Currency stealing, heist, economy-affecting gifts | Explicitly registered, recently active event players | Fresh eligibility check; bounded theft per victim/day; immunity; no negative balances |
| Harmless spooky invitation/flavor | Eligible server humans including nonparticipants | Rate-limited public messages; no automatic registration or inventory creation |
| Temporary nickname/curse effects | Opted-in participants by default | Check permissions; preserve original state; explicit expiry and restart recovery |
| Beneficial treat/invitation | Participants or nonparticipants depending on outcome | Nonparticipants get an invitation, not implicit economic enrollment |

Define "active" using event activity time, such as the preceding 24 hours, instead of Discord presence alone. Define whether admins participate and appear in rankings. Prefer small time-limited effects over deleting or rewriting nonparticipants' messages. The existing message curse handler needs a separate decision: replace with safe flavor, limit it to opt-in participants, or remove it from the event. These are proposals, not changes already made.

A successful steal transfers existing currency; it does not mint currency by inventing a victim balance. If no valid victim exists, use an explicitly balanced solo alternative or decline before charging. Avoid a progression loop where players can drain a newcomer repeatedly or where coordinated players mint unlimited currency through reciprocal gifts.

## Required implementation changes

### Foundation and storage

- Fix the audit's unreachable outcome, ineffective immunity, biased heist targeting, accidental candy loss, race conditions, and missing reply handling.
- Keep game rules in one versioned event configuration: boundaries/timezone, candy refill/cap, action costs, outcome weights, drop weights, piece manifest, and fate bonus rules.
- Separate guild/event participant balances from permanent badge ownership. Do not reset permanent badges with the seasonal event.
- Add migrated tables for participants, piece quantities, badge awards, and durable effects. Use unique participant identity `(guildId, eventId, userId)`, inventory identity including piece ID, and permanent badge identity `(guildId, userId, badgeId)`.
- Record economy operations with Discord interaction IDs for replay protection and investigation. All debits, rewards, exchanges, and completion checks must be transactionally consistent.
- Decide how old SpookyStat balances are archived/reset/migrated; do not silently import previous-season balances.
- Enforce nonnegative balances and retain one owned copy when redeeming extras. Completing a token must grant its badge once even under simultaneous draw/exchange requests.
- Store earned badges immediately even before artwork arrives; configure server custom emoji IDs later. Emoji upload availability must never control whether earned ownership is saved.
- When badge art arrives, prepare emoji-sized assets, import them to the development server first, and record stable badge-to-emoji IDs. Reconcile existing emojis rather than uploading duplicates. Preserve ownership if an emoji is deleted and use a text fallback until it is restored.
- Show earned emojis in bot profiles; optionally add a compact badge row to the existing level-up embed in `handlers/messageHandler.js` after its normal rewards. Keep this display independent of event dates and limit the row if future badge sets grow.

### Automatic candies

- Implement elapsed-time refill with a persisted refill anchor, cap handling, and deterministic event boundaries. Apply it on actions/status and in a periodic worker so it is automatic and restart-safe.
- Define whether time spent at cap is discarded; recommended: do not bank hidden refill credit above the cap.
- Use exactly-once interval accounting so repeated worker ticks and command access cannot award the same refill twice. Catch up eligible elapsed intervals after downtime within the event window.
- Do not restore the deleted dailyTreats handler unchanged. The current holiday reward function is a no-op; it cannot supply Halloween candies.

### Fate integration

- Only award to current Unwanted-role holders unless a broader policy is chosen. Expose eligibility in rules; other players continue receiving ordinary event rewards.
- Proposed rarity: 0.5% chance of +1 fate per paid action, capped at one event-awarded fate point per player/day. The raw expected reward at 560 eligible actions is 2.8 points before the daily cap and existing balance limits. Confirm whether "very rare" should mean this, a larger rarer jackpot, or quarter-purchase bonuses instead.
- Apply the existing 100 fate cap and booster/admin bank rules consistently via a shared, atomic reward operation. Track source and ensure rerunning the interaction cannot award again.
- The existing `/fate add-fate` lets eligible users choose how many points to add to themselves. If that reflects a manual tabletop accounting policy, rare Halloween fate drops are thematic extras rather than an exclusive supply. Confirm intent; do not change this command's access policy as part of Halloween without authorization.

### Interface based on the supplied screenshots

- Compact bold title, short narrative, explicit rewards/costs, and a consistent Available footer. Include candies, collection currency, progress, and fate only when relevant.
- Use yellow for neutral/pending, green for rewards/completion, red for failed actions, and muted neutral for collection browsing. Thumbnail for quarter/character; larger image in a focused collectible view.
- Private menus for balances, purchases, quarter results, duplicate selection, and action controls. Public channel messages only for intended social effects and optional badge celebrations.
- Use buttons/select menus for private reward choice; the reference's reaction-wheel wording should not be copied into an ephemeral interaction flow.
- Defer interactions promptly, then edit the private response. Validate component ownership, event/session identity, expiry, current balances, and one-use purchase confirmation on every interaction. Privacy does not replace validation or transactions.
- Expired sessions show a concise re-open message and disable controls. A new menu reconstructs progress from persistent storage rather than relying on a collector surviving a restart.
- The holiday throw command already uses a balance footer and outcome image, so it offers a visual reference. Its economy/model inconsistencies should not be copied. BloodHunter source has not been provided; the supplied images establish appearance, not implementation.

Discord documents ephemeral responses and requires an initial interaction response within three seconds; tokens last 15 minutes. See [interaction response documentation](https://docs.discord.com/developers/interactions/receiving-and-responding). Image attachments/embeds should be validated against [Discord channel/message documentation](https://docs.discord.com/developers/resources/channel). Long-lived badge viewing should issue fresh responses using local assets, not depend on a past private response remaining available.

"Local emojis" is interpreted as custom emojis uploaded to this Discord server, sourced from local badge files. A local file alone cannot appear as a custom emoji: it needs a Discord emoji ID. Discord specifies 128x128 input, a maximum of 256 KiB, and expression-creation permissions; verify server capacity when importing. See [Discord emoji documentation](https://docs.discord.com/developers/resources/emoji). Creating server emojis makes the artwork usable as expressions by members subject to server settings; earned badge ownership remains enforced by the bot's profile records. If badge art must be exclusive to earned profile display, app-owned emojis are a separate option to discuss.

## Phased delivery and model handoff

| Phase | Scope | Completion evidence |
| --- | --- | --- |
| 0 — now | Enable old command; audit; inventory assets; write plan | Syntax parse and reviewable plan; no deployment |
| 1 | Settle currency, rarity mapping, badges, effort, target policy, event dates, and outcome tables | Approved rule/config specification and full economy simulation |
| 2 | Migrations, transactions, refill, ownership, duplicate exchange, persistent badges | Deterministic tests for cap/refill, races, five-copy consumption, unique badges, and replay protection |
| 3 | Trick/treat outcomes, target pools, durable temporary effects, rare fate reward | Probability boundaries and actual state-change tests; no-target and permission-failure coverage |
| 4 | Private menu, quarter reveal, collection, exchange, badge profile | Owner/expiry tests and reviewed development-server screenshots |
| 5 | Seed assets/config and test through the development bot | Complete purchase/exchange/badge loop; restart and event-boundary checks; final balance simulation |
| 6 | Release the agreed event | Explicit deployment request, verified target credentials/database, rollback and season-close procedure |

For efficient model switching, use this file plus `spooky-audit.md` as the handoff. Implement one bounded phase at a time, record exact files and validation, and avoid rerunning completed checks without a reason. Use a stronger reasoning model for economy/transaction design and review, and a less expensive model for settled manifests, repetitive embeds, and documentation. No model has been changed and no extra agents have been started.

## Decisions still open

The latest confirmed-rules section above supersedes older candidate prices, rarity assignments, and fate policy elsewhere in this draft. Choices still to settle in phase 1:

- Starting/refill candy amounts, desired actions per day, and baseline Eye rewards.
- Hard four-paid-draw limit versus an income target, and whether duplicate exchanges are additional.
- Final ordinary rarity probabilities and the effort needed to make full completion an achievable challenge.
- Confirm local Pacific time versus fixed UTC-8; proposed close is after all of October 31.
- Definition of active participation, theft caps, safe nonparticipant effects, and whether admins compete.
- Fate reward amount and any daily bonus cap; chance is fixed at 5% on treats and bank maximum at 100.
- How to treat complete collectors' remaining duplicates and currency. No newcomer catch-up.

All proposed numbers and unspecified policies remain open for review. The only gameplay-source change so far is enabling the legacy command.
