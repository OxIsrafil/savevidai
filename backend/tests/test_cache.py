import time

from app.cache import TTLCache


def test_get_set_roundtrip():
    cache = TTLCache(maxsize=4, ttl=60)
    cache.set("a", {"x": 1})
    assert cache.get("a") == {"x": 1}
    assert cache.get("missing") is None


def test_expiry():
    cache = TTLCache(maxsize=4, ttl=0.05)
    cache.set("a", 1)
    assert cache.get("a") == 1
    time.sleep(0.06)
    assert cache.get("a") is None


def test_lru_eviction():
    cache = TTLCache(maxsize=2, ttl=60)
    cache.set("a", 1)
    cache.set("b", 2)
    cache.get("a")  # refresh "a"
    cache.set("c", 3)  # evicts "b", the least recently used
    assert cache.get("a") == 1
    assert cache.get("b") is None
    assert cache.get("c") == 3


def test_set_with_ttl_override_expires_earlier(monkeypatch):
    import time as time_mod
    from app.cache import TTLCache
    now = [1000.0]
    monkeypatch.setattr(time_mod, "monotonic", lambda: now[0])
    c = TTLCache(maxsize=4, ttl=3600.0)
    c.set("short", 1, ttl=900.0)
    c.set("long", 2)
    now[0] += 901.0
    assert c.get("short") is None
    assert c.get("long") == 2
