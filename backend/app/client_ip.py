from fastapi import Request


def client_ip(request: Request) -> str:
    """Real client IP behind the platform load balancer / Cloudflare.

    Precedence: CF-Connecting-IP, then the first hop of X-Forwarded-For, then
    the direct peer. Returns "unknown" if none are available.
    """
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
