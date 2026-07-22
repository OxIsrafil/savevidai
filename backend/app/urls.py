import re
from urllib.parse import urlparse


class InvalidTweetURL(ValueError):
    pass


_HOSTS = {
    "twitter.com", "www.twitter.com", "mobile.twitter.com", "m.twitter.com",
    "x.com", "www.x.com", "mobile.x.com", "m.x.com",
    "fxtwitter.com", "www.fxtwitter.com",
    "vxtwitter.com", "www.vxtwitter.com",
    "fixupx.com", "www.fixupx.com",
    "twittpr.com", "www.twittpr.com",
}

# /<handle>/status/<id> or /i/web/status/<id>, tolerating trailing segments like /video/1
_PATH = re.compile(r"^/(?:[A-Za-z0-9_]{1,15}|i/web)/status(?:es)?/(\d{1,25})(?:/|$)")


def parse_tweet_url(raw: str) -> str:
    """Return the tweet ID for any supported tweet URL shape, else raise InvalidTweetURL."""
    raw = raw.strip()
    if not raw:
        raise InvalidTweetURL("empty input")
    if "://" not in raw:
        raw = "https://" + raw
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise InvalidTweetURL(raw)
    if parsed.hostname.lower() not in _HOSTS:
        raise InvalidTweetURL(raw)
    match = _PATH.match(parsed.path)
    if not match:
        raise InvalidTweetURL(raw)
    return match.group(1)


TIKTOK_HOSTS = {
    "tiktok.com", "www.tiktok.com", "m.tiktok.com",
    "vm.tiktok.com", "vt.tiktok.com",
}


def parse_tiktok_url(raw: str) -> str:
    """Validate the host is TikTok and return a normalized https URL.

    Unlike Twitter (which extracts a numeric ID), TikTok's resolver takes the
    URL directly and follows short links (vm./vt.). We host-allowlist first so
    an arbitrary user URL is never forwarded to the third-party resolver.
    """
    raw = raw.strip()
    if not raw:
        raise InvalidTweetURL("empty input")
    if "://" not in raw:
        raw = "https://" + raw
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise InvalidTweetURL(raw)
    if parsed.hostname.lower() not in TIKTOK_HOSTS:
        raise InvalidTweetURL(raw)
    return raw if raw.startswith("https://") else raw.replace("http://", "https://", 1)


REDDIT_HOSTS = {
    "reddit.com", "www.reddit.com", "old.reddit.com", "np.reddit.com", "redd.it",
}

_REDDIT_ID = re.compile(r"^[a-z0-9]{1,13}$")


def parse_reddit_url(raw: str) -> tuple[str, str, str]:
    """Return ("post", id, path) or ("share", url, path) for an allowed reddit link.

    The path is what the resolver appends to vxreddit.com. For known posts it is
    /r/<sub>/comments/<id>/<slug>/ when the sub (and slug, if present) are known,
    else /comments/<id>. Share links (/r/<sub>/s/<token>) carry no post id; the
    resolver follows them, so we return the normalized https url plus the share
    path. We host-allowlist first so an arbitrary user URL is never forwarded.
    """
    raw = (raw or "").strip()
    if not raw:
        raise InvalidTweetURL("empty input")
    if "://" not in raw:
        raw = "https://" + raw
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise InvalidTweetURL(raw)
    host = parsed.hostname.lower()
    if host not in REDDIT_HOSTS:
        raise InvalidTweetURL(raw)
    parts = [p for p in parsed.path.split("/") if p]
    post_id = None
    sub = None
    slug = None
    if host == "redd.it":
        post_id = parts[0].lower() if parts else None
    elif len(parts) >= 4 and parts[0] == "r" and parts[2] == "comments":
        sub = parts[1]
        post_id = parts[3].lower()
        slug = parts[4] if len(parts) >= 5 else None
    elif len(parts) >= 2 and parts[0] == "comments":
        post_id = parts[1].lower()
    elif len(parts) >= 3 and parts[0] == "r" and parts[2] == "s":
        if raw.startswith("http://"):
            raw = raw.replace("http://", "https://", 1)
        share_path = f"/r/{parts[1]}/s/{parts[3]}" if len(parts) >= 4 else f"/r/{parts[1]}/s/"
        return ("share", raw, share_path)
    if not post_id or not _REDDIT_ID.match(post_id):
        raise InvalidTweetURL(raw)
    if sub:
        path = f"/r/{sub}/comments/{post_id}/{slug}/" if slug else f"/r/{sub}/comments/{post_id}/"
    else:
        path = f"/comments/{post_id}"
    return ("post", post_id, path)
