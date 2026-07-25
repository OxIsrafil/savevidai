from app.analytics.config import load_config

FULL = {
    "TURSO_DATABASE_URL": "libsql://db.turso.io",
    "TURSO_AUTH_TOKEN": "tok",
    "ADMIN_PASSWORD": "s3cret-long",
    "ANALYTICS_SALT": "random-salt",
}


def test_loads_when_all_present():
    cfg = load_config(FULL)
    assert cfg is not None
    assert cfg.admin_password == "s3cret-long"
    assert cfg.salt == "random-salt"


def test_none_when_any_missing():
    for k in FULL:
        partial = {kk: vv for kk, vv in FULL.items() if kk != k}
        assert load_config(partial) is None


def test_none_when_any_empty():
    for k in FULL:
        blanked = {**FULL, k: ""}
        assert load_config(blanked) is None


LOCAL = {
    "ANALYTICS_DB_PATH": "/data/analytics.db",
    "ADMIN_PASSWORD": "s3cret-long",
    "ANALYTICS_SALT": "random-salt",
}


def test_turso_mode_carries_creds_and_no_db_path():
    cfg = load_config(FULL)
    assert cfg is not None
    assert cfg.turso_url == "libsql://db.turso.io"
    assert cfg.turso_token == "tok"
    assert cfg.db_path == ""


def test_local_mode_carries_db_path_and_no_turso():
    cfg = load_config(LOCAL)
    assert cfg is not None
    assert cfg.db_path == "/data/analytics.db"
    assert cfg.turso_url == ""
    assert cfg.turso_token == ""
    assert cfg.admin_password == "s3cret-long"
    assert cfg.salt == "random-salt"


def test_turso_wins_when_both_backends_set():
    cfg = load_config({**FULL, "ANALYTICS_DB_PATH": "/data/analytics.db"})
    assert cfg is not None
    assert cfg.turso_url == "libsql://db.turso.io"
    assert cfg.db_path == ""


def test_none_when_no_storage_backend():
    only_gate = {"ADMIN_PASSWORD": "s3cret-long", "ANALYTICS_SALT": "random-salt"}
    assert load_config(only_gate) is None


def test_local_mode_none_when_password_or_salt_missing():
    for k in ("ADMIN_PASSWORD", "ANALYTICS_SALT"):
        partial = {kk: vv for kk, vv in LOCAL.items() if kk != k}
        assert load_config(partial) is None


def test_local_mode_none_when_db_path_blank():
    assert load_config({**LOCAL, "ANALYTICS_DB_PATH": "   "}) is None
