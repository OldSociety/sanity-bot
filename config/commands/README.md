# Command configuration

`channel-policy.json` records each environment's permanent bot-tests channel. All channel-restricted commands must allow the configured test channel alongside their normal feature channels. New restrictions should use `services/command-channels.js` so the default remains consistent. See [the command-channel policy](../../docs/command-channel-policy.md).

Other files in this directory retain their own command/preview/event settings. Adding a testing location does not enable disabled commands or bypass roles, ownership, environment or feature-window checks.
