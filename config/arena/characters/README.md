# Arena character builds

Development uses one combat build per file. Start here when editing a fighter:

| Fighter           | Build file                                                                       |
| ----------------- | -------------------------------------------------------------------------------- |
| Spooky Marq       | [arena-spooky-marq-development.json](arena-spooky-marq-development.json)         |
| Hell-fed Marq     | [arena-hellfed-marq-development.json](arena-hellfed-marq-development.json)       |
| Spooky Maxim      | [arena-spooky-maxim-development.json](arena-spooky-maxim-development.json)       |
| Classic Azulis    | [arena-classic-azulis-development.json](arena-classic-azulis-development.json)   |
| Classic Hendrix   | [arena-classic-hendrix-development.json](arena-classic-hendrix-development.json) |
| Spooky Selene     | [arena-spooky-selene-development.json](arena-spooky-selene-development.json)     |
| Template (hidden) | [arena-template-development.json](arena-template-development.json)               |

Open the JSON build for current values; this guide does not duplicate character stats.

## Change HP or Attack

Edit `baseStats` in the character's file. For example, in `arena-spooky-marq-development.json`:

Change `baseStats.hp` and `baseStats.attack`.

These are Level 1 values and apply to both player and enemy roles. Each additional level currently adds 30 to HP and Attack. Reload development and start a new fight after editing; existing fights retain their starting stats. Production stays on its frozen configuration.

## File structure

Every build has the same main sections:

- `identity`: stable character/kit identifiers. Preserve these identifiers to retain saved selections. Display catalog and artwork metadata remain in their existing catalogs.
- `baseStats`: Level 1 `hp` and `attack`.
- `abilities`: `special1`, `special2`, `special3`, with the current ability types and coefficients. Missing costs inherit shared Arena costs.
- `enabled`: whether the development loader applies this build. Availability in menus is managed separately by the character catalog.

`passive` holds passive configuration when applicable. Spooky Marq's `passive.revivePercent` sets Brink restoration for combat, AI forecasts, and descriptions together. Hendrix also has `basic` and `bleeding` sections for his strike rules. Optional `aiOverrides` preserves enemy resolution metadata; player and enemy use the same damage coefficients. Azulis retains her existing Finisher type metadata through this field.

Stress capacity, Rage, critical rewards, and level scaling still follow shared Arena rules. The existing Hendrix `baseStats.stress` field records his design value; it does not change the shared Stress capacity.

Template remains a separate hidden placeholder for unfinished characters, with fake stats. Spooky Selene has her own development build; her Classic skin remains unavailable.

## Shared and historical configuration

- `config/arena/arena-balance-development.json`: shared development costs and settings, without per-character overrides.
- `config/arena/arena-balance.json`: preserved legacy/test profile. Its old character entries are not the place to edit current development fighters; these files override them.
- `config/arena/arena-balance-production.json`: frozen production profile, intentionally independent of development edits.
- `services/arena/character-config.js`: explicit list of development build files.

The old top-level Hendrix/Hellfed/Azulis/Template development files were moved into this folder. Historical reports and backups retain their original paths and data.

New resource costs may use `dualityCost`: Hope for the player, Fear for the AI. Legacy `hopeCost` remains compatible. Backend combat uses `services/arena/duality.js` to read, grant and spend the same resource without role-specific field checks. Dice-face names, UI labels and existing state fields remain compatible. Selene’s `passive.stackPercent` and `maxStacks`, S1 `healDecay` / `minimumHealPercent`, and S2 `blockChance` / `duration` are editable in her sheet.
