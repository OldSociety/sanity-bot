# Snowball Fight implementation handoff

Branch: `snowball-fight`. Scope: initial development replacement, staged source only. Historical Winter source/data and pre-existing work remain. No commit, push, live database initialization, Discord command registration, test messages, bot reload or PM2 change was performed. Production command definitions were compared with HEAD and are identical for the evaluated date; runtime replacement guards are development-only.

## Delivered

All 17 requested subcommands have real implementations: start, collect, throw, stats, leaderboard, daily, quests, claim, fight, shop, collection, choose, item-info, gift, achievements, news, help. Buttons implement purchases, claims, pagination and explicit encounter turns. The working collection → PvP → daily/quest currency → shop → character victory → badge unlock/equip loop is covered by isolated tests.

Development retires `/snow` registration, old controls, the maintenance worker and playtest selection. Historical direct models are retained; they are not migrated into the replacement or scheduled by it. Snow production, offline accumulation, automatic attacks, shovels, Gym/Sweat, Diamond Press and old recipes have no dependency path from replacement actions. The old production routing remains available on its existing schedule.

An additive migration creates twelve feature tables and ranking/target-window indexes; it reuses permanent `BadgeOwnership` and introduces a shared transactional award helper. No existing table or row is removed. Immediate transactions, unique claim/ownership keys, durable interaction receipts and encounter revisions prevent duplicated resources and rewards. Guild scoping, enrollment, membership, bot/self-target checks and owner-bound buttons are enforced before applicable mutations.

Configuration is centralized in `config/winter/snowball-fight.json`: 10 starting snowballs, capacity 50, collect 2/60 seconds, 70% PvP accuracy, 1 snowball/throw, 10-second throw cooldown, 1 Button/eligible hit up to 30/day, repeat-target/reciprocal restrictions, daily 10 snowballs + 20 Buttons, quests 15–25 Buttons, first daily character victory 10 Buttons, achievement awards 5 Buttons. Shop: ammunition bundle 5 Buttons, cocoa 8, cosmetic 40. Badge: three victories on separate UTC days, one mark per character/day. Existing Classic portraits and profile/badge infrastructure are reused. Equipped badges are shown on the Snowball Fight profile; earned badges are recognized by shared personal/community/notification profile catalogs.

## Encounter measurements

15,000 seeded, exact-rules baseline fights (5,000 per character), without cocoa:

| Character | HP / damage / accuracy | Win rate | Average turns | Snowballs per victory including losses | Expected days to badge, one attempt/day |
|---|---|---|---|---|---|
| Hendrix | 30 / 6 / 70% | 76.28% | 5.84 | 7.65 | 3.93 |
| Kylax | 36 / 5 / 70% | 76.78% | 7.06 | 9.20 | 3.91 |
| Azulis | 24 / 8 / 80% | 65.38% | 4.44 | 6.80 | 4.59 |

Player: 30 HP, 6 damage, 80% accuracy. Encounters have at most 12 turns and expire after 30 minutes without unattended progression. These initial values were adjusted after an initial run showed over 98% win rates. The initial report is retained as `artifacts/snowball-fight/study-initial.json`; final assumptions, hashes and results are in `study.json`.

Seven-day scenarios use the real transactional store. Casual: daily + two collections + one rotating character fight/day; final 6 wins, 1 badge, 45 snowballs, 415 Buttons and the cosmetic. Active: daily + twelve collections + three character fights + twenty throws across four enrolled targets + one gift/day; final 19 wins, 3 badges, 105 hits, 3 snowballs, 725 Buttons and the cosmetic. Active PvP produced only 20 Buttons over the week under anti-farming rules. Both resource ledgers reconcile exactly. These are reproducible samples, not population averages. Casual collection was capacity-blocked six times. Currency accumulates once the small initial shop is exhausted; further sinks remain a future economy/content decision.

## Verification and remaining scope

See the final test summary in `artifacts/snowball-fight/verification.json` and logs in the same folder. Dedicated coverage includes UTC boundaries, simultaneous duplicate claims, cross-connection writers, concurrent gifts, hit/miss/ammo statistics, anti-farming, shop capacity, defeat/cancellation/expiry, stale controls, failed Discord delivery, restart-persistent quest claims and fights, three-day badge unlocking, shared profile catalog integration and production exclusion. JavaScript syntax and whitespace checks are also recorded. There is no configured lint/format command in this repository.

| Check | Result |
|---|---|
| Final dedicated Snowball Fight tests | 21/21 pass |
| Final Winter + Snowball Fight suite | 375/375 pass |
| Profile + badge + feature integration | 59/59 pass |
| Feature + badge + channel + event lifecycle checks | 35/35 pass |
| JavaScript syntax / whitespace | 21 files pass / clean |
| Study source hashes / production command definition parity | Match / unchanged |
| Full repository diagnostic | 1,382 pass; 137 fail; 1,519 total |

The broad repository suite contains unrelated failing assertions. Baseline command evidence proves HEAD already reports 19 non-Arena/Cocoa/Idle commands against stale expectations of 14, and lacks the expected Arena diagnostic option. Those assertions were preserved. The historical Winter policy test now explicitly disables the replacement in its fixture so it continues testing every original legacy policy assertion; replacement-enabled retirement has separate coverage.

Remaining: human Discord visual/interaction acceptance and controlled development activation; seven additional Classic encounters/art coverage; special ammunition and larger shop/economy sinks. Classic Collector tracks all ten, but is intentionally unobtainable until the remaining tested characters are enabled. No balance claim is made for inactive encounters. A Monster Hunter daily implementation was not found in current source, so the daily uses new UTC claim logic with existing transaction conventions. The previous achievement preview was presentation-only; its style was extracted into a shared progress-bar helper and paired with new persistent progression.

For activation steps and all data/behavior details, see [README.md](README.md). Production activation still requires separate human authorization.
