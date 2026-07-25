from collections.abc import Mapping
from dataclasses import dataclass


@dataclass(frozen=True)
class AnalyticsConfig:
    # Field order is load-bearing: existing tests construct this positionally
    # as AnalyticsConfig(url, token, password, salt). All fields default to ""
    # because turso_url/turso_token gained defaults and dataclass rules forbid
    # non-default fields after defaulted ones. load_config is the gate that
    # guarantees password and salt are non-empty in every enabled config.
    turso_url: str = ""
    turso_token: str = ""
    admin_password: str = ""
    salt: str = ""
    db_path: str = ""


def load_config(env: Mapping[str, str]) -> AnalyticsConfig | None:
    """Return config when the admin gate and a storage backend are both set.

    ADMIN_PASSWORD and ANALYTICS_SALT are always required. The salt is part of
    the gate on purpose: an empty salt would make visitor hashes
    brute-forceable, silently breaking anonymity.

    Storage selection: both Turso vars set -> Turso mode (existing behavior,
    self-hosters unaffected). Else ANALYTICS_DB_PATH set -> local SQLite mode.
    Else None: password+salt alone is not enough, there must be somewhere to
    store data.
    """
    url = env.get("TURSO_DATABASE_URL", "").strip()
    token = env.get("TURSO_AUTH_TOKEN", "").strip()
    db_path = env.get("ANALYTICS_DB_PATH", "").strip()
    password = env.get("ADMIN_PASSWORD", "").strip()
    salt = env.get("ANALYTICS_SALT", "").strip()
    if not (password and salt):
        return None
    if url and token:
        return AnalyticsConfig(turso_url=url, turso_token=token,
                               admin_password=password, salt=salt)
    if db_path:
        return AnalyticsConfig(admin_password=password, salt=salt, db_path=db_path)
    return None
