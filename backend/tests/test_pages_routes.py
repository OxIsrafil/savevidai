import re
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app

# The shipped admin shell, read straight off disk so the test pins the real
# artifact and not a fixture stand-in.
ADMIN_SHELL = Path(__file__).resolve().parents[2] / "frontend" / "admin.html"

ROBOTS_NOINDEX = re.compile(r'<meta\s+name="robots"\s+content="[^"]*noindex[^"]*"')

PAGE = "<!doctype html>\n<html><body>\n<p>{name}</p>\n</body></html>\n"

# Every public URL and the shell it must serve, written out by hand: 15 pages
# (5 en at the root + 5 es + 5 hi) in both the clean and the .html form. The
# table is explicit on purpose so it pins the URL shapes independently of the
# route loop in main.py - a bug in that loop cannot hide behind a matching bug
# here. Locale homes are the trailing-slash form (/es/, /hi/) per the spec.
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
    ("/es/", "es/index.html"),
    ("/es/index.html", "es/index.html"),
    ("/es/tiktokvideodownloader", "es/tiktokvideodownloader.html"),
    ("/es/tiktokvideodownloader.html", "es/tiktokvideodownloader.html"),
    ("/es/redditvideodownloader", "es/redditvideodownloader.html"),
    ("/es/redditvideodownloader.html", "es/redditvideodownloader.html"),
    ("/es/instagramvideodownloader", "es/instagramvideodownloader.html"),
    ("/es/instagramvideodownloader.html", "es/instagramvideodownloader.html"),
    ("/es/facebookvideodownloader", "es/facebookvideodownloader.html"),
    ("/es/facebookvideodownloader.html", "es/facebookvideodownloader.html"),
    ("/hi/", "hi/index.html"),
    ("/hi/index.html", "hi/index.html"),
    ("/hi/tiktokvideodownloader", "hi/tiktokvideodownloader.html"),
    ("/hi/tiktokvideodownloader.html", "hi/tiktokvideodownloader.html"),
    ("/hi/redditvideodownloader", "hi/redditvideodownloader.html"),
    ("/hi/redditvideodownloader.html", "hi/redditvideodownloader.html"),
    ("/hi/instagramvideodownloader", "hi/instagramvideodownloader.html"),
    ("/hi/instagramvideodownloader.html", "hi/instagramvideodownloader.html"),
    ("/hi/facebookvideodownloader", "hi/facebookvideodownloader.html"),
    ("/hi/facebookvideodownloader.html", "hi/facebookvideodownloader.html"),
]


def _static(tmp_path, monkeypatch):
    for _, fname in PUBLIC_PATHS:
        target = tmp_path / fname
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(PAGE.format(name=fname))
    (tmp_path / "admin.html").write_text("<!doctype html><title>admin</title>")
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))


def test_public_paths_table_is_15_pages_in_both_forms():
    assert len(PUBLIC_PATHS) == 30
    assert len({p for p, _ in PUBLIC_PATHS}) == 30
    assert len({f for _, f in PUBLIC_PATHS}) == 15
    for prefix in ("es/", "hi/"):
        assert len({f for _, f in PUBLIC_PATHS if f.startswith(prefix)}) == 5


def test_every_public_path_serves_its_shell_verbatim(tmp_path, monkeypatch):
    _static(tmp_path, monkeypatch)
    client = TestClient(create_app())
    for path, fname in PUBLIC_PATHS:
        res = client.get(path)
        assert res.status_code == 200, path
        assert res.headers["content-type"].startswith("text/html"), path
        # Byte-for-byte the file on disk: nothing is injected or stripped.
        assert res.text == (tmp_path / fname).read_text(), path
        assert res.headers["cache-control"] == "no-cache", path


def test_admin_and_api_are_not_served_by_the_page_loop(tmp_path, monkeypatch):
    # Canary: /admin has its own route in analytics/router.py and /api/* belongs
    # to the API routers. Neither may be swallowed by the public page loop.
    _static(tmp_path, monkeypatch)
    client = TestClient(create_app())
    admin = client.get("/admin")
    assert admin.status_code == 200
    assert "<title>admin</title>" in admin.text
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["ok"] is True


def test_maintenance_on_serves_the_maintenance_page(tmp_path, monkeypatch):
    _static(tmp_path, monkeypatch)
    (tmp_path / "maintenance.html").write_text("<!doctype html><title>brb</title>")
    monkeypatch.setenv("MAINTENANCE_MODE", "1")
    client = TestClient(create_app())
    for path, _ in PUBLIC_PATHS:
        res = client.get(path)
        assert res.status_code == 503, path
        assert "brb" in res.text, path


def test_locale_home_without_trailing_slash_redirects(tmp_path, monkeypatch):
    # /es -> /es/ is left to the framework (StaticFiles' directory redirect when
    # the mount is present, Starlette's redirect_slashes otherwise). Pinned so
    # a bare /es link in the wild never 404s.
    _static(tmp_path, monkeypatch)
    client = TestClient(create_app())
    for locale in ("es", "hi"):
        res = client.get(f"/{locale}", follow_redirects=False)
        assert res.status_code in (301, 307, 308), locale
        assert res.headers["location"].endswith(f"/{locale}/"), locale
        followed = client.get(f"/{locale}")
        assert followed.status_code == 200, locale
        assert f"{locale}/index.html" in followed.text, locale


def test_locale_page_404_without_static_dir(monkeypatch):
    monkeypatch.delenv("STATIC_DIR", raising=False)
    client = TestClient(create_app(), raise_server_exceptions=False)
    for path in ("/es/", "/hi/", "/es/tiktokvideodownloader", "/hi/redditvideodownloader.html"):
        assert client.get(path).status_code == 404, path


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
