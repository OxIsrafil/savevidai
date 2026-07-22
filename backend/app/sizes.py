import httpx

from .schemas import ResolveResponse


def fill_sizes(resp: ResolveResponse, timeout: float = 3.0) -> None:
    """Best-effort Content-Length for each variant. Failures leave size_bytes as None."""
    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        for item in resp.items:
            for variant in item.variants:
                if variant.size_bytes is not None:
                    continue  # already known (e.g. TikTok API prefills it); skip the HEAD
                try:
                    r = client.head(variant.url)
                    length = r.headers.get("content-length")
                    variant.size_bytes = int(length) if length else None
                except (httpx.HTTPError, httpx.InvalidURL, ValueError):
                    variant.size_bytes = None
