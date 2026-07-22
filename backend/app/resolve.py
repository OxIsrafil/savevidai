from fastapi import APIRouter, Request

from .analytics.service import service as analytics
from .cache import TTLCache
from .errors import INVALID_URL, AppError, app_error
from .extractor import extract
from .limits import limiter
from .platforms import detect_platform
from .schemas import ResolveRequest, ResolveResponse
from .sizes import fill_sizes
from .tiktok import extract_tiktok
from .urls import InvalidTweetURL, parse_tiktok_url, parse_tweet_url

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
        else:
            tiktok_url = parse_tiktok_url(payload.url)
            key = f"tiktok:{tiktok_url}"

            def resolver() -> ResolveResponse:
                return extract_tiktok(tiktok_url)
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
        cache.set(key, result)
    except AppError as exc:
        analytics.record_from_request(request, "fetch", exc.code, platform=platform)
        raise
    analytics.record_from_request(request, "fetch", "ok", platform=platform)
    return result
