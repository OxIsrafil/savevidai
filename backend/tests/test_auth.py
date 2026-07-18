from app.analytics.auth import check_password, make_cookie, verify_cookie

PW = "long-random-password"
NOW = 1_800_000_000.0


def test_check_password():
    assert check_password("long-random-password", PW) is True
    assert check_password("wrong", PW) is False


def test_cookie_roundtrip():
    c = make_cookie(PW, NOW)
    assert verify_cookie(c, PW, NOW + 10) is True


def test_cookie_expires():
    c = make_cookie(PW, NOW, ttl_seconds=100)
    assert verify_cookie(c, PW, NOW + 101) is False


def test_cookie_rejects_wrong_password():
    c = make_cookie(PW, NOW)
    assert verify_cookie(c, "changed-password", NOW + 10) is False


def test_cookie_rejects_tamper():
    c = make_cookie(PW, NOW)
    tampered = c[:-2] + ("aa" if not c.endswith("aa") else "bb")
    assert verify_cookie(tampered, PW, NOW + 10) is False


def test_cookie_rejects_garbage():
    assert verify_cookie("not-a-cookie", PW, NOW) is False
    assert verify_cookie("", PW, NOW) is False
