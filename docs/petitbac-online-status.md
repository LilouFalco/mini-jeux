# Petit Bac online local handoff

Based on public naval df76c5e; no remote calls, auth, saved-session access, new accounts, SQL application, or publication.

## Mandatory pending SQL

The existing 002 pb_view returns answers and marks keyed by auth UID, but room.members contains only seat/name/ready/host. After reveal the client cannot safely associate answers or score totals with people. This is not solvable by frontend guesses/order. Canonical /tmp/remaining-sql/sql/005-remaining-online.sql adds players [{seat,name}], answersBySeat / marksBySeat. Review rows consume players, per final 005 contract. Legacy UID-keyed answers / marks are preserved. Canonical SHA256 176b6a0be72f9c653144cc792604fb91a6909b5c365b89cafb10e3664e88b763. Canonical has no submitted seats; client does not reference or expect them. It preserves own-only answers before scoring, member authorization, no raw UIDs, private tables and minimal broadcasts. It must be bundled/reviewed by parent and manually applied through the user's approved process, not applied by this branch.

The old local 004-petitbac-view.sql proposal has been removed to avoid confusion. User already applied 004 normal Qui est-ce rules. Harness loads canonical test-fixtures/004-applied-rules.sql, then canonical005. Never apply either independently.

Without that migration, client deliberately shows a server-update message and does not let players ready/start. No fake fullflow claim on current public SQL.

No scoring-action SQL changes required. online_petitbac_action already authorizes readiness, host start, secret submit, stop/timeout, host 0/5/10 marks, finish requiring every mark, next; 003 wraps lifecycle. Server fixes 6 categories and 120 seconds. Server has no cumulative score history. UI explicitly says scores are per-round, next resets.

## Client

petitbac-online.js reuses the established naval lobby/session lifecycle, generation checks, resume, room lease, broadcast-as-hint, polling, unknown-outcome same-request retry. Only ready/unready are automatically rebased on STALE_VERSION. Answers are sent via explicit Save; Stop reveals submitted answers only, warns accordingly. In-memory draft survives heartbeat/refresh without replacing it with someone else's server data. No other-game edits except registration of Petit Bac in games-data and its two new service-worker assets.

Cache version intentionally unchanged at v41. Parent owns cache bump (tentative v48 must be coordinated).

Selectors are #online-toggle, #online-pseudo, #online-room-name, #pb-ready, #pb-start, #pb-answer-{category}, #pb-submit, #pb-clock, #pb-stop, .pb-review[data-seat], [data-category][data-points], #pb-finish, #pb-next.

## Evidence

Run node petitbac-online-ui-test.cjs. Fail-closed test-guard blocks all external networking and replaces config. PGlite executes real SQL001/002/003 plus applied004 fixture and canonical005 with explicit auth/realtime/cron stubs. Four independent browser identities in each Chromium/WebKit. Covers room creation/join, ready/start, secret submit,  reveal, nonhost no judging controls, 24 authorized host marks, finish/totals, reload/resume, next, draft preservation, idempotent receipts, expiry/timeout, host-only mark rejection, minimal broadcasts, host leave/peer termination, offline local scoring/persistence. Realtime delivery and actual Supabase are NOT proven by local stubs.

Existing online-petitbac-sql-test.cjs passes for installed 001/002 baseline (private answers, adversarial actions, scoring).
Existing petitbac-test.cjs has obsolete Lilou/Lulu expectations despite neutral Joueur names in baseline; do not treat that assertion as a product regression. New harness tests actual neutral-name offline flow against this worktree.
