Undercover online handoff (local only)

Client works with installed 001 + 002 + 003. No Auth, real network, service sessions, production SQL or publication performed. Local PGlite runs real migrations, stubbing Auth/realtime/cron infrastructure only. Extension availability preflight is removed in the test as PGlite has no pg_cron.

Terminal-team limitation
002 hidden_view returns own/alive/phase/votesCast only. online_hidden_action stores winner exclusively inside hidden_games.state.winner, and rooms.winner stays 0. Exact team cannot generally be inferred from alive seats and one's own role. Never derive victory from rooms.winner or guess. Client explicitly says the installed server does not transmit the winner. Full result display REQUIRES canonical sql/005-remaining-online.sql from the parent. The harness defaults to /tmp/remaining-sql/sql/005-remaining-online.sql. Undercover winner is present only when finished and OMITTED during active play. No standalone migration is delivered.

Rules
3–12 players, one undercover or two at 9+, all themes mixed, no Mister White, no scores. Oral discussion or voice call. Server keeps vote targets private; participation count is public. No self-votes, no duplicate votes, eliminated users cannot vote. Ties reset votes with no elimination. Each device shows only its own role/word, hidden by default and again on document hiding. No other role reveals even after finish. Existing lifecycle departure terminates the match. Replay uses a new room.

Tests
node undercover-online-ui-test.cjs
ENGINE=webkit node undercover-online-ui-test.cjs
Both passed with three local identities and real SQL001002003. Start/readiness, own-secret reveal/hide, no other player roles or vote targets in snapshots, cyclic tie reset, UI private-vote lock, civil terminal fallback, canonical terminal-team migration for all seats, winner omitted during active match, impostor terminal result, duplicate/self-vote rejection, direct private-table denial, no page exceptions, mobile horizontal fit. All HTTP requests fail closed except random-port local server. No Supabase SDK/Auth calls are made by the harness. Requires /tmp/onlineqa/node_modules/@electric-sql/pglite and /tmp/qa/node_modules/playwright, overridable via PGLITE_MODULE and PLAYWRIGHT_MODULE.

Also PASS node undercover-test.cjs and node undercover-secret-test.cjs (Chromium and WebKit offline secret regression).
Actual Supabase three-identity session verification remains parent-owned and unperformed.

Selectors
undercover.html?mode=online
#online-pseudo, #online-room-name, buttons Créer/Rejoindre
#uc-ready, #uc-start (host)
#uc-secret, #uc-reveal, #uc-votes button[data-seat]
#uc-result, #online-status

SW
Only added two required assets to FILES. Cache version left unchanged deliberately. Parent coordinates next public v46 and merge conflicts. Do not publish without bump and parent decision about winner SQL.

Canonical 005 validation
Passed Chromium and WebKit with UNDERCOVER_MIGRATION=/tmp/remaining-sql/sql/005-remaining-online.sql (SHA256 176b6a0be72f9c653144cc792604fb91a6909b5c365b89cafb10e3664e88b763). Harness first verifies unpatched fallback, then applies canonical remaining-only migration locally and verifies civil and impostor terminal results. Canonical contract omits winner during active play; harness explicitly asserts absence of the key. No canonical SQL edits or copies committed. Offline engine and secret regressions rerun PASS in both engines.

Current migration sequence is SQL001,002,003, then auditor-owned /tmp/remaining-sql/sql/test-fixtures/004-applied-rules.sql, then remaining-only 005. Fixture is referenced in place, never copied or delivered. 005 contains no 004. UNDERCOVER_004_FIXTURE overrides the local fixture path.
