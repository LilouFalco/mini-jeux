La Guilde mystère, local-first integration

The game supports two to four distinct named players passing one phone. Each gets an independently drawn trait, so duplicate assignments are permitted. A supported character query against one opponent consumes the current turn and records its yes/no answer in history grouped by target. Repeated questions remain legal and also consume a turn. A wrong trait guess advances the turn; the first correct guess wins immediately. Other players are not ranked.

Content is intentionally a curated, bounded catalog. Unknown characters are not accepted. Trait definitions and canonical scopes determine answers, rather than free-form interpretation. A theme combination exposes a trait only when each selected theme has at least three positive examples and the combined pool has at least three negative examples. At least three eligible traits are needed to play. Hardcore selects every available theme (themes below three characters stay disabled), not a different guessing rule. The setup screen shows the actual per-theme character counts computed from the dataset.

Privacy is casual shared-phone privacy, not protection against someone inspecting browser storage or JavaScript. Private assignment nodes are removed at handoff. Reload restores a gate before revealing the current player's information. Lifecycle tests use dispatched browser events and do not establish that every physical mobile operating-system preview behaves identically. Final reveal is public after a winner.

Fixture tests are explicitly synthetic and do not validate character facts. Production-data validation and public browser verification are separate release gates. No fixture is to be published as the curated dataset.

The existing eight online games are preserved. La Guilde does not impersonate another game's online identity. Latest authorization supersedes the earlier online stop. First publish, publicly verify and report the broad curated local game. Only after that, prepare one independently reviewed SQL migration, verify immutable raw-link bytes and provide it for the user to paste and Run later. Never apply it ourselves. Wait for the user to confirm application, then perform full real tests using only the four existing sessions. Publish online through non-force REST only after those tests, then publicly verify and report. Do not expose available online UI beforehand. No October 30 wait or renewed authorization is required. Preserve the local game and the other eight online games. The local game does not need any migration. No production SQL action or account creation is part of this release.

Technical evidence outside the release tree
/tmp/guilde-engine-fixture-proof.cjs exercises deterministic two-, three- and four-player turn, query, wrong-guess, win and history behavior against fictional data.
/tmp/guilde-static-integration-proof.json verifies catalog preservation and static cache entries.
/tmp/guilde-public-qa.cjs is the independent browser harness. Fixture evidence and real-data evidence must remain separated.

Release scope
The user accepted the small launch: 38 characters (Anime 8, LoL 7, Disney Pixar 11, Films Séries Star Wars 12) with three traits (human, male, created/made originally). Jeux vidéo is not yet available. This is not a rich database or full coverage. Fixture results alone do not satisfy the release gate; production-data privacy tests must pass on the final candidate.
