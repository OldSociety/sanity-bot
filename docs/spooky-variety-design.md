Implementation update October3: the first stage plus the user-approved persistent hole and Crown-protecting shields is implemented as config19. See [current rollout](spooky-variety-rollout.md) for the18-outcome/16%caught table and validation. The20-outcome/14%caught table, Mirror/Copycat and proposed Crown exception below are historical/pending design, not live settings.

# Spooky variety expansion — design audit, October3 2026

PROPOSAL ONLY. Live config18, odds, schemas, commands, processes and player balances are unchanged. User asked for a reviewed implementation design and outcome probabilities, not deployment. Keep feature/S-1-spooky unmerged and slots held MondayOctober5. This proposal supersedes no live rule until approved and implemented. Pure arithmetic evidence: spooky-variety-design-results.json; reproducible local audit artifacts/spooky-variety-design-audit.js (no DB/environment/Discord).

## Proposed final Trick table

All eight existing outcomes remain. Keep every existing non-failure weight and fund new variety entirely from caught_stealing36→14. Twenty outcomes sum100.

| Outcome | Percent | Identity and exact proposed behavior |
| --- | ---: | --- |
| Ordinary theft | 25 | Familiar one-candy theft; rename its current Sticky Fingers title to Pocket Picked so the new result is distinct. |
| Great Heist | 10 | Current multi-person theft: one candy from up to3 people, not three from one. Preserve existing+5 event prestige. |
| Reverse nickname | 5 | Existing12-hour readable-baseline spell, eligible alternate target. |
| Curse target | 5 | Existing persistent curse/goodwill cure, role/nickname handling. |
| Curse backfire | 5 | Existing caster curse, shield/exclusivity guards. |
| Caught stealing | 14 | Spend the action candy, no extra penalty; several cosmetic wording variants. |
| Crown theft | 1 | Existing contested Crown/role transfer and Rihanna GIF. |
| Eye theft/find | 13 | Existing1Eye/automatic quarter path, retain collection accessibility. |
| Candy Raid | 3 | floor25% of target's refilled candy, min1/max8, bounded by source funds/recipient room. Strongest wealthy-target hit. |
| Bag Swap | 2 | Compare refilled balances after caller pays action cost; difference<=10 swaps them. Otherwise transfer up to5 from richer to poorer. Can benefit the target. |
| Bag Explosion | 2 | Up to4 from target, distributed1each to up to4 distinct registered bystanders excluding caller/target. Debit only what fits recipients. Social event, no caster reward. |
| Sticky Fingers | 3 | Up to3 from primary target,50% optional extra1 from a distinct second target. Concentrated theft with one follow-up surprise. |
| Reverse Robbery | 2 | Up to3 from caster after action cost to target. Unlike caught, the opponent benefits. Respect caster's shield and target capacity. |
| Candy Ransom | 2 | Eligible target needs>=5 and caller room>=3. Net3 transfer, receipt explicitly records5taken/2returned. Use atomic net writes to avoid transient capacity problems. Same net as Sticky's first hit, but different target requirement and comic negotiation. |
| Boo | 2 | Up to3 from target:1to caller, remaining up to2 to distinct bystanders. Split the spoils visibly, unlike Explosion's caster-free payout. |
| Haunted Mirror | 1 | One pending action flip, expires24h/event end. Next committed Trick becomes Treat or Treat becomes Trick; requested/effective action both audited. |
| Copycat Curse | 1 | Next successful candy-theft Trick returns its actual candy transfers to the same victims. One use/24h/event end; no Eye, badge, role or spell duplication. Proposed clarification: successful candy theft rather than wasting it on an Eye/failure roll. |
| Marked for Mischief | 1 | Next successful positive candy theft against this person gains up to3 extra from that same victim, bounded by funds/room. One trigger/24h/event end. Does not trigger on failed attacks, Eye theft or an unrelated target. |
| Candy Shakedown | 2 | floor(target candy/10), min2/max6, then bound by available funds/room. Wealth-scaled steady extraction versus Raid's sharper25% hit. |
| Trick Chain | 1 | Up to2 from first target;40% jump to distinct second for up to1; conditional20% jump to distinct third for up to1. Three-hit chance8%, maximum4, unconstrained mean2.48. |

Conditional availability: existing no-Crown/self-Crown theft1% should become ordinary one-candy theft instead of failure. Crown remains1% when another player holds it; Treat Crown remains1% unclaimed/ordinary gift while held. This changes only the unavailable outcome substitution, not the Crown reward/ownership guards.

Treat table remains20lost/1Crown/15double/10shield/5break/36ordinary/13Eye=100. Curse replacement10% remains before the ordinary roll, so these tables are conditional on no override; for a cursed actor, unconditional ordinary Eye is11.7%, for example. Shield cures a cursed recipient instead of shielding under current rules. No proposed refill, rarity, eyes-per-piece, action-cost, Crown score or Fate change.

## Targeted repeat buffer

Replace broad50% special-group suppression with25% of the repeated spell family's base weight for one following action (75% reduction). Spell families: reversal; curse_target+curse_backfire; protection; curse-break; Mirror; Copycat; Marked. Target selection already excludes ineligible/duplicate active spells. A different spell still has its normal chance. Eyes/Crown/failure odds never reduced or inflated by this buffer. Redistribute freed probability proportionally only into successful candy theft/gift outcomes, excluding Reverse Robbery and Bag Swap. After new hexes, only that same hex is discouraged, not all other events.

Example after reversal:5→1.25, freed3.75 into successful candy outcomes; failure stays14, Eye13, eligible Crown1. After curse: target/backfire5each→1.25each, freed7.5 into candy. Treat-after-curse has no matching ordinary curse entries so needs no reduction; existing cursed override distribution is independently unchanged. Replay/registration/restart guards remain durable. This is deliberately a proposal; percentages have not been applied.

## Eligibility and conservation

Heavier new numerical/stateful effects target registered current-event players. Existing outcomes keep their existing membership policy. Source candy is lazily refilled before calculating percentage/wealth and after the caller's one action cost. Protection blocks all harmful losses, including swapped/redistributed balances, counter-robbery against a shielded caster and new hex application. Do not grant/refresh spells on already affected or ineligible players. No bots, duplicate recipients, forced negative balances or capacity overflow.

Build one scoped eligible set from the already-prepared Discord snapshot plus batched Participant/Effect reads, not one whole-guild fetch per branch. Filter registered targets/funds/shields; choose alternate within the SAME selected outcome. If no target can support a new event, freeze a named ordinary-theft fallback (existing eligibility), never silently roll another event, grant an Eye or convert it to caught. If no funded target exists at all, refund by root rollback. Choice becoming stale during human wait refunds; no hidden target substitution after their selection. All fallbacks appear in the receipt/preview. Full bag victims/receivers use actual amounts; four-person events may involve fewer people.

Every new candy event conserves total candy among materialized registered participants; the one action cost is the system sink. Existing starting/refill/gift/Crown minting rules remain separate. Ransom5/2 is one net3 balance transfer with truthful eligibility/receipt metadata. Copycat reverses actual transfers, never nominal advertised amounts. Mark is consumed only after an actual extra transfer; once triggered it cannot recursively amplify chains or Copycat returns. Bag Swap uses atomic net transfers, not blind balance setters. Avoid defining intent-only records as money.

## Stateful rules and precedence

Mirror/Copycat/Marked share one pending new-hex slot per target, with distinct Effect types for inspection. No stacking/refreshing;24h expiry bounded by event end. Do not change nickname or grant Discord roles for these new hexes. A shield/break-spell cure should clear these pending hexes as well as the existing curse; target chooser should recognize all curable hexes. Existing reversal restoration remains its separate safe cosmetic path. This cure extension needs explicit new tests/UI so the button doesn't promise only a traditional curse.

Mirror flips effective action BEFORE ordinary/curse selection, with one cost and one committed operation. Record requestedAction/effectiveAction, selection history and effect revision; use effective action for gameplay/scoring, preserve requested slash-command attribution in logs. One usage count, no nested operation; existing selection-staleness guard also checks pending-hex revision. Returning/expired/reset spells cannot affect a future registration generation.

Copycat remains until the next successful candy theft (not Eye/special/failure), then returns actual debits to each original victim in the same transaction. Mark bonus applies at most once to one primary attacked victim, after base transfer, not to all Great Heist/Chain targets. If Copycat caster attacks a marked victim, resolve base+Mark then Copycat refunds actual resulting transfers; both consumed once. Frozen receipt itemizes this so nobody sees contradictory payouts. Avoid mirrored recursive actions or duplicate progression.

Existing Effect table TEXT supports new types without anticipated migration, but effects.js's allowlist, cleanup, admin clear/reset, previews, notifications, scoring and frozen-proof validation all require updates. Audit database schema first; do not silently sync production.

## Prestige, presentation and rollout

New successful events+2, actual Reverse Robbery loss-1, genuine no-effect0, current curse replacement+1. Retain Great Heist's existing+5/Crown+10. No extra score per recipient, chain hop, returned candy or triggered hex; one root action gets one progression result. Current Crown10% positive multiplier applies once. Successful Bag Swap keeps+2 even when richer caller gives candy. Add score metadata.version for new failure/effective-action interpretation and teach winner proof validation to preserve earlier scoring rows; don't change existing scores.

One public result embed per action, listing recipients and actual movements, no extra popup for each hop. Quiet randomized embed-only mentions/no notification pings/cadences remain current. Avatar/balance footer apply; ordinary GIF10%/recent rotation, Crown forced Rihanna exception retained. Use several deterministic failure flavors without consuming gameplay RNG. New numeric event art must not overwrite token/badge reveals. Wording gallery includes zero/partial/capacity/fallback cases. The current ordinary-theft title collision must be fixed for recognizability.

Stage1: nine immediate candy events,17%caught,19%new candy,17outcome types. Stage2: three new hexes,14%caught,22%all new,20types. Keep all older outcomes in both stages. Three-percent reservation stays in caught only until Stage2; do not ship silent unimplemented outcomes. Initial stage changes include targeted buffer/eligibility substitution/wording.

Implementation files: config/spooky-2026.json(version increment only on implementation); actions.js(selection/buffer/overrides); new candy-events.js with bounded transfer plans; theft.js(shared batched eligibility); playful.js(flavor routing); flavor.js/presentation.js(target lists/actual amounts); wording-preview.js/gallery; progression.js/winner-snapshot.js(scoring); simulation-adapter.js parity. Stage2 adds new pending-hex helper/effects allowlist/lifecycle/admin-reset/target-choice integration. Runtime Discord calls remain outside DB and use existing member directory/REST adapter; do not recreate the just-fixed gateway request delay.

## Arithmetic audit

All final/stage1/every same-spell buffer variants sum100 with positive weights; Eye/Crown/failure weights are unchanged by buffer. Pure25-roll independent ordinary-table baseline:

| Metric | Live unbuffered | Stage1 | Final |
| --- | ---: | ---: | ---: |
| Expected distinct outcomes |6.29|9.94|10.60|
| Expected caught results |9|4.25|3.5|
| Expected new events |0|4.75|5.5|
| At least one new event |0|99.48%|99.80%|
| Expected adjacent caught pairs |3.1104|0.6936|0.4704|

This is exact table arithmetic, not measured live frequency; current live buffer can raise failures further, while new targeted buffer changes new-candy frequencies. Eligibility, cursed overrides, Mirror and Crown availability alter realized rates. Random failure streaks remain possible. No forecast says every player gets these counts.

Static candy snapshot, caster starts40, target10/40/80, all types available, funded distinct bystanders, no shield/curse/deferred effects: expected caller net per Trick including cost is-0.3002/+0.0398/+0.2198. Current static stocked baseline is-0.45 before Crown currency. Target80 can't receive Reverse Robbery, hence that snapshot has no reverse loss. These snapshots demonstrate redistribution pressure and cap effects, not long-run economy/collection balance. Every action still removes1 total candy; richer targets funding a caster's gains will change later snapshots.

Before implementation acceptance: audit exhaustive balances0–80/room and exact conservation for every handler; same/out-of-guild/unregistered/bot/shield/stale targets; one-charge/replay/concurrency/partial capacity; chain branch frequencies/unique victims; preview/public mention limits; first-win Crown/no duplicate Eyes; effective-action scoring/frozen proof;24h/restart/reset/closure/consumption/hex priority. Full SQLite parity and bounded larger-cohort simulation with current refill, ordinary Eye rates and collection rarity must precede any balance claim. Never use real databases as tests. No new full runtime test run is warranted for this documentation-only proposal; current live suite remains368/368.

Exact next: user review recommended table, registered-only heavy targets,24h one-slot hex rules, effective-action scoring and Copycat successful-theft interpretation. Then implement Stage1 with isolated tests/measurement/reviewed scoped rollout under existing live-fix authorization; Stage2 is a separate scoped implementation. Do not infer approval from this design document.

## Latest design direction: hole in the bag and durable shields

October3 user revised Marked for Mischief: public fiction is "Player put a hole in Target's bag. Who knows what might fall out?" It is a persistent internal hex, increasing candy lost during successful Tricks while active rather than a single+3 trigger. Proposed event weight remains1%; no other outcome weight change. Do not expose internal name Marked/hex or add a new currency. It redistributes existing candy only.

Recommended pending numeric rule (NOT approved): extra=ceil25% of the ordinary candy debit against that victim, maximum2 extra per victim per action, then bound the whole transfer by source funds/recipient capacity. Thus1→2,3→4,8→10 when funded/capacity allows. Zero ordinary transfer means zero extra; no bonus on Eyes, Crown, failure, action cost, gifts or on chained secondary bonus/Copycat refunds. No automatic passive candy leak. Extra stays with the event's existing recipients: caster for theft; existing bystanders for Explosion/Boo, choose additional room without creating recipients or candy. Bag Swap already computes a final balancing transfer and should be excluded from amplification so it remains a true bounded swap. Reverse Robbery may amplify only when its candy-losing caster has the hole. Hole lifespan12h is a recommendation aligned with shields, not human-approved duration. Traditional curse may coexist; hole creates no Discord role/nickname change. Healing/break-spell and protective cure clear it; no repeat application/renewal; shared pending-hex slot remains proposed. Update prior one-trigger Mark logic accordingly. Full simulation must model persistent amplification; previous static candy snapshots omit it and are historical baselines.

User proposes shields last up to12h but weaken/pop after2–3 targeted curse/Trick attacks; do not promise the exact timer/count publicly. Recommendation: freeze2or3 charges once at grant (equal probability is a proposal), save in existing shield Effect.metadata alongside original nickname metadata. Every committed hostile action against that recipient consumes at most1charge, regardless of chain hops/damage components. The breaking hit is FULLY blocked; then clear shield and queue guarded nickname restoration. Next attack can hurt them. Expire at12h/event end through normal cleanup. Replay must never consume twice; failed/stale/rolled-back commands consume nothing. No repeated shield refill, new baseline capture or count reroll. Legacy shields need a fixed cutover rule preserving original application time; do not turn every old shield into a fresh12h shield. Safe proposal: preserve old one-hour expiry and frozen default2charges until naturally replaced.

Current theft/curse/reversal eligibility excludes shielded recipients, so timer-only editing would fail: shields would almost never weaken. Change hostile target planning to admit otherwise-valid shielded targets, resolve interception BEFORE currency/curse/hex/nickname writes, and report absorption in one public root result. Exclude logically impossible attacks independently (empty bags with no actual theft capacity, repeated already-applied effect, full receiver). Filter blocked participants separately only where selecting a non-hostile/friendly target. Reverse Robbery considers its caster the harmed recipient. Multi-victim attacks may be blocked for one recipient and hit others; count charges per recipient once. A successful shield pop never lets that same attack leak through. Normal frozen root operation/quiet embed-only mentions/GIF10% remain current.

Coverage recommendation: shield absorbs candy/Eye theft, hostile curses/new hexes and backwards-name attacks. Crown theft remains a deliberate exception so a twelve-hour shield cannot lock the Crown competition; this exception needs user review. No charge for lost/caught outcomes with no target, Eye find, normal gifts, curse breaking, screens, or the protected player's own action cost. Treat-caused curse spread counts as a hostile curse. Shield absorption is a distinct visible outcome, not caught/drop/no-target error. Preserve current no-effect0 attacker prestige unless an approved scoring decision changes it; no defender points generated per blocked attempt.

Suggested public language: grant "A shimmering shield wraps around Player!"; block "Player's shield caught the spell—and flickered."; pop "Player's shield burst into a shower of sparks! It stopped the attack, but the magic is gone." Protection stays visually✨( Player )✨ while active, using existing long-name fallback and exact-original/null restoration. Hole application/clear changes no nickname. Normal manual edit guards still apply.

Implementation audit additions: shielded-target eligibility, atomic charge decrease and final-hit prevention; all old/new curse/theft/hex branches; batch attacks/different harmed actors; never consume on retry/choice cancellation/insufficient resources; hole rounding/caps/recipient-room/conservation; noEye/Crown/refund amplification; cure/expiry/closure/admin reset; legacy expiry and nickname restoration. Existing Effect TEXT/metadata should support this without schema migration, but low-level APIs/cleanup/admin tools/wording/target-choice/receipts need explicit integration. Holes and shields affect economy frequency beyond table percentages; original25-roll arithmetic measures roll diversity only. Nothing implemented or reloaded during this design update.
