# Slots and Halloween Spirit — design research

Design only on unmerged feature/S-1-spooky. Config 13 remains live; no runtime, database, command registry or process changes were made. The 342/342 runtime test count is prior evidence, not a test of this proposed game.

## Human-approved direction

- Change natural refill to 2 candy every shared 30 minutes: 96/day, initial grant 10. This is approved but NOT implemented yet.
- Bonus jackpots may exceed 80. Above 80, natural refill stops until candy is spent below the refill ceiling. Existing hard resource limits must be refactored; changing configuration alone is unsafe.
- Free five-stage slots with no stake; only an uncollected candy pot can be lost. Special Eye/emoji prizes are immediately owned and survive a bust.
- Baseline gain/loss ranges: Red 1, Blue 1, Green 1–3, Silver 1–5, Gold 1–7.
- Every completed spin gains Spirit. Higher Spirit improves pot gain/loss ranges and Eye/emoji chances. At 100% something special happens, then Spirit resets. Decay must be faster at higher levels. The research assumes this means higher Spirit percentage, not higher stage.
- Random trick/treat events from slots are deferred.

## Proposed first pass — NOT approved

Gain +2 percentage points per committed spin. Spirit survives collecting and busting. At 100%, a Spirit Burst immediately grants 1 Eye and 5 spendable candy, then resets to zero; the two prizes survive a bust. This is not a guaranteed exclusive emoji. A normal Eye prize does not reset Spirit. All registered Eye credits use collection.creditEyes, including burst prizes, with automatic quarter/duplicate conversions in the same transaction.

After ten minutes without a spin, decay at 1 percentage point per 10 minutes below 50%, per 5 minutes at 50–79%, and per 2 minutes at 80–99%. Recompute through crossed bands rather than charging the initial high rate for the entire absence. No decay worker is necessary: settle elapsed time on access. These rates, grace period, burst prize and buildup are proposals awaiting agreement.

At full Spirit, maximum gain/loss ranges become Red 1–2, Blue 1–2, Green 1–4, Silver 1–7, Gold 1–10. The model linearly interpolates maxima with integer rounding. That makes the low-stage increase abrupt at 50%; production could use stochastic rounding for smoother averages, but that would require rerunning the model.

Outcome probabilities below are per spin at that stage, not per game. Each row totals 100. Advancement/bust remain near the legacy architecture; special prize weights are intentionally reduced from the old item/jackpot slots. This is a research candidate, not a promised final table.

| Stage | Gain | Empty/near advance | Lose | Advance | Eye | Jackpot | Emoji | Bust |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Red | 50 | 16 | 14 | 8 | 0 | 0 | 0 | 12 |
| Blue | 42 | 20 | 25 | 5 | 0 | 0 | 0 | 8 |
| Green | 40 | 15 | 24 | 8 | 1 | 0 | 0 | 12 |
| Silver | 35 | 12 | 27 | 6 | 2 | 0 | 0 | 18 |
| Gold | 39 | 1 | 34 | 0 | 3 | 1 | 2 | 20 |

At full Spirit: Green Eye 2.5/empty 13.5; Silver Eye 4/empty 10; Gold Eye 6/emoji 3/gain 35. Other probabilities unchanged. Interpolate probabilities between endpoints; progression and bust do not get safer with Spirit. The full endpoint is an upper-bound comparison; the burst simulation uses 0–98% then resets.

Jackpot is fixed 100 candy PLUS the existing pot, ends the run and awards both without clipping. Emoji unlock also ends the run and banks the current pot. Repeat owned-emoji behavior remains undecided. Initial spin uses the normal table; it is not guaranteed safe. Free entry remains unlimited in this model; no economic cooldown or Spirit entry cost is proposed.

## Offline model and limitations

[Results](spooky-slots-balance-results.json) record deterministic Monte Carlo estimates, weights and assumptions. RNG is an unsigned 32-bit LCG: seed = (1664525 * seed + 1013904223) modulo 2^32, uniform draw = seed / 2^32. Seed 20261002 runs 200,000 games for each frozen-Spirit/collect-threshold scenario; seed 20261004 runs 500,000 games for each burst scenario, in listed order. Uniform integer gains/losses; pot loss floors at zero; each run starts Red/pot zero. Threshold policies collect immediately at pot >=3, >=5 or >=10; the final policy never voluntarily collects. The burst meter persists between runs, with no inactivity decay in this continuous-play model. Outcomes resolve, then Spirit grows/bursts, then bust/terminal/collect resolves. A bust can coincide with a burst but does not erase banked burst prizes. Max 10,000 spins per run; this guard is an analysis safeguard, not a game rule.

| Continuous-play policy | Candy / 100 spins | Eyes / 100 spins | Busts / runs |
|---|---:|---:|---:|
| Collect at 3 | 53.92 | 2.055 | 45.2% |
| Collect at 5 | 42.99 | 2.093 | 63.8% |
| Collect at 10 | 27.37 | 2.167 | 86.8% |
| Always chase Gold | 10.95 | 2.259 | 99.8% |

Includes burst prizes and rare jackpot cash, excludes passive refill, ordinary gameplay candy/Eye transfers and all inactivity decay. Figures are per completed spin, not per minute/hour. No click cadence is assumed. Unlimited play can generate unlimited total currency; small prizes and bust rates do not impose a daily maximum. Players collecting immediately after any profitable spin are not covered by these threshold policies and may earn more per spin; these are examples, not an optimal strategy or upper bound.

For the Gold-chasing policy, observed emoji rate is about 1.83 per 10,000 spins, jackpot 0.68 per 10,000. These are noisy rare-event estimates, not guarantees. A reward's Gold-stage weight is much larger than its overall per-spin probability. Casual collect-at-5 players almost never reach the exclusive emoji; adding a separate emoji pity system or improving advancement would need explicit design agreement. The Spirit burst itself is the guaranteed progress mechanism in this proposal.

At collect-at-5, 100 spins generate roughly 43 candy and 2 direct Eyes. If all 43 candies become ordinary uncursed treats with 13% Eye outcomes, that adds about 5.6 gross Eye awards: roughly 7.7 total, or 1.5 pieces of progress on average before transfers/other rewards. This is an illustration, not a full seasonal collection simulation or proof of seven-character completion. Refills already increase from 80 to 96/day (20%).

## Primary published references

- [EA Apex FAQ](https://www.ea.com/en-au/games/apex-legends/about/frequently-asked-questions): at least one Legendary 7.4% per pack; probabilities depend on the reward unit.
- [HoYoverse published Wish details](https://webstatic-sea.hoyoverse.com/genshin/event/e20190909gacha/index.html?gacha_id=fecafa7b6560db5f3182222395d88aaa6aaac1bc&lang=en&region=os_asia): this published standard banner has 0.6% base 5-star odds, 1.6% including guarantees, maximum 90 attempts.
- [HoYoverse guarantee explanation](https://support.hoyoverse.com/hc/en-us/articles/50333940684953-How-does-the-Wish-guarantee-system-work): guarantees, counter resets and carried progress. Retrieved October 2, 2026. These illustrate low base odds plus guaranteed progress; they do not validate Spooky's proposed probabilities.

## Implementation plan after design agreement

1. Separate natural refill ceiling from maximum valid candy balance. Audit participants refill/credit, economy changeBalance, model validator, theft room and rewards so overflow cannot be clipped or rejected. Preserve already-earned refill at an explicit old/new schedule cutoff; never reinterpret old anchor time under the new rate. Read-only inspect/schema plan before any online writer changes.
2. Durable event/guild/player slot session and Spirit state; one active run, revision-checked buttons, per-interaction ledger replay, post-commit UI/outbox. No transaction during UI waits. Define expiry, October closure, pause and restart/resume behavior. Runtime and admin inspect/testing reset must account for seasonal state.
3. Reuse registered collection Eye credit and a permanent cosmetic ownership/access projection. Do not silently make the exclusive emoji an eighth character badge. Choose emoji artwork/name/dedicated cosmetic role and repeat reward handling.
4. Private reusable Spin/Collect screen with stage, pot, Spirit bar, balances/avatar; public major-prize reveals and existing quiet mention rules. Slots spins do not directly award Scream Supreme prestige unless later authorized. Bonus candy spent on ordinary actions will indirectly affect standings.
5. Positive transaction/replay/overflow/expiry/Spirit-decay/cosmetic-access regressions and a service-based balance simulation. Update help, BOTADMIN-only inspection, README, checklist and handoff; then reviewed dev registry/deployment and human acceptance before scoped production rollout.

Old code is a design reference, not reusable transactional code: in-memory sessions/jackpot, unscoped collectors, undeclared renewal variable/leaked interval, missing Monster import and jackpot pot loss must not be ported.

Next: agree Spirit buildup/decay/burst, candidate outcome odds and repeat emoji behavior. Refill/bonus overflow are approved design changes but neither is deployed. No production data correction, merge or automatic monitor is authorized by this research.
