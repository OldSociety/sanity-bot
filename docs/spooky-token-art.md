# Token collection artwork — Task 19a

The user supplied token_combinations_uniform_all_70.zip on 2026-10-01 and authorized token image integration. This supersedes the token-art deferral; permanent badges/emojis/profile/level-up work remains deferred. Work stays on feature/S-1-spooky; no Discord uploads or live sends occurred.

## Shipped assets and selection

assets/spooky/tokens contains 105 PNGs: 28 single quarters from token_quarters_transparent_v2.zip, 70 two/three-piece combinations and seven full circles supplied afterward. Six full circles were copied unchanged; Hellfed Marq was edited with the built-in image tool into a circular token with transparent exterior. Archive folders are flattened into the allowlisted basename, with stable bot IDs (Marq = mrq, not marq). Positions always order tl, tr, bl, br. Example: mrq_tr_bl.png. Every nonempty subset of one to three positions exists for all seven characters. No archive instructions were treated as user instructions; README.txt was not imported.

All seven full-circle images now exist as <character>_tl_tr_bl_br.png. Four-piece reward and character-completion embeds attach the full circle. Character identity was visually cross-checked against original quarters: Image 1 hfm (edited), 2 had, 3 mrq, 4 sel, 5 max, 6 qam, 7 nik. All full PNGs have transparent corner pixels. Six original full circles are 2048x2048; the built-in edited hfm is 1254x1254. No original image was overwritten. Permanent badge art remains separate.

## Durable image semantics

collection.add snapshots ownedPositions immediately after each acquisition in its root transaction. This applies to Eye draws, fate draws, duplicate exchanges and admin grants. Each reward in a multi-award action retains its own acquisition snapshot; later exchanges/draws do not change earlier images. Duplicates do not expand the circle. Inventory updates and receipts remain atomic; no additional tables/migrations/version/odds are needed.

presentation displays the cumulative image and collection count, retaining acquired-piece rarity color/text and duplicate/exchange labels. Public announcements still follow existing mention policy. Historical award data without ownedPositions uses the single acquired position if re-rendered; already persisted message payloads stay unchanged on replay. No current-inventory read occurs during delivery.

Payload JSON stores files [{tokenAsset, name}] with a shipped allowlisted basename and attachment:// embed URL. token-art.preparePayload resolves it to an absolute local file only at Discord send time, preserving portability across machines. Unknown paths, mismatched names and arbitrary attachments are rejected. Durable outbox and controller's fallback send both hydrate descriptors after commit. Deployments must include assets/spooky/tokens; do not delete files referenced by retained receipts/outbox.

Discord returns CDN URLs for attached embed images. The trusted admin adapter fetches attachment filename/URL evidence; acknowledgement maps a matching CDN image back to its saved attachment:// reference before full payload comparison. Wrong/missing attachment evidence fails closed; economy ownership is untouched and ambiguous sends never auto-resend. Explicit resend retains the saved artwork descriptor.

## Validation and continuation

Six new tests cover all 105 shipped PNG signatures/subsets, deterministic ordering, path rejection, snapshot/replay/duplicates, public rendering and actual outbox hydration with ambiguous-send acknowledgement. Full suite 208/208. Preflight checks all 105 readable image paths alongside existing scoped configuration/command checks. Visual inspection confirmed mrq_tr_bl.png matches the user's example.

Changed collection.js, presentation.js, notifications.js, controller.js, admin-resolution.js, admin-runtime.js and scripts/spooky-preflight.js; added token-art.js, tests/spooky-token-art.test.js, collection/resolution test cases, assets/spooky/tokens, this guide and refreshed preflight results. Updated README/AGENTS/handoff/rules/checklist/acceptance guide. No real DB/Discord/dependency/gameplay config change.

Next: obtain badge artwork, resolve existing balance/operational settings, review legacy registration and run separately authorized development acceptance. Tasks 9/19 overall and full 20 remain open; token artwork subtask 19a is complete, including all full circles.

## Circular edit provenance

Built-in image_gen edit used only the square Hellfed Marq source; six circular originals were preserved. Source: codex-clipboard-ec11fccc-31dc-43ce-aa82-f6ad0455b758.png. Project result: assets/spooky/tokens/hfm_tl_tr_bl_br.png. The generated source remains in Codex generated_images; the game references the project copy. This is a generative edit rather than a pixel-identical crop of the low-resolution source.

Exact prompt: Edit target: the supplied square fantasy character artwork. Make this a circular token by placing the original image within a perfect circular crop, with genuinely transparent alpha outside the circle. Preserve the original character, pose, face, chains, clothing, dark scene and colors as closely as possible; no redesign, no new decorations, no border, no lettering. Keep the character's face and upper body clearly visible, center the circular crop on the source artwork, retain as much of the existing figure as possible inside the circular disk. Square PNG canvas with transparent corners; dark background remains inside the circle. This is the Hellfed Marq full collectible token for an existing game.
