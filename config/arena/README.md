# Arena configuration

- [characters/README.md](characters/README.md): individual development fighter builds and editing guide.
- `arena-balance-development.json`: shared development costs and settings.
- `arena-balance-production.json`: frozen production build.
- `arena-balance.json`: preserved legacy/test build.
- `arena-testing.json`: environment activation and Arena access settings.
- `arena-emojis.json`, `arena-portrait-framing.json`, `arena-rarities.json`: presentation settings.
- `arena-templates-production.json`: frozen production character metadata.
- `state/`: bot-managed selection preferences, message leases, and production-access state, with separate production files.
- Development `/arena diagnostic:true|false` (configured bot administrator only) manages `state/arena-diagnostics-development.json`. The default is compact damage logs (`false`); full logs and the status key use `true`. This setting is cached and applies to active fights on their next update, without a restart. It does not change combat rules.

Character filenames identify the skin and character: `arena-spooky-marq-development.json`, `arena-hellfed-marq-development.json`, `arena-spooky-maxim-development.json`, `arena-classic-azulis-development.json`, and `arena-classic-hendrix-development.json`. The hidden placeholder is `arena-template-development.json`.
