# Check-in commands

`CheckIn.js` defines `/check-in`; production requires a campaign role and #chat-in-hell, while development uses the owner-only exemption in #discord-bot-tests. `CheckInTest.js` retains `/checkin-test` for owner-only development acceptance. Both delegate to the check-in runtime. Keep command definitions here and business logic under `services/checkins/`.

The shared command loader discovers `commands/<feature>/*.js`; a deeper command definition would not be registered. This folder therefore contains only directly discoverable command entry points and this guide.

See [the feature layout](../../services/checkins/README.md) and [development acceptance](../../docs/checkins-development.md).
