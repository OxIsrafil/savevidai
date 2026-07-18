from starlette.requests import Request

from app.client_ip import client_ip


def _req(headers: dict, client_host: str | None = "10.0.0.1") -> Request:
    scope = {
        "type": "http",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
        "client": (client_host, 12345) if client_host else None,
    }
    return Request(scope)


def test_prefers_cf_connecting_ip():
    r = _req({"CF-Connecting-IP": "1.2.3.4", "X-Forwarded-For": "9.9.9.9"})
    assert client_ip(r) == "1.2.3.4"


def test_falls_back_to_first_xff_hop():
    r = _req({"X-Forwarded-For": "5.6.7.8, 10.0.0.1, 172.16.0.1"})
    assert client_ip(r) == "5.6.7.8"


def test_falls_back_to_client_host():
    r = _req({})
    assert client_ip(r) == "10.0.0.1"


def test_unknown_when_no_source():
    r = _req({}, client_host=None)
    assert client_ip(r) == "unknown"
