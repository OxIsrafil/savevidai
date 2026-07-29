from urllib.parse import urlparse

from .urls import _HOSTS, FACEBOOK_HOSTS, INSTAGRAM_HOSTS, REDDIT_HOSTS, TIKTOK_HOSTS


def detect_platform(url: str) -> str | None:
    """Return 'twitter' | 'tiktok' | 'reddit' | 'instagram' | 'facebook' | None from the host."""
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
    if host in REDDIT_HOSTS:
        return "reddit"
    if host in INSTAGRAM_HOSTS:
        return "instagram"
    if host in FACEBOOK_HOSTS:
        return "facebook"
    return None
