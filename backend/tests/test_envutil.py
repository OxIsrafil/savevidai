from app.envutil import env_truthy


def test_env_truthy_accepts_the_truthy_set(monkeypatch):
    for v in ("1", "true", "YES", " on "):
        monkeypatch.setenv("X_FLAG", v)
        assert env_truthy("X_FLAG") is True
    for v in ("", "0", "false", "off", "nope"):
        monkeypatch.setenv("X_FLAG", v)
        assert env_truthy("X_FLAG") is False
    monkeypatch.delenv("X_FLAG")
    assert env_truthy("X_FLAG") is False


def test_is_truthy_parses_values_directly():
    from app.envutil import is_truthy
    assert all(is_truthy(v) for v in ("1", "true", "YES", " on "))
    assert not any(is_truthy(v) for v in ("", "0", "false", "off", "nope", None))
