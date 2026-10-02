# Character rarity update — 2026-10-02

The user approved character-specific piece rarities. Configuration version 5 and piece manifest version 2 supersede the former global position rule. Stable IDs and filenames remain unchanged.

| Character | tl | tr | bl | br |
| --- | --- | --- | --- | --- |
| Selene | Common | Common | Common | Common |
| Marq | Common | Common | Common | Common |
| Qam | Common | Common | Common | Rare |
| Hadley | Common | Common | Common | Rare |
| Niklaus | Common | Rare | Rare | Legendary |
| Hellfed Marq | Common | Rare | Rare | Legendary |
| Maxim | Common | Rare | Legendary | Legendary |

There are 17 common, 7 rare and 4 legendary pieces. Ordinary draws retain approved 70%/22%/8% rarity selection, then choose uniformly within that pool. Duplicate exchanges remain uniform across missing IDs regardless of rarity. Common, rare and legendary reveal colors remain blue, purple and gold. The existing 105 token images are unchanged.

Existing inventory quantities and permanent ownership survive without migration or reset. Stored operation receipts retain their original rarity/color; future acquisitions use the new map and ledger configuration version 5. Replaying an old operation cannot reclassify its saved reward or grant another copy. Historical version 4 population simulations do not establish balance for this map; new balance measurement remains open.

Each trick/treat spends exactly one candy, including failures. A lost-candy treat loses the candy paid for that action, with no second deduction: 6 becomes 5. Its message now explicitly says “1 candy used for this treat.”

Changed: config/spooky-pieces.json, config/spooky-2026.json, services/spooky/config.js, services/spooky/flavor.js, services/spooky/admin.js, scripts/spooky-preflight.js, and configuration/collection/admin tests. Admin configuration exposes every piece's current rarity/color. Validation rejects malformed or unordered maps, verifies all 28 ordinary draws are reachable, and checks historical replay alongside new duplicate acquisitions. Full npm test: 261/261 pass; offline preflight and registry audit pass. Evidence: artifacts/spooky-development-session/rarity-full.log and rarity-registry.json. No dependencies, schema, outcome odds, action costs or command definitions changed.

Version 5 loaded through a development-only PM2 restart (total restart count 3). Development is online; production remains stopped and the error log has no new entries. No command registration, migrations or player resource corrections were performed. Next: manually test the clarified failure text and new collection reveals. Preserve the live /game command and production/optional disabled settings. Re-run population balance before asserting collection completion targets.
