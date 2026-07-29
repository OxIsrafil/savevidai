import re
from urllib.parse import parse_qs, urlparse


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

_REDDIT_ID = re.compile(r"[a-z0-9]{1,13}")
_REDDIT_SUB = re.compile(r"[A-Za-z0-9_]{1,21}")
_REDDIT_SHARE_TOKEN = re.compile(r"[A-Za-z0-9]{1,24}")


def parse_reddit_url(raw: str) -> tuple[str, str, str]:
    """Return ("post", id, path) or ("share", url, path) for an allowed reddit link.

    The path is what the resolver appends to vxreddit.com, and is built ONLY from
    validated pieces. For known posts it is /r/<sub>/comments/<id>/ when the sub
    passes the subreddit charset, else /comments/<id>. The slug is never included
    (it is pure attack surface and vxreddit serves the slugless form). Share links
    (/r/<sub>/s/<token>) carry no post id; the resolver follows them, so we return
    the normalized https url plus a share path built from the validated sub and
    token. We host-allowlist first so an arbitrary user URL is never forwarded.
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
    if host == "redd.it":
        post_id = parts[0].lower() if parts else None
    elif len(parts) >= 4 and parts[0] == "r" and parts[2] == "comments":
        sub = parts[1]
        post_id = parts[3].lower()
    elif len(parts) >= 2 and parts[0] == "comments":
        post_id = parts[1].lower()
    elif len(parts) >= 3 and parts[0] == "r" and parts[2] == "s":
        if raw.startswith("http://"):
            raw = raw.replace("http://", "https://", 1)
        share_sub = parts[1]
        token = parts[3] if len(parts) >= 4 else ""
        if not _REDDIT_SUB.fullmatch(share_sub) or not _REDDIT_SHARE_TOKEN.fullmatch(token):
            raise InvalidTweetURL(raw)
        return ("share", raw, f"/r/{share_sub}/s/{token}")
    if not post_id or not _REDDIT_ID.fullmatch(post_id):
        raise InvalidTweetURL(raw)
    if sub and _REDDIT_SUB.fullmatch(sub):
        path = f"/r/{sub}/comments/{post_id}/"
    else:
        path = f"/comments/{post_id}"
    return ("post", post_id, path)


INSTAGRAM_HOSTS = {
    "instagram.com", "www.instagram.com", "m.instagram.com",
    "instagr.am", "www.instagr.am",
}

_IG_CODE = re.compile(r"[A-Za-z0-9_-]{5,20}")
_IG_USER = re.compile(r"[A-Za-z0-9._]{1,30}")
_IG_KINDS = ("p", "reel", "reels", "tv")


def parse_instagram_url(raw: str) -> str:
    """Return the shortcode for /p|reel|reels|tv/<code>, optionally username-prefixed.

    The shortcode is the only thing ever forwarded to the third-party resolver,
    and it is charset-validated here, so an arbitrary user URL (or path) can
    never reach it. We host-allowlist first, same rule as tiktok/reddit.
    """
    raw = (raw or "").strip()
    if not raw:
        raise InvalidTweetURL("empty input")
    if "://" not in raw:
        raw = "https://" + raw
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise InvalidTweetURL(raw)
    if parsed.hostname.lower() not in INSTAGRAM_HOSTS:
        raise InvalidTweetURL(raw)
    parts = [p for p in parsed.path.split("/") if p]
    if len(parts) >= 2 and parts[0] in _IG_KINDS:
        code = parts[1]
    elif len(parts) >= 3 and parts[1] in _IG_KINDS and _IG_USER.fullmatch(parts[0]):
        code = parts[2]
    else:
        raise InvalidTweetURL(raw)
    if not _IG_CODE.fullmatch(code):
        raise InvalidTweetURL(raw)
    return code


FACEBOOK_HOSTS = {
    "facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com",
    "fb.com", "www.fb.com", "fb.watch",
}

_FB_ID = re.compile(r"[0-9]{5,20}")
_FB_TOKEN = re.compile(r"[A-Za-z0-9]{1,32}")
# Vanity page slugs carry hyphens and underscores ("Sky-News-1234567"). The
# segment is validated then DISCARDED - the path we build is /watch/?v=<id> -
# so this is a shape check, never a forwarded value.
_FB_PAGE = re.compile(r"[A-Za-z0-9._-]{1,60}")


def parse_facebook_url(raw: str) -> tuple[str, str]:
    """Return (id, path) for a supported Facebook video URL, else raise.

    The path is what the resolver appends to facebed.com and is built ONLY from
    validated pieces (mirrors parse_reddit_url). Page/videos and the legacy
    video.php/story.php shapes normalize to /watch/?v=<id>. fb.watch hosts are
    detected (so analytics attribute them to facebook) but rejected here: v1
    does not follow the facebook.com redirect they require. We host-allowlist
    first, same rule as every platform.
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
    if host not in FACEBOOK_HOSTS:
        raise InvalidTweetURL(raw)
    if host == "fb.watch":
        raise InvalidTweetURL(raw)
    parts = [p for p in parsed.path.split("/") if p]
    query = parse_qs(parsed.query)

    def _qs_id(key: str) -> str | None:
        vals = query.get(key)
        vid = vals[0] if vals else ""
        return vid if _FB_ID.fullmatch(vid) else None

    if parts and parts[0] in ("watch", "video.php"):
        vid = _qs_id("v")
        if vid:
            return (vid, f"/watch/?v={vid}")
    elif parts and parts[0] == "story.php":
        vid = _qs_id("story_fbid")
        if vid:
            return (vid, f"/watch/?v={vid}")
    elif len(parts) == 2 and parts[0] == "reel" and _FB_ID.fullmatch(parts[1]):
        return (parts[1], f"/reel/{parts[1]}")
    elif len(parts) == 3 and parts[0] == "share" and parts[1] in ("r", "v", "p") \
            and _FB_TOKEN.fullmatch(parts[2]):
        return (parts[2], f"/share/{parts[1]}/{parts[2]}")
    elif len(parts) >= 3 and parts[1] == "videos" and _FB_PAGE.fullmatch(parts[0]):
        # id = last all-digit segment AFTER "videos", so a numeric page id in
        # position 0 can never be picked.
        for seg in reversed(parts[2:]):
            if _FB_ID.fullmatch(seg):
                return (seg, f"/watch/?v={seg}")
    raise InvalidTweetURL(raw)
