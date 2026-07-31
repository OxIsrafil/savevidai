import re
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app

# The shipped admin shell, read straight off disk so the test pins the real
# artifact and not a fixture stand-in.
ADMIN_SHELL = Path(__file__).resolve().parents[2] / "frontend" / "admin.html"

ROBOTS_NOINDEX = re.compile(r'<meta\s+name="robots"\s+content="[^"]*noindex[^"]*"')

BANNER = '<script src="https://example-ads.test/banner.js"></script>'
POP = '<script src="https://example-ads.test/pop.js"></script>'

PAGE = "<!doctype html>\n<html><body>\n<p>{name}</p>\n<!--ADS-->\n</body></html>\n"

PUBLIC_PATHS = [
    ("/", "index.html"),
    ("/index.html", "index.html"),
    ("/tiktokvideodownloader", "tiktokvideodownloader.html"),
    ("/tiktokvideodownloader.html", "tiktokvideodownloader.html"),
    ("/redditvideodownloader", "redditvideodownloader.html"),
    ("/redditvideodownloader.html", "redditvideodownloader.html"),
    ("/instagramvideodownloader", "instagramvideodownloader.html"),
    ("/instagramvideodownloader.html", "instagramvideodownloader.html"),
    ("/facebookvideodownloader", "facebookvideodownloader.html"),
    ("/facebookvideodownloader.html", "facebookvideodownloader.html"),
]


def _static(tmp_path, monkeypatch):
    for _, fname in PUBLIC_PATHS:
        (tmp_path / fname).write_text(PAGE.format(name=fname))
    (tmp_path / "admin.html").write_text("<!doctype html><title>admin</title>")
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))


def _ads_on(monkeypatch):
    monkeypatch.setenv("ADS_ENABLED", "1")
    monkeypatch.setenv("AD_BANNER_SNIPPET", BANNER)
    monkeypatch.setenv("AD_POPUNDER_SNIPPET", POP)


def test_ads_off_no_marker_or_slot_on_any_public_path(tmp_path, monkeypatch):
    _static(tmp_path, monkeypatch)
    monkeypatch.delenv("ADS_ENABLED", raising=False)
    client = TestClient(create_app())
    for path, fname in PUBLIC_PATHS:
        res = client.get(path)
        assert res.status_code == 200, path
        assert "<!--ADS-->" not in res.text, path
        assert "ad-slot" not in res.text, path
        assert fname in res.text, path
        # Body equals the on-disk file minus the marker line.
        assert res.text == PAGE.format(name=fname).replace("<!--ADS-->\n", ""), path


def test_ads_on_all_public_paths_carry_banner_and_popunder(tmp_path, monkeypatch):
    _static(tmp_path, monkeypatch)
    _ads_on(monkeypatch)
    client = TestClient(create_app())
    for path, _ in PUBLIC_PATHS:
        res = client.get(path)
        assert f'<div class="ad-slot">{BANNER}</div>' in res.text, path
        assert POP in res.text, path
        assert "<!--ADS-->" not in res.text, path


def test_ads_on_admin_and_api_stay_clean(tmp_path, monkeypatch):
    _static(tmp_path, monkeypatch)
    _ads_on(monkeypatch)
    client = TestClient(create_app())
    for path in ("/admin", "/admin.html"):
        res = client.get(path)
        assert res.status_code == 200, path
        assert "ad-slot" not in res.text and BANNER not in res.text, path
        assert POP not in res.text, path
    health = client.get("/api/health")
    assert health.status_code == 200
    assert "ad-slot" not in health.text


def test_banner_only_mode_via_empty_popunder(tmp_path, monkeypatch):
    _static(tmp_path, monkeypatch)
    monkeypatch.setenv("ADS_ENABLED", "1")
    monkeypatch.setenv("AD_BANNER_SNIPPET", BANNER)
    monkeypatch.setenv("AD_POPUNDER_SNIPPET", "")
    client = TestClient(create_app())
    res = client.get("/")
    assert "ad-slot" in res.text
    assert POP not in res.text


def test_maintenance_on_serves_maintenance_page_without_ads(tmp_path, monkeypatch):
    _static(tmp_path, monkeypatch)
    (tmp_path / "maintenance.html").write_text("<!doctype html><title>brb</title>")
    _ads_on(monkeypatch)
    monkeypatch.setenv("MAINTENANCE_MODE", "1")
    client = TestClient(create_app())
    for path, _ in PUBLIC_PATHS:
        res = client.get(path)
        assert res.status_code == 503, path
        assert "brb" in res.text, path
        assert "ad-slot" not in res.text and POP not in res.text, path


def _real_admin_static(tmp_path, monkeypatch):
    """Static dir whose admin.html is a byte copy of the shipped shell."""
    _static(tmp_path, monkeypatch)
    (tmp_path / "admin.html").write_text(ADMIN_SHELL.read_text())


def test_admin_route_carries_x_robots_tag_noindex(tmp_path, monkeypatch):
    _real_admin_static(tmp_path, monkeypatch)
    client = TestClient(create_app())
    res = client.get("/admin")
    assert res.status_code == 200
    assert res.headers.get("x-robots-tag") == "noindex"


def test_served_admin_html_body_carries_noindex_meta(tmp_path, monkeypatch):
    _real_admin_static(tmp_path, monkeypatch)
    client = TestClient(create_app())
    res = client.get("/admin")
    assert res.status_code == 200
    assert ROBOTS_NOINDEX.search(res.text), res.text


def test_public_page_is_not_noindex(tmp_path, monkeypatch):
    # Canary: the noindex must stay scoped to /admin. If a public page ever
    # picks up the header or the meta, the site drops out of search.
    _real_admin_static(tmp_path, monkeypatch)
    client = TestClient(create_app())
    for path, _ in PUBLIC_PATHS:
        res = client.get(path)
        assert res.status_code == 200, path
        assert "x-robots-tag" not in res.headers, path
        assert "noindex" not in res.text, path


def test_root_404_without_static_dir(monkeypatch):
    monkeypatch.delenv("STATIC_DIR", raising=False)
    client = TestClient(create_app(), raise_server_exceptions=False)
    assert client.get("/").status_code == 404
