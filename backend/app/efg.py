"""Shared parse for the `efg` query param Meta's CDNs hang off media URLs.

Both Instagram and Facebook serve progressive media from the same CDN family
(cdninstagram.com / fbcdn.net), and those URLs carry an `efg` param holding
base64-encoded JSON with a `duration_s` field. It is metadata of convenience,
not a contract: it is absent, truncated, or shaped differently often enough
that every caller must treat it as best-effort. This helper never raises and
returns None whenever the duration cannot be read.
"""
import base64
import json
from urllib.parse import parse_qs, urlparse


def duration_from_efg(url: str) -> float | None:
    """Best-effort: the CDN URL's efg param is base64 JSON with duration_s."""
    try:
        efg = parse_qs(urlparse(url).query).get("efg", [""])[0]
        val = json.loads(base64.b64decode(efg + "=" * (-len(efg) % 4))).get("duration_s")
        return float(val) if isinstance(val, (int, float)) else None
    except Exception:
        return None
