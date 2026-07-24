import os

_TRUTHY = ("1", "true", "yes", "on")


def env_truthy(name: str) -> bool:
    """Shared truthy parsing for feature-flag env vars (MAINTENANCE_MODE,
    ADS_ENABLED). One definition so the flags cannot drift apart."""
    return os.environ.get(name, "").strip().lower() in _TRUTHY
