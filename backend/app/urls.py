import re
from urllib.parse import urlparse


class InvalidTweetURL(ValueError):
    pass


_HOSTS = {
    "twitter.com", "www.twitter.com", "mobile.twitter.com", "m.twitter.com",
    "x.com", "www.x.com", "mobile.x.com",
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


def canonical_url(tweet_id: str) -> str:
    return f"https://twitter.com/i/web/status/{tweet_id}"
