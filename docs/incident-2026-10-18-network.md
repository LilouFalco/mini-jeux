# Local network incident, 18 Oct 2026 (P4 investigation)

Status: facts below come only from local files and this worker's own recorded command outputs. No timestamps were saved; exact times are UNKNOWN.

## What happened
Investigating online-failure-test.cjs 'auth-disabled' (stale assertion text.includes('activation')), the worker ran browser probes against the product page. The test's mock route ('https://**') did not intercept the Supabase calls, so the page's configured public project URL (online-config.js) was contacted for real. Confirmed by direct observation in probe output:
- One probe logged a browser request event to <project>/auth/v1/signup and received HTTP 429 (a real response; the mock returns 422). That is 1 confirmed external request with status 429.
- Two runs of an edited test (clicking Créer on a room named "Salon test", port 28461 then 28462) timed out waiting for the 'activation' message, meaning sign-in did not return the mocked 'disabled' error. A later probe then showed the app message for NAME_TAKEN ("Ce nom de salon existe déjà"), which suggests a real anonymous signup AND a real create-room RPC succeeded earlier in that sequence. This is INFERENCE from UI text, not a saved response. Whether a user or room exists is UNCONFIRMED.
- The lobby calls anonymous sign-in when it opens (confirmed locally now: one signup attempt per lobby open), so each earlier original online-failure-test run (auth-disabled scenario, 3 invocations seen in this session: the failing runs reported before the probes) may also have attempted one real signup. Count: lower bound 1 confirmed (the 429), plausible 2 to 6 attempts; exact count NOT RECOVERABLE (no request logs were saved).
- Requests count/status/timestamps are therefore: confirmed 1 (HTTP 429, time unknown); attempted-but-unrecorded unknown.
- The parent's own live harness runs earlier the same day (see docs/online-live-blocker.md) had already hit "Request rate limit reached"; the 429 above is consistent with that existing limit, not proof this worker caused it.
- No sessions, tokens, keys were saved to files by this worker. Nothing was deleted, no SQL applied, nothing pushed.

## Possible remote artifacts (unconfirmed)
- Anonymous Auth user(s): possible, no id known.
- Room "Salon test" (game morpion): possible, expires logically 30 minutes after creation; not physically deleted.

## Hardening (local only)
test-guard.cjs: fail-closed guard (Node patches for fetch, http(s), net, tls, dns, WebSocket; browser dead proxy, resolver NOTFOUND except localhost, context route and WebSocket route denying all non-local, service workers blocked, online-config.js replaced with https://project.invalid). test-guard-selftest.cjs proves it with 16 checks using only localhost and .invalid names. online-failure-test.cjs, online-ui-test.cjs, online-p4-ui-test.cjs now use it and assert zero violations.
Not guarded: online-live-test.cjs and online-live-bootstrap.cjs (deliberately real, gated by ONLINE_LIVE=1); no auth should be rescheduled until the parent decides. Retry-after for the 429 was never captured, so no safe retry time is known.
