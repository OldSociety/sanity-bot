# Sanity communication decision — October 4, 2026

Players begin at 100. The eye supplies passive feedback; the first private reminder becomes eligible at 69 or below. Reminders arrive on a qualifying shared-channel chat post, with at most one attempted delivery per rolling seven days. Discord chat cannot deliver an ephemeral response, so this is a DM. Closed DMs never cause a public fallback. The reminder snapshots settled Sanity before that post earns presence; recovering above 69 suppresses future reminders. Zero has one special notification, sharing the weekly cooldown.

The reminder does not publish earning formulas, daily caps, conversation spacing, or instructions to farm messages. Balances and purchase prices remain accurate because Sanity is spendable. These are development rules; production is unchanged.

## Research and its limits

| Primary source | Finding | Application here |
| --- | --- | --- |
| [Thomas Grip: Amnesia's Sanity meter](https://www.gamedeveloper.com/design/game-design-deep-dive-i-amnesia-i-s-sanity-meter-) | The creative director describes replacing numerical, game-like feedback with imagery and brief state text to support atmosphere. Earlier punitive versions interfered with play. This is a designer retrospective, not a retention experiment. | Let the existing eye convey deterioration. Keep reminder text short and atmospheric. Unlike Amnesia, our spendable balance still needs to be visible and truthful. |
| [Duolingo's copy experiments](https://blog.duolingo.com/copy-testing-experiments/) | Its team reports an 8% increase in German notification opt-ins after revising wording, but no significant effect when repeating that test in Spanish. Another warmer Spanish message reduced lesson quits. | Tone matters, but success does not transfer automatically between audiences. Test interpretation with our own players before asserting any retention benefit. |
| [Apple notification guidelines](https://developer.apple.com/design/human-interface-guidelines/notifications) | Apple recommends concise, relevant notifications and avoiding repetitive messages and task instructions. This is platform design guidance, not evidence for a specific weekly interval. | Send one contextual nudge when someone returns, without a sequence of threshold alerts or recovery instructions. |

The recommendation is a welcoming, fictional voice. A low value should not suggest that the player has lost their place in the community. Avoid guilt, threats, attendance policing, and invented effects on Fate or levels. This is an inference from the sources and the community's stated goals, not a claim that one wording is universally most successful.

## Original research copy (superseded)

- Fading: “The eye has begun to stir. Familiar voices still carry through the dark.”
- Fraying: “The edges are fraying. There are still familiar voices on this side of the dark.”
- Waning: “The eye is wide now. You haven’t lost your place here.”
- Lost: “The eye is fully open. Your place by the fire is still here.”

The user rejected these abstract lines and approved an explicit invitation: “Your sanity is fading... but don’t worry, community helps keep the darkness at bay. Why not leave a post in the server? Fight the darkness together!” Lower bands retain the invitation with their appropriate state. Each message includes the band and saved balance. Exact earning formulas remain private. This user decision supersedes the earlier recommendation to omit recovery instructions.

## Human review

Ask development testers what the eye and message suggest, whether the text feels welcoming or punitive, and whether it implies any nonexistent consequences. If players cannot connect the atmosphere to Sanity, make the label clearer before adding more messages. Compare an atmospheric line with a warmer welcome-back line in a later authorized test. Do not optimize for message volume: spam would defeat the purpose. No A/B infrastructure, analytics, or additional notification campaign is introduced in this change.
