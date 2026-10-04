# Spooky integration into main

The user authorized merging Spooky on October 4, superseding the historical hold pending human judgment of live stability. This integrates feature/S-1-spooky through 11ef8a1 into main, including config19, the live performance fixes and the previously accepted profile changes. Slots/refill and Mirror/Copycat remain separate deferred work; merging does not implement or enable them.

The merge retains the current Spooky command registry and guarded deployment tools. Profile metadata and the guild/runtime guard remain development-only. Runtime loading skips restricted commands, and offline deployment definitions filter them for the selected environment. A regression verifies that Spooky and its admin command remain in both registries while profiles appear only in development.

The current sharp version pin and profile test script from main are retained alongside the full Spooky test runner and syllable dependency. Existing event configuration, activation, ownership, economy, assets and database handling are preserved. No live database operation, command deployment, bot reload or remote push is part of this merge. The original feature branches remain available as history.

Validation: 414/414 full isolated tests pass, including the merged production/development registry regression. Offline config19 preflight, entry-point/audit syntax and scoped whitespace checks pass. Evidence: artifacts/spooky-main-merge-tests.log.
