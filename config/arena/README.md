# Arena configuration

- [characters/README.md](characters/README.md): individual development fighter builds and editing guide.
- `arena-balance-development.json`: shared development costs and settings.
- `arena-balance-production.json`: frozen production build.
- `arena-builds-production.json`: approved production copies of all character sheets, keyed by character (`maxim`, `selene`, `hendrix`, etc.). Runtime helpers read these copies through `build-profile.js`.
- `arena-balance.json`: preserved legacy/test build.
- `arena-testing.json`: environment activation and Arena access settings.
- `arena-emojis.json`, `arena-portrait-framing.json`, `arena-rarities.json`: presentation settings.
- `arena-templates-production.json`: legacy production character metadata used by the older fallback profile.
- `state/`: bot-managed selection preferences, message leases, and production-access state, with separate production files.
- Development `/arena diagnostic:true|false` (configured bot administrator only) manages `state/arena-diagnostics-development.json`. The default is compact gameplay logs (`false`); `true` adds detailed rolls/costs/timings. Live dice, thumbnails and the status key stay visible in both modes. This setting is cached and applies to active fights on their next update, without a restart. It does not change combat rules.

Character filenames identify the skin and character: `arena-spooky-marq.json`, `arena-hellfed-marq.json`, `arena-spooky-maxim.json`, `arena-classic-azulis.json`, and `arena-classic-hendrix.json`. The hidden placeholder is `arena-template.json`.

The individual character files are editable development sheets. Production's approved values are grouped in the two production snapshot files above. Promote a reviewed set of changes to update production.
