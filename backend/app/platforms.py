from urllib.parse import urlparse

from .urls import TIKTOK_HOSTS, _HOSTS


def detect_platform(url: str) -> str | None:
    """Return 'twitter' | 'tiktok' | None based purely on the URL host."""
    raw = (url or "").strip()
    if not raw:
        return None
    if "://" not in raw:
        raw = "https://" + raw
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return None
    host = parsed.hostname.lower()
    if host in _HOSTS:
        return "twitter"
    if host in TIKTOK_HOSTS:
        return "tiktok"
    return None
