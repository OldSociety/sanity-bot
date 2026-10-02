# Spooky population balance — Task 17

Run date: 2026-10-01. Branch: `feature/S-1-spooky`. Approved configuration version 4 is unchanged and disabled. This is an offline behavioral simulation, not live-server acceptance or a permanent badge award test.

Continuation note: Task 18a subsequently added scheduled cleanup/closure and pre-existing-role restoration safeguards in `playful.js`. The JSON hashes describe the recorded Task 17 source snapshot; they are not claims about all later source revisions. Balance parameters are unchanged and the SQLite gameplay parity check still passes. See the [lifecycle guide](spooky-lifecycle.md).

## Method and reproducibility

Run `node scripts/spooky-population-simulation.js 40` from the checkout. It writes [seeded results](spooky-population-results.json), including source SHA-256 hashes, seeds, options, sample sizes, resource totals, score distributions and cohort milestone distributions. Seed base is 170026; each scenario uses guild seeds 170026–170065. Refill, outcome selection, collection, theft, playful effects and prestige use the implemented services. The in-memory adapters are cross-checked against a 400-action actual SQLite trajectory, including bank purchases, effects, transfers and collection.

There are eight scenarios and 40 independent guilds per scenario. Each guild has three players in each of seven cohorts (21 registered players by October 15), plus ten nonparticipants except the no-outsiders scenario. This gives 120 player-months per cohort per scenario, 840 per scenario, and 6,720 total. Players within a guild interact and are **not independent statistical trials**. The cohort mix intentionally includes many highly active players; it is a stress population, not a measured forecast of this server's participation. No-outsiders tests a 21-human guild versus the default 31-human guild. More nonparticipants dilute candy gifts/theft; they cannot be Eye victims.

Schedules and gameplay use separate seeded random streams. Visit times are staggered by player, with four visits six hours apart or one daily visit. Actions are individually issued two seconds apart, merged chronologically across all sessions. No batch command is assumed. Treat/trick choices are random according to each scenario's mix. Actors may become targets before registering; registration reuses their existing candy clock and state. The first visit is never missed, ensuring a defined join date.

| Cohort | Join day | Intended actions/day | Missed days |
| --- | --- | --- | --- |
| Casual | October 1 | Uniform 3–4 | 20% independently after joining |
| Regular | October 1 | Uniform 6–10 | None |
| Engaged 75% | October 1 | 60 | None |
| Engaged 87.5% | October 1 | 70 | None |
| Engaged 100% | October 1 | 80 | None |
| Late 10 | October 10 | 80 | None |
| Late 15 | October 15 | 80 | None |

The three engaged percentages refer to **intended use of the theoretical 80/day natural supply**, not an enforced action ceiling or the fraction of all gifted candy. Starter candy, capacity waste, first-touch timing and theft change actual availability. Fixed-budget sessions stop if unfunded and do not retry missed actions later. The drain-candy sensitivity instead spends all currently available candy at each visit for the five high-activity cohorts, including gifts, Sweet Tooth bonuses and stolen candy. Its cohort names retain the baseline labels but those three full-month groups have the same drain behavior in that scenario.

All humans are manageable, names fit Discord's limit, role/nickname delivery succeeds before the next action, and nobody edits roles externally. Sweet Tooth role ownership persists. Fate is purchased immediately whenever the player has ten bank points. Baseline has zero bank and no Unwanted bonus; wealth scenarios have 20 bank without bonus, or 100 bank with all registered players Unwanted. There is no invented XP/birthday/booster income, paid catch-up, post-event redemption or new reward family. The 100-bank scenario combines starting wealth and bonus eligibility; it does not isolate their separate effects.

The simulation stops at the October boundary. Stored candy and pending candy accrued immediately before closure are separate fields; reporting pending refill does not materialize it or allow spending after closure. First-quarter/character times are fractional October calendar days. JSON also records elapsed days since joining. Timing quantiles are **conditional on reaching the milestone**; `never` and probability explicitly include players who do not. A character means all four pieces owned, the proxy for future badge eligibility; actual permanent badges remain deferred.

## Results

The saved run completed **10,850,825 actions**. All 320 guild trials passed resource conservation. The JSON retains mean/p10/median/p90 for actions, blocked sessions, ordinary/fate draws, pieces, character completion, generated and remaining duplicates, exchanges, Eye/candy losses, remaining candy/Eyes/bank, cursed actions and each prestige track. It also retains first-quarter, first-character, three-character and seven-character reach rates and timing. Values are simulation outcomes under the stated assumptions, not player guarantees.

### Baseline: equal tricks/treats, four visits, no fate bank/bonus

Draws exclude exchange rewards; exchanges are counted separately. A displayed 0.0 mean can hide a small nonzero value: one regular player drew one quarter; no casual player drew any. Nobody in either low-activity cohort completed a character.

| Cohort | Mean actions | Mean draws | Mean characters | First character reached | Three reached | Seven reached | Characters p10/median/p90 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Casual | 87.2 | 0 | 0 | 0/120 | 0% | 0% | 0/0/0 |
| Regular | 249.1 | 0.008 | 0 | 0/120 | 0% | 0% | 0/0/0 |
| Engaged 75% | 1,858.5 | 18.5 | 0.23 | 23/120 (19.2%) | 0% | 0% | 0/0/1 |
| Engaged 87.5% | 2,167.0 | 26.1 | 0.75 | 67/120 (55.8%) | 1.7% | 0% | 0/1/2 |
| Engaged 100% | 2,474.5 | 34.1 | 1.91 | 110/120 (91.7%) | 25.8% | 0% | 1/2/3 |
| Late 10 | 1,760.0 | 23.8 | 0.67 | 65/120 (54.2%) | 1.7% | 0% | 0/1/2 |
| Late 15 | 1,360.0 | 17.7 | 0.16 | 18/120 (15.0%) | 0% | 0% | 0/0/1 |

| Cohort | First quarter reached | Median first quarter, October day | Median first character | First-character p10–p90 | Median three characters |
| --- | ---: | ---: | ---: | --- | ---: |
| Casual | 0/120 | — | — | — | — |
| Regular | 1/120 | 2.9 (one player only) | — | — | — |
| Engaged 75% | 120/120 | 2.3 | 27.8 | 18.7–31.2 | — |
| Engaged 87.5% | 120/120 | 2.0 | 25.9 | 17.0–30.8 | 30.1 (two players only) |
| Engaged 100% | 120/120 | 1.8 | 21.2 | 13.0–28.9 | 28.6 |
| Late 10 | 120/120 | 10.7 | 27.4 | 20.3–31.2 | 30.7 (two players only) |
| Late 15 | 120/120 | 15.6 | 29.4 | 25.3–31.4 | — |

All seven was never reached in baseline, so there is no conditional completion time. For the 87.5% cohort, 53/120 never reached even the first character. The October 25.9 median describes the 67 successful players, not the full cohort. This late first-character experience misses the intended early engagement goal.

### Scenario sensitivity

Entries below are **mean completed characters / probability of all seven**. Other cohort results and score/resource distributions are in the JSON. The three drain groups are identical policies with different random histories, so their modest differences are sampling variation, not an effect of the old percentage labels.

| Scenario | Engaged 75% | Engaged 87.5% | Engaged 100% | Late 10 | Late 15 |
| --- | --- | --- | --- | --- | --- |
| Baseline, 50% treats | 0.23 / 0% | 0.75 / 0% | 1.91 / 0% | 0.67 / 0% | 0.16 / 0% |
| All treats | 4.3 / 4.2% | 5.9 / 31.7% | 6.7 / 74.2% | 3.6 / 0% | 1.9 / 0% |
| Trick-heavy, 25% treats | 0.02 / 0% | 0.05 / 0% | 0.4 / 0% | 0.1 / 0% | 0.02 / 0% |
| One daily visit, 50% treats | 1.4 / 0% | 2.5 / 0% | 3.7 / 0.8% | 1.8 / 0% | 0.8 / 0% |
| 20 bank, no bonus | 0.4 / 0% | 1.2 / 0% | 2.1 / 0% | 0.8 / 0% | 0.4 / 0% |
| 100 bank, Unwanted bonus | 1.6 / 0% | 2.8 / 0.8% | 4.3 / 6.7% | 2.3 / 0% | 1.4 / 0% |
| No nonparticipants | 0.3 / 0% | 0.9 / 0% | 1.8 / 0% | 0.6 / 0% | 0.2 / 0% |
| Spend all available candy | 6.6 / 77.5% | 6.7 / 84.2% | 6.8 / 82.5% | 5.0 / 14.2% | 2.8 / 0% |

Casual and regular players completed **zero characters in every scenario** except regular players in the 100-bank/Unwanted scenario: 6/120 completed one. Even in the theft-free all-treat population, their average draws were 1.9 and 6.2, respectively, and none completed a character in this finite sample. Thus theft protection alone does not fix the activity/reward mismatch.

All-treat engaged 87.5% players reached a first character at median October 13.4 and all seven in 38/120 cases, at conditional median October 29.9. Engaged 100% reached all seven in 89/120 cases at median October 28.1. Those rates differ sharply from the mixed baseline; a single assumed 13% return cannot predict both strategies.

Baseline created 72,971 Eyes and transferred 72,569 across 1,194,752 actions: about 6.1% new Eyes per action. Trick-heavy created 37,479 and transferred 104,481. All-treat created 155,663, transferred none. Daily visits created 106,139 and transferred 35,958: closely grouped sessions change available victims/shields and let players convert within a session. This benefit is schedule-dependent and should not be advertised as a guaranteed daily-visit advantage.

Drain-candy full-month players averaged roughly **4,726–4,741 actions**, around 152–153/day, without any external candy grants. All-seven completion was 77.5–84.2%, with successful completion medians October 27–28. Late October 10 players averaged 3,564.5 actions and finished all seven in 17/120 cases. This shows that the natural refill total cannot serve as the assumed maximum action count.

### Baseline duplicate exchanges, theft and remaining resources

All entries are per-player means. Candy theft losses for late joiners include pre-registration targeting. Losses may exceed a stored balance because the same currency can circulate repeatedly; they are debits, not unique currency destroyed.

| Cohort | Duplicates generated | Exchanges | Eyes stolen from player | Candy stolen from player | Extras remaining |
| --- | ---: | ---: | ---: | ---: | ---: |
| Casual | 0 | 0 | 11.1 | 252.6 | 0 |
| Regular | 0 | 0 | 31.4 | 249.6 | 0 |
| Engaged 75% | 5.6 | 0.7 | 132.5 | 220.2 | 2.2 |
| Engaged 87.5% | 10.5 | 1.7 | 132.5 | 213.5 | 2.1 |
| Engaged 100% | 16.4 | 2.8 | 128.2 | 207.5 | 2.2 |
| Late 10 | 8.9 | 1.4 | 95.4 | 223.4 | 1.9 |
| Late 15 | 5.0 | 0.6 | 73.6 | 227.8 | 1.9 |

| Cohort | Stored candy at close | Candy including pending accrual | Eyes | Bank | Treat prestige | Trick prestige |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Casual | 78.8 | 79.1 | 0.1 | 0 | 56.4 | 45.3 |
| Regular | 78.8 | 79.1 | 0.1 | 0 | 161.5 | 130.2 |
| Engaged 75% | 73.6 | 75.1 | 1.4 | 0 | 1,204.8 | 958.6 |
| Engaged 87.5% | 73.3 | 74.7 | 1.5 | 0 | 1,394.6 | 1,119.4 |
| Engaged 100% | 71.1 | 72.3 | 1.3 | 0 | 1,583.2 | 1,275.3 |
| Late 10 | 71.3 | 72.4 | 1.6 | 0 | 1,129.9 | 917.5 |
| Late 15 | 70.7 | 72.5 | 1.4 | 0 | 871.1 | 701.0 |

Low-activity players finish with nearly full candy but almost no collection progress. Their limitation is actions and surviving Eye accumulation, not a lack of energy. High-activity fixed-budget players also leave gifted/stolen candy unused; the drain scenario explicitly tests spending it instead. Prestige values are developer audit data, not player-facing published scoring rules.

## Balance implications and proposed next experiment

Two mechanisms make the earlier independent 13%-yield arithmetic unreliable. A trick Eye transfers existing currency whenever an eligible funded victim exists. It creates one only when no such victim exists. Also, Eyes remain stealable between gaining one and reaching the automatic five-Eye conversion. Frequent actors can repeatedly drain infrequent actors' small balances. The one-hour shield helps near an immunity result; it does not protect a balance throughout a casual player's absence.

Even a theft-free regular player taking eight daily actions averages only `248 × 0.13 / 5 = 6.45` ordinary draws before curse overrides and integer conversion. Four complete characters require at least 16 distinct pieces. A casual player taking about 87 actions averages about 2.26 draws under that same favorable arithmetic, before duplicate/rarity constraints. A five-duplicate exchange does not accelerate a player who has not drawn five duplicates. Thus the casual/regular completion aspirations conflict with the currently approved low action counts even before theft.

Candy regeneration is not a maximum number of actions. Sweet Tooth gives an already-owning caller up to five candy, candy theft often replenishes the actor's action cost, and treats give recipients more candy. Spending all gifted/stolen candy can therefore produce far more than 2,480 monthly actions. Conversely, saving until the capacity of 80 discards natural generation. No hidden daily draw/action cap should be introduced to conceal either effect.

Recommended order for a follow-up balance experiment, **not approved implementation changes**:

1. Resolve the casual/regular activity definition: 3–10 individual actions/day versus 3–4 visits spending substantially more candy. Model both explicitly before changing probabilities.
2. Choose whether to protect collection progress between visits. Candidate experiments could reserve a small earned Eye balance from theft, limit repeat victim losses, or attach longer protection to registration/activity. Each changes the approved theft rules and requires approval; none is implemented here.
3. Evaluate an early character-focused reward or increased low-activity collection supply if individual-action targets remain. Keeping 13%/+1/5 with only 3–10 daily actions cannot be presumed to meet those targets. Avoid silently making all ordinary draws uniform: 70/22/8 is approved.
4. Then rerun the selected candidate against casual/regular/engaged profiles, several guild activity mixes, different bank eligibility and the drain-candy case. Compare first-character timing and all-seven probability together; raising global Eye supply alone may let high-activity players finish too early.

No probability, cost, theft restriction, role reward, automatic conversion or rarity setting has been changed in Task 17. Lifecycle implementation remains Task 18; balance decisions must be settled before enabling the event.

## Evidence and limitations

The full offline suite passes **142/142**, including two new simulation checks. One verifies the seeded adapter against actual disposable SQLite gameplay; the other verifies never-reached versus conditional milestone reporting. The existing collection tests cover duplicate batch consumption, stable first-copy retention and terminal extras. Every simulated guild checks candy conservation (starter + actual refill + gifts − action spending) and Eye conservation (finds − conversion spending); transfer amounts never count as creation. Adapter setup initially exposed an instance-aliasing double-debit and was corrected before the saved full run; no production service change was needed.

Sampling is deliberately finite. P10/median/p90 expose spread; observed zero completion is not proof of impossibility. Guilds are the independent units, so 120 players must not be used as 120 independent samples to claim narrow confidence bounds. Larger runs and realistic guild composition are appropriate after a candidate is chosen. The model assumes successful permission/delivery handling, complete stable membership and rational immediate fate spending. It does not measure command fatigue, player preference, Discord outages or external fate earnings. Schedules are illustrative, particularly for people joining late who may already have been targets. Historical `spooky-cohort-*` and `spooky-collection-simulation.js` results are superseded for forecasting and are preserved as history.
