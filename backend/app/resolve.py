from fastapi import APIRouter, Request

from .analytics.service import service as analytics
from .cache import TTLCache
from .errors import INVALID_URL, AppError, app_error
from .extractor import extract
from .limits import limiter
from .schemas import ResolveRequest, ResolveResponse
from .sizes import fill_sizes
from .urls import InvalidTweetURL, parse_tweet_url

router = APIRouter()
cache = TTLCache(maxsize=512, ttl=3600.0)


@router.post("/api/resolve", response_model=ResolveResponse)
@limiter.limit("10/minute")
def resolve(request: Request, payload: ResolveRequest) -> ResolveResponse:
    try:
        tweet_id = parse_tweet_url(payload.url)
    except InvalidTweetURL as exc:
        analytics.record_from_request(request, "fetch", "invalid_url")
        raise app_error(INVALID_URL) from exc
    try:
        cached = cache.get(tweet_id)
        if cached is not None:
            analytics.record_from_request(request, "fetch", "ok")
            return cached
        result = extract(tweet_id)
        fill_sizes(result)
        cache.set(tweet_id, result)
    except AppError as exc:
        analytics.record_from_request(request, "fetch", exc.code)
        raise
    analytics.record_from_request(request, "fetch", "ok")
    return result
