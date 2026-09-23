import os

_TRUTHY = ("1", "true", "yes", "on")


def is_truthy(value: str | None) -> bool:
    """Truthy parsing shared by every feature flag: 1/true/yes/on in any case,
    surrounding whitespace ignored. None and everything else are False."""
    return (value or "").strip().lower() in _TRUTHY


def env_truthy(name: str) -> bool:
    """Shared truthy parsing for feature-flag env vars (MAINTENANCE_MODE,
    GEOIP_UPDATE). One definition so the flags cannot drift apart."""
    return is_truthy(os.environ.get(name))
