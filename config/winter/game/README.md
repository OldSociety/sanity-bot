# Editable Winter game settings

| File | What to edit |
|---|---|
| [balance.json](balance.json) | Snowman HP/damage, growth modifiers, Shop snow-equivalent prices, conversion rates, generation, accuracy and combat cadence |
| [emporium.json](emporium.json) | Button prices and clothing/Fire Flower effects |
| [snowman-4.json](snowman-4.json) | S3 victories required for S4; S4's price belongs in `balance.json` |
| [settings.json](settings.json) | Development server, enable flag, processing sizes and diagnostic entry/stop choices |

`workerIntervalMs` is a retained historical setting; the current worker uses its existing three-second loop. Do not use that field to tune attack speed. Actual combat cadence belongs in `balance.json`.

Shop prices in `balance.json` use **snow equivalents**. The game converts these at `diamondSnowCost` for diamond purchases. With the current 1,000-snow conversion, S3's `3000000` means 3,000 diamonds and S4's `8000000` means 8,000 diamonds. Edit that single price, not a copied button label.

Spicy and Ice ammunition spend snow directly: `redSnowCost` (currently 1,000) and `iceSnowCost` (currently 2,000). Equipment and recipe unlocks still spend diamonds. The Shop offers quantities; an exhausted ammunition control on Throw buys Max and equips it without resetting the fight. Fire needs five Spicy per attack.

`snowmen` rows hold each tier's base values. `statPercent` scales the complete grown HP/damage total. S2's opening fields apply before that percentage. Do not confuse completed victories with player defeats.

The `version` field is an existing saved-state identifier. Old save compatibility is handled in `services/winter/game/game.js`; do not rename old identifiers or erase upgrade histories to make a changed save load.

Balance edits are safe to explore in a fresh diagnostic run after a development reload; old runs stay available for review. Existing player saves use strict compatibility checks, so a changed balance may need an explicit save upgrade before those profiles can continue. That safety check has not been loosened by this cleanup. Do not reset everyone's progress or remove the check to try a number.

The active runtime does not use every experimental field in `balance.json`: null Yellow/Fire candidates and later tiers are placeholders for historical studies, not approved new mechanics. The current Fire Flower uses `emporium.json`. This remaining mixed historical schema is documented rather than silently deleting inputs needed by studies.
