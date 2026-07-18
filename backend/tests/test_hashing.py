from app.analytics.hashing import visitor_hash

SALT = "random-salt"


def test_len_and_hex():
    h = visitor_hash(SALT, "1.2.3.4", "2026-07-17")
    assert len(h) == 16
    assert all(c in "0123456789abcdef" for c in h)


def test_stable_within_day():
    a = visitor_hash(SALT, "1.2.3.4", "2026-07-17")
    b = visitor_hash(SALT, "1.2.3.4", "2026-07-17")
    assert a == b


def test_rotates_across_days():
    a = visitor_hash(SALT, "1.2.3.4", "2026-07-17")
    b = visitor_hash(SALT, "1.2.3.4", "2026-07-18")
    assert a != b


def test_salt_changes_output():
    a = visitor_hash(SALT, "1.2.3.4", "2026-07-17")
    b = visitor_hash("other-salt", "1.2.3.4", "2026-07-17")
    assert a != b


def test_never_contains_ip():
    h = visitor_hash(SALT, "203.0.113.77", "2026-07-17")
    assert "203.0.113.77" not in h
