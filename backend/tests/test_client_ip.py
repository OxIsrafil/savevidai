import pytest
from starlette.requests import Request

from app.client_ip import client_country, client_ip


def _req(headers: dict, client_host: str | None = "10.0.0.1") -> Request:
    scope = {
        "type": "http",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
        "client": (client_host, 12345) if client_host else None,
    }
    return Request(scope)


@pytest.fixture(autouse=True)
def _cloudflare_untrusted(monkeypatch):
    # Pin the production default (DNS-only, flag unset) even if the shell
    # running the suite happens to export the flag.
    monkeypatch.delenv("TRUST_CLOUDFLARE_HEADERS", raising=False)


@pytest.fixture()
def cloudflare_trusted(monkeypatch):
    monkeypatch.setenv("TRUST_CLOUDFLARE_HEADERS", "1")


def test_ignores_cf_connecting_ip_by_default():
    # DNS-only: Cloudflare never sets this header, so it came from the client.
    r = _req({"CF-Connecting-IP": "1.2.3.4", "X-Forwarded-For": "9.9.9.9"})
    assert client_ip(r) == "9.9.9.9"


def test_ignores_cf_connecting_ip_by_default_without_xff():
    r = _req({"CF-Connecting-IP": "1.2.3.4"})
    assert client_ip(r) == "10.0.0.1"


def test_ignores_cf_connecting_ip_when_flag_is_falsy(monkeypatch):
    monkeypatch.setenv("TRUST_CLOUDFLARE_HEADERS", "0")
    r = _req({"CF-Connecting-IP": "1.2.3.4", "X-Forwarded-For": "9.9.9.9"})
    assert client_ip(r) == "9.9.9.9"


def test_prefers_cf_connecting_ip_when_cloudflare_trusted(cloudflare_trusted):
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


def test_blank_cf_header_falls_through(cloudflare_trusted):
    r = _req({"CF-Connecting-IP": "   ", "X-Forwarded-For": "5.6.7.8"})
    assert client_ip(r) == "5.6.7.8"


def test_country_ignored_by_default():
    # A well-formed code is still client-written while DNS-only.
    assert client_country(_req({"CF-IPCountry": "US"})) is None


def test_country_when_cloudflare_trusted(cloudflare_trusted):
    assert client_country(_req({"CF-IPCountry": "BD"})) == "BD"


def test_country_missing_header(cloudflare_trusted):
    assert client_country(_req({})) is None


@pytest.mark.parametrize("value", [
    "",
    "us",
    "Us",
    "USA",
    "U",
    "U1",
    " US",
    "U S",
    "US\n",  # "^[A-Z]{2}$" with re.match would let this through
    "XX",  # Cloudflare: no country data
    "T1",  # Cloudflare: Tor
    "<img src=x onerror=alert(1)>",
])
def test_country_rejects_anything_but_two_uppercase_letters(cloudflare_trusted, value):
    assert client_country(_req({"CF-IPCountry": value})) is None
