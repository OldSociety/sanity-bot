# Spooky unique pieces, host ranking and six-hour shields

Config20, October4, on `codex/spooky-collection-fixes`, supersedes the old duplicate exchange and12-hour shield rules. Slots/refill and Mirror/Copycat remain outside this change.

## Host ranking

The verified junkrabbit Discord account is138131238803210240. It alone appears after all competitive players as **Community host**, without a numbered rank. Scores and activity continue accumulating; gifts, resources, pieces, badges and Crown gameplay remain available. Other administrators stay eligible. Competitive ranks and ties ignore the host row, and new winner proofs exclude only the configured host identity. Prior frozen proofs remain untouched.

## Unique pieces

Ordinary/Eye and paid draws choose only pieces the player does not already own. Eye rarity weights remain70/22/8 and paid weights50/35/15 while all rarity pools have missing pieces. Exhausted pools are removed and the remaining weights renormalized. Within a chosen rarity, missing pieces remain equally likely. There is no second roll for duplicates and no five-extra exchange under this policy. Exact grants reject an already owned piece.

After all28 pieces are collected, future Eyes are retained and paid draws reject with their entire transaction rolled back. Existing first copies, earned badges, historical receipts and ledger evidence remain intact. Help, purchase and collection screens explain that every new quarter is unowned; historical duplicate receipt rendering remains supported, while the current wording gallery omits its old duplicate example.

## Quiet compensation

`services/spooky/duplicate-compensation.js` converts each scoped quantity above1 to1 and credits4 Eyes per removed extra, atomically with explicit quarter-debit and Eye-credit ledger rows. One durable worker operation per event/guild prevents repeated compensation after reruns or concurrent attempts. No Discord notification, message, badge grant, score, Fate/Bank, candy refill or gameplay action is generated.

Compensation is an exact Eye balance credit, rather than a silent piece draw. The next qualifying Eye acquisition runs the normal automatic conversion into unique quarters. At full completion, Eyes remain held. Production read-only planning found one extra `mrq_bl` belonging to junkrabbit, worth4 Eyes; the stopped-writer cutover rechecks the actual inventory.

## Shields

Duration was12hours and is now6hours. New shields retain their frozen2–3 charges; the breaking hit is still fully blocked, including Crown theft. Existing shields are shortened from their saved original cast time or corresponding effect ledger timestamp, never from restart/maintenance time. A missing legacy cast timestamp gets one conservative stable baseline if shortening is necessary; expiry never extends. Normal minute/startup/pre-command cleanup removes expired effects and reconciles their saved nickname restoration. Existing manual nickname conflicts stay guarded rather than being overwritten.

New regressions cover all28 unique pieces, depleted rarity pools, completed collection behavior, atomic/replayed compensation, compensation overflow rollback, host pagination/ties/future winner exclusion, and old12-hour shields shortening and restoring at6hours. Historical duplicate fixtures explicitly request the old policy so replay/audit coverage remains meaningful.

## Rollout

Use the independent production runtime described in [branch workflow](branch-development-workflow.md). Stop its single writer, verify backup/integrity, install only the reviewed source/config files, apply the quiet compensation once, then restart and check fresh logs plus actual nickname restoration. Development is switched back to the preserved leveling checkout after these fixes are integrated there. No schema migration, new command, odds change for Eyes/Crown, participant reset, historical rescore or unrelated admin exclusion is part of the rollout. Exact operational evidence resides in ignored `.runtime/spooky-fixes`.
