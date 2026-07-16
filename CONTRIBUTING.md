# Contributing

## The most common fix: extraction broke

`/api/resolve` returns `upstream_error` (or `no_video`) for everything.

SaveVid AI resolves through the FixTweet public API (`api.fxtwitter.com`) with an
`api.vxtwitter.com` fallback. yt-dlp is NOT used: Twitter closed anonymous/guest
video access, so yt-dlp needs logged-in cookies, which a public no-login site
can't rely on.

1. Check whether FixTweet is up: `curl -s https://api.fxtwitter.com/i/status/20`
   should return JSON with `"code": 200`. If both fxtwitter and vxtwitter are
   down, resolution fails until they recover (they are actively maintained
   because Discord link embeds depend on them).
2. If FixTweet is up but returns a new JSON shape, fix the mapping in
   `backend/app/extractor.py` (`map_fxtwitter` / `map_vxtwitter` are pure and
   tested with fixture dicts; add a fixture reproducing the new shape).
3. Run `scripts/smoke.py` against a public video tweet to confirm the fix.

## New error wording

`backend/app/extractor.py` (`map_fxtwitter` / `map_vxtwitter`) maps the
FixTweet/vxtwitter response `code` to the error specs defined in
`backend/app/errors.py`, which holds the error catalog and user-facing
copy only. Add a case + test in `backend/tests/test_extractor.py`
(and `backend/tests/test_errors.py` if the catalog itself changes).

## Dev setup and tests

See the Development section of the README. Both suites must pass in CI.
Frontend rule: no third-party requests at runtime; keep animations
transforms/opacity only and respect `prefers-reduced-motion`.

## Hard product rules

- Nothing may ever gate, delay, or interrupt a download (no countdown, no ad-unlock).
- No client-side tracking of any kind.
- Error messages stay specific and honest.
