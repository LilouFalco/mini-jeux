# Seven-game SQL draft ready for independent review, NOT application

Artifact: sql/002-online-puissance4.sql (historical filename intentionally retained).
Install order later: existing 001, then ONLY this complete 002 file. Do not run source fragments.
No function/service installation is needed. No remote deployment was performed.
The independent reviewer must approve before it is given to the user to execute.
This document supersedes the earlier partial-scope statements in online-bundle-increment.md.

Build: node tools/build-online-sql.cjs. Inputs under sql/sources/; one BEGIN/COMMIT.
001 stays byte-identical. Repeating the resulting migration passes local PGlite compilation.
Existing 001 Morpion rounds survive the migration in the regression test.

Implemented SQL protocols

P4: existing gravity, four-axis victory, draw, membership/turn and receipt checks retained.
Petit Bac: 10-player lobby, ready/start, server letter, fixed six categories, private bounded
submissions, server deadline of 120 seconds, member STOP or timeout, host human judging
(0/5/10), mark completeness before finish, next round with readiness reset and new instance.
No automatic dictionary validity. Per-round marks are returned; cumulative session scores are
not yet stored. Browser clients must treat human judging as explicit, not automatic truth.
Naval: validates fleet [5,4,3,3,2], straight contiguous in-bounds ships without overlap,
private per-seat fleet, alternating server-scored shots, duplicate-shot rejection, win at17hits.
Qui est-ce: private per-seat choice among 24 server slots, turn-checked guesses, server match
against opponent's choice and winner. Spoken yes/no questions and board eliminations remain
client/social UI behavior. Stable champion-to-slot mapping must be supplied by the online UI.
Undercover: server-random pair and hidden per-seat roles/words, 1 undercover (2 for9+), private
votes, alive-only one vote per round, non-self valid target, majority elimination, ties restart
voting, civil/impostor win detection. No Mr White variant yet. Pair pool is now all 72 pairs of undercover-engine.js (6 themes mixed),
not the full existing mixed-theme catalog. Snapshot never includes other players' role/word.
Time's Up: fixed16-card server-shuffled deck, EVEN 4–12 players only, alternating seats and parity teams,
current card only to active describer, server60second turn deadline, pass/found, scores,
three rounds reusing reshuffled deck. No selectable theme/count/duration configuration yet.
A describer can claim a word was guessed, as in the social game; outsiders cannot write it.

Casual chess accepted architecture

Server stores only append-only bounded UCI moves, checks membership, host start, ready,
turn, version/instance, request idempotency and shape. Legal move validation is deliberately
CLIENT SIDE. Two matching per-seat result reports end a game; one player cannot end it alone.
A cheating member CAN submit a well-shaped illegal move. This is tested explicitly, not hidden.
chess-online-history.mjs reconstructs with the existing vendored chess.js and throws on an
illegal received move. It is NOT YET WIRED TO THE ONLINE UI. Both clients must use it and show
a visible invalid-game/error state without applying partial replay before chess is published.
Earlier server/chess-validator.mjs is an unused experiment, not the deployment path.

Shared security and lifecycle

All new private tables have RLS enabled and browser grants revoked. app_private helpers are
not executable by public/anon/authenticated. Only dedicated public RPCs are granted to auth.
Each mutation locks the room first, derives actor from auth.uid(), checks membership/game,
version/instance, expiry, bounded input, and deduplicates request/action id. Broadcast remains
version/instance only; snapshots filter secrets per actor. No generic client state replacement.
online_game_leave resets new-game private state, rotates topic+instance, transfers host and
resets readiness. Exact leave retry is acknowledged, departed player cannot read new state.
Board games retain their existing leave RPC. New-game rematches other than Petit Bac are not
implemented; leave/recreate is the current supported lifecycle.

Guarded local checks passed

node -r ./test-guard.cjs online-sql-test.cjs
node -r ./test-guard.cjs online-petitbac-sql-test.cjs
node -r ./test-guard.cjs online-chess-sql-test.cjs
node -r ./test-guard.cjs online-hidden-sql-test.cjs
node -r ./test-guard.cjs chess-online-history-test.mjs

These use ephemeral local PostgreSQL WASM with mocked auth.uid and realtime.send, NOT real
Supabase or real concurrent connections. Covers compile/repeat, board regressions, private
answers/fleets/choices/roles/cards, denied direct table access, minimal broadcasts, game
transitions, and departure cleanup. Chess/Petit Bac receipt/stale assertions are explicit.
Hidden-game common receipt/version code still needs additional adversarial/replay/concurrent
independent review and tests. Tests are NOT a blanket security PASS or production validation.

Release gates

Independent security/SQL review, resolve findings, user applies the reviewed single file,
wire each online client (including chess validation on both peers), then actual two-client
Supabase/Auth/private Realtime validation. No game beyond tested real deployment is 'live'.
No Auth, external network, remote SQL application or git push was used for this draft.

Targeted independent-audit corrections, pending independent re-review

Undercover now shuffles rows from FROM unnest(seats), not a ProjectSet target-list
expression. Native PostgreSQL16 regression covers 24 games each with 3 and 9 players,
multiple impostor seat positions, and exact role counts.
Petit Bac mark payload is now {seat, category, points}, NOT player UUID. The server
resolves seat membership; snapshots need not reveal another member UUID. Native test
stops with zero submissions, scores both members across every category from public
snapshots only, finishes and advances to the next round.
Time's Up advances describer/opposing parity team when a deck ends, as on turn end.
Odd lobbies of 5 or 7 cannot start (EVEN_PLAYERS_REQUIRED); supported counts are
4, 6, 8, 10, 12. A future online client must display this even-player restriction.
No online Time's Up client is currently wired, so no client parity claim is made.
Native regressions verify odd rejection without mutation, even 4/6/12 wraparound,
and all three complete decks (48 scored cards). No true concurrent-RPC claim.
Command: node -r ./test-guard.cjs online-audit-regression-test.cjs
Uses native PostgreSQL16 with listen_addresses='' and a temporary Unix socket only.
Auth/Realtime are local stubs; this is NOT a real Supabase validation.
All five existing SQL suites were rerun under the same strict network guard and passed.
SQL001 remains unchanged. No push, live Auth, remote SQL, or delivery authorization.
