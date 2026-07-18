import hashlib
import hmac
from datetime import datetime, timezone


def today_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def visitor_hash(salt: str, ip: str, day: str) -> str:
    """Daily-rotating anonymous visitor id. HMAC keyed by the secret salt so it
    is not brute-forceable; rotates at UTC midnight so it can't link across days.
    """
    mac = hmac.new(salt.encode(), f"{day}|{ip}".encode(), hashlib.sha256)
    return mac.hexdigest()[:16]
