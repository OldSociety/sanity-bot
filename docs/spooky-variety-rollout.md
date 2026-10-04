# Spooky variety rollout — configuration 19

Authorized October 3, 2026. User approved implementation, the recommended 25% bag-hole increase, and explicitly chose shield protection for Crown theft (superseding the proposed Crown exception). This is the first staged rollout: nine immediate candy events plus the persistent hole. Mirror and Copycat remain a separate pending stage; neither has a live outcome weight or Effect type.

## Behavior

Every committed action still costs one candy. Refills remain one every 18 minutes; slots and the approved-but-pending bulk refill change stay held until Monday October 5. Candy capacity, starting candy, Eye conversion, piece rarity and Fate purchase probabilities are unchanged. Existing outcomes remain.

New shields expire at 12 hours or event end and freeze two or three charges with equal probability at grant. An otherwise-valid targeted hostile action consumes at most one charge per protected person, even when it has multiple transfers. The breaking hit is entirely blocked. Candy/Eye theft, curse/spread/backfire, backwards names, bag holes and Crown theft share interception before their effects. Untargeted failure, action cost, gift, cure and Eye find do not consume charges. Existing shield expiry is preserved; historical metadata without charges gets two charges, without extending its timer. No renewal or new original-nickname baseline. Pop/expiry queues guarded restoration through the existing nickname service, including original null and manual-edit conflict handling.

Blocked Crown result: "Player tried to take X's crown. What a failure! Their shield stopped the theft." It is one public embed plus a flicker/pop sentence; no role transfer, capture prestige, first-win currency or Rihanna GIF. Crown selection remains 1% while another person holds it. When unavailable/self-held, that interval becomes ordinary candy theft rather than another caught outcome.

Hole result: "Player put a hole in Target's candy bag. Who knows what might fall out?" Persistent for 12 hours/event end, cannot renew an active hole. Adds ceil(25% of the ordinary candy transfer), capped at two extra per victim per root operation and bounded by funds/receiver room. For example 1→2, 3→4, 8→10 when funded. Multi-recipient scatter aggregates the victim's base transfers; extra goes to existing recipients only. No amplification of action cost, Eyes, Crown, gifts, refunds, balancing swaps or already-added bonus. Reverse Robbery can amplify its harmed caster. Hole changes no nickname or role and causes no passive leak. It can coexist with traditional curse. Break-spell, protective cure, goodwill curse cure, admin curse-clear and closure clear it. Protective cure grants no shield or gift. Existing development reset removes it without touching Fate/Bank.

## Ordinary Trick table

The table totals 100%; cursed overrides and Crown availability still affect realized results. Reversal is 5%/12h as previously approved. The immediately repeated spell family (reversal, curse, shield, cure or hole) gets 25% of its normal weight on the next action. Freed weight goes only to successful candy outcomes. Eye, Crown, caught/drop and unrelated spells retain their weights. The durable previous-action history and frozen receipt still govern replay and restarts.

| Outcome | Base chance | Result before hole/cap limits |
| --- | ---: | --- |
| Pocket Picked | 25% | Existing one-candy theft |
| Great Heist | 10% | Existing three distinct one-candy victims |
| Backwards name | 5% | Existing safe alternate-target reversal |
| Curse target | 5% | Existing chooser/curse |
| Curse backfire | 5% | Existing caster curse |
| Caught | 16% | Only the action candy spent |
| Candy Raid | 3% | floor25% of target candy, minimum1/maximum8 |
| Bag Swap | 2% | Swap post-cost balances if difference≤10, otherwise5 richer→poorer |
| Bag Explosion | 2% | One candy to each of up to4 distinct bystanders |
| Sticky Fingers | 3% | Up to3 stolen, 50% follow-up for1 from a different victim |
| Reverse Robbery | 2% | Target takes up to3 from caster |
| Candy Ransom | 2% | Requires target≥5 and caster room≥3; net3 taken, receipt5/2 |
| Boo | 2% | One to caster and up to2 distinct bystanders |
| Candy Shakedown | 2% | floor(target/10), minimum2/maximum6 |
| Trick Chain | 1% | First2, 40% second1, then20% third1 (8% both hops) |
| Hole in the bag | 1% | Persistent vulnerability |
| Crown theft | 1% | Existing exclusive capture, shield interception added |
| Evil Eye theft/find | 13% | Existing target-funded theft or no-victim find; shield blocks theft |

New heavy targets/bystanders are registered members in the trusted guild snapshot, never actor/bot/duplicate recipients. Eligibility previews use one participant batch without refilling every considered player. Actual recipients are rechecked in the serialized root transaction. Impossible heavy events use a saved, named ordinary-theft fallback (its existing registration rules); no reroll, replacement Eye, or extra failure weighting. If even that has no funded target, root rollback refunds the complete action. Shielded otherwise-valid targets stay eligible so attacks can weaken shields. Partial funded/room transfers display actual amounts.

All new numeric events conserve candy across source/receiver balances; action cost is the sink, existing refills/gifts/Crown rewards remain separate minting rules. Ransom records its net transfer, not fictional temporary balance debits. Hole extra is separately itemized. Bag Swap uses an atomic net transfer and ignores amplification. One public outcome embed lists actual multi-person movements; quiet embed-only mention limits remain unchanged. Cosmetic caught/drop variants consume no gameplay RNG. New events reuse reviewed GIF pools at10% with durable recent-asset rotation. Existing successful Crown theft still forces Rihanna.

Prestige remains one award per root action: normal success+2, actual Reverse Robbery loss−1, genuine no-effect0, curse replacement+1; existing Great Heist+5 and Crown capture+10 remain. The current holder's positive10% bonus remains. No historical rescore or scoring version change is needed: new rows use the existing allowed deltas; winner proof validation remains compatible. Mirror/effective-action scoring is not introduced in this stage.

## Files and validation

New shared combat.js and candy-events.js are connected through the controller, theft, playful effects, actions/progression, presentation/flavor and wording gallery. Effect allowlist/expiry/closure/admin repair/reset recognize bag_hole. No schema migration, dependency, slash definition/deployment, reset, balance correction, merge or branch switch.

Final validation: **386/386 full tests pass**; 82/82 focused outcomes/wording and 64/64 controller/simulation/admin checks pass; 26 changed JS syntax checks, offline preflight and complete registry audit pass (13 local active definitions, no changes). Bounded three-scenario simulation: 126 player-months, 142,098 actions; candy/Eye conservation passed. The existing seeded400-action SQLite/memory parity regression passed. Small cohort evidence checks invariants and provides no forecast of completion rates. Design arithmetic in spooky-variety-design-results.json predates these hole/shield rules and is historical.

Evidence: artifacts/spooky-variety-{final-focused,controller-final,final-full,cohort}.log; artifacts/spooky-variety-cohort.json; artifacts/spooky-variety-{preflight,registry}.json. Configuration19 is live in both bots after the scoped rollout below.

## Next acceptance

Human checks: chooser handles damaged bags; new event actual movement wording; shield flicker/pop and original name restore; Crown-block wording and unchanged holder; collection/leaderboard still respond promptly. No agent real gameplay action. Keep feature/S-1-spooky unmerged. Mirror and Copycat deferred-action semantics remain pending the second stage; slots held Monday.

## Live verification — October3,20:04 Pacific

One reload each after isolated tests passed. Production online/ready, PID14600/restarts29 (fresh baseline28); development online/ready, PID3324/restarts28 (baseline27). PM2 saved. Both remain in this checkout on feature/S-1-spooky, unmerged. Error files unchanged from the fresh pre-reload baseline: production2,837,153 bytes /2026-10-03T21:22:37.551Z; development35,694 bytes /2026-09-08T13:00:00.924Z. The earlier production restart/error increase is preexisting reportHandler10062 at line94, separate from this rollout. This launch made no new startup error write.

Read-only Discord/SQLite checks before and after: production exactly1 actual Crown holder matches the initialized ledger; development initialized with0 holders; both Crown roles manageable and0 pending Crown transfers. Production31 reversal rows before/after, development0. No manual player action/reset/repair or storage migration/replacement occurred. Live maintenance can naturally expire effects.

Sanitized evidence: artifacts/spooky-production-launch/variety-{before-processes,process-verification}.json; variety-{development,production}-{before,after}.log and corresponding readiness.json; variety-{development,production}-reload.log; variety-pm2-save.log. The process inspector reports source config version and verified start times; actual player-facing acceptance is still the next human check.
