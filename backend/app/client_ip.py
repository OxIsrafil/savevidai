import re

from fastapi import Request

from .envutil import env_truthy

# fullmatch against this is the ^[A-Z]{2}$ check without the trailing-newline
# hole ("$" also matches just before a final "\n").
_COUNTRY = re.compile(r"[A-Z]{2}")


def _cloudflare_trusted() -> bool:
    """CF-* headers are genuine only on requests Cloudflare proxied.

    The record is DNS-only (grey cloud), so Cloudflare never sets
    CF-Connecting-IP or CF-IPCountry and any such header was written by the
    client. Trust them only when the operator opts in with
    TRUST_CLOUDFLARE_HEADERS (see deploy/app.env.example).
    """
    return env_truthy("TRUST_CLOUDFLARE_HEADERS")


def client_ip(request: Request) -> str:
    """Real client IP behind the reverse proxy.

    Precedence: CF-Connecting-IP (only with TRUST_CLOUDFLARE_HEADERS on), then
    the first hop of X-Forwarded-For, then the direct peer. Returns "unknown"
    if none are available.

    The first XFF hop is trustworthy only because Caddy has no trusted_proxies
    configured: it discards any X-Forwarded-For the client sent and sets the
    real peer address instead.
    """
    if _cloudflare_trusted():
        cf = request.headers.get("cf-connecting-ip")
        if cf and cf.strip():
            return cf.strip()
    xff = request.headers.get("x-forwarded-for")
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def client_country(request: Request) -> str | None:
    """Two-letter country from CF-IPCountry, or None.

    None unless TRUST_CLOUDFLARE_HEADERS is on, and None for anything but
    exactly two uppercase letters. XX is Cloudflare's "no country data"; T1
    (Tor) already fails the pattern.
    """
    if not _cloudflare_trusted():
        return None
    country = request.headers.get("cf-ipcountry", "")
    if not _COUNTRY.fullmatch(country) or country == "XX":
        return None
    return country
