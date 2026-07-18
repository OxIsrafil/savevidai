import hashlib
import hmac

# Fixed application pepper (not a secret; raises the bar with the user password).
_PEPPER = b"savevidai::admin::v1"


def _key(password: str) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), _PEPPER, 100_000)


def check_password(supplied: str, expected: str) -> bool:
    return hmac.compare_digest(supplied.encode(), expected.encode())


def make_cookie(password: str, now: float, ttl_seconds: int = 2_592_000) -> str:
    """Cookie value = "<expiry>.<hex sig>" where sig signs the expiry with a key
    derived from the admin password. Changing the password invalidates all cookies.
    """
    expiry = str(int(now) + ttl_seconds)
    sig = hmac.new(_key(password), expiry.encode(), hashlib.sha256).hexdigest()
    return f"{expiry}.{sig}"


def verify_cookie(cookie: str, password: str, now: float) -> bool:
    if not cookie or "." not in cookie:
        return False
    expiry, _, sig = cookie.partition(".")
    expected = hmac.new(_key(password), expiry.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return False
    try:
        return int(expiry) > int(now)
    except ValueError:
        return False
