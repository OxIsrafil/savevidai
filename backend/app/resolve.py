from fastapi import APIRouter, Request

from .analytics.service import service as analytics
from .cache import TTLCache
from .errors import INVALID_URL, AppError, app_error
from .extractor import extract
from .instagram import extract_instagram
from .limits import limiter
from .platforms import detect_platform
from .reddit import extract_reddit
from .schemas import ResolveRequest, ResolveResponse
from .sizes import fill_sizes
from .tiktok import extract_tiktok
from .urls import (
    InvalidTweetURL,
    parse_instagram_url,
    parse_reddit_url,
    parse_tiktok_url,
    parse_tweet_url,
)

router = APIRouter()
cache = TTLCache(maxsize=512, ttl=3600.0)


@router.post("/api/resolve", response_model=ResolveResponse)
@limiter.limit("10/minute")
def resolve(request: Request, payload: ResolveRequest) -> ResolveResponse:
    platform = detect_platform(payload.url)
    if platform is None:
        analytics.record_from_request(request, "fetch", "invalid_url")
        raise app_error(INVALID_URL)
    try:
        if platform == "twitter":
            tweet_id = parse_tweet_url(payload.url)
            key = f"twitter:{tweet_id}"

            def resolver() -> ResolveResponse:
                return extract(tweet_id)
        elif platform == "tiktok":
            tiktok_url = parse_tiktok_url(payload.url)
            key = f"tiktok:{tiktok_url}"

            def resolver() -> ResolveResponse:
                return extract_tiktok(tiktok_url)
        elif platform == "instagram":
            shortcode = parse_instagram_url(payload.url)
            key = f"instagram:{shortcode}"

            def resolver() -> ResolveResponse:
                return extract_instagram(shortcode)
        else:
            parsed = parse_reddit_url(payload.url)
            # ("post", id, path) keys on the post id; ("share", url, path) keys on
            # the share url. Reddit DASH urls are not time-signed, so the default
            # cache TTL applies (no override below, unlike tiktok's 900s).
            key = f"reddit:{parsed[1]}"

            def resolver() -> ResolveResponse:
                return extract_reddit(parsed)
    except InvalidTweetURL as exc:
        analytics.record_from_request(request, "fetch", "invalid_url", platform=platform)
        raise app_error(INVALID_URL) from exc
    try:
        cached = cache.get(key)
        if cached is not None:
            analytics.record_from_request(request, "fetch", "ok", platform=platform)
            return cached
        result = resolver()
        fill_sizes(result)
        # Signed CDN urls expire: tiktok's last a few hours (900s), instagram's
        # oe= expiry is shorter, so 600s keeps a safety margin. Twitter/reddit
        # urls are not time-signed, so they keep the default cache TTL.
        ttl = 900.0 if platform == "tiktok" else 600.0 if platform == "instagram" else None
        cache.set(key, result, ttl=ttl)
    except AppError as exc:
        analytics.record_from_request(request, "fetch", exc.code, platform=platform)
        raise
    analytics.record_from_request(request, "fetch", "ok", platform=platform)
    return result
