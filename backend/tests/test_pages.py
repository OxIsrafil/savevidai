import os

import pytest
from fastapi import HTTPException

from app.envutil import env_truthy
from app.pages import AdConfig, PageRenderer, load_ad_config

BANNER = '<script src="https://example-ads.test/banner.js"></script>'
POP = '<script src="https://example-ads.test/pop.js"></script>'

PAGE = "<!doctype html>\n<html><body>\n<p>hello</p>\n<!--ADS-->\n</body></html>\n"
PAGE_NO_MARKER = "<!doctype html>\n<html><body>\n<p>hello</p>\n</body></html>\n"


def _write(tmp_path, name, content=PAGE):
    p = tmp_path / name
    p.write_text(content)
    return p


def test_env_truthy_accepts_the_truthy_set(monkeypatch):
    for v in ("1", "true", "YES", " on "):
        monkeypatch.setenv("X_FLAG", v)
        assert env_truthy("X_FLAG") is True
    for v in ("", "0", "false", "off", "nope"):
        monkeypatch.setenv("X_FLAG", v)
        assert env_truthy("X_FLAG") is False
    monkeypatch.delenv("X_FLAG")
    assert env_truthy("X_FLAG") is False


def test_load_ad_config_reads_env(monkeypatch):
    monkeypatch.setenv("ADS_ENABLED", "1")
    monkeypatch.setenv("AD_BANNER_SNIPPET", BANNER)
    monkeypatch.setenv("AD_POPUNDER_SNIPPET", POP)
    cfg = load_ad_config()
    assert cfg == AdConfig(enabled=True, banner=BANNER, popunder=POP)
    assert cfg.active is True


def test_ad_config_enabled_but_empty_is_inactive():
    assert AdConfig(enabled=True, banner="", popunder="").active is False
    assert AdConfig(enabled=False, banner=BANNER, popunder=POP).active is False


def test_render_off_strips_the_whole_marker_line(tmp_path, monkeypatch):
    _write(tmp_path, "index.html")
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))
    r = PageRenderer(AdConfig(enabled=False, banner="", popunder=""))
    body = r.render("index.html").body.decode()
    assert "<!--ADS-->" not in body
    assert "ad-slot" not in body
    # The rendered output equals the file with the marker LINE removed.
    assert body == PAGE.replace("<!--ADS-->\n", "")


def test_render_on_injects_banner_and_popunder(tmp_path, monkeypatch):
    _write(tmp_path, "index.html")
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))
    r = PageRenderer(AdConfig(enabled=True, banner=BANNER, popunder=POP))
    body = r.render("index.html").body.decode()
    assert f'<div class="ad-slot">{BANNER}</div>' in body
    assert POP in body
    assert "<!--ADS-->" not in body


def test_render_banner_only(tmp_path, monkeypatch):
    _write(tmp_path, "index.html")
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))
    r = PageRenderer(AdConfig(enabled=True, banner=BANNER, popunder=""))
    body = r.render("index.html").body.decode()
    assert "ad-slot" in body
    assert POP not in body


def test_render_enabled_but_both_empty_matches_off(tmp_path, monkeypatch):
    _write(tmp_path, "index.html")
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))
    on = PageRenderer(AdConfig(enabled=True, banner="", popunder=""))
    off = PageRenderer(AdConfig(enabled=False, banner="", popunder=""))
    assert on.render("index.html").body == off.render("index.html").body


def test_render_markerless_file_served_unchanged(tmp_path, monkeypatch):
    _write(tmp_path, "index.html", PAGE_NO_MARKER)
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))
    r = PageRenderer(AdConfig(enabled=True, banner=BANNER, popunder=POP))
    assert r.render("index.html").body.decode() == PAGE_NO_MARKER


def test_render_404_without_static_dir(monkeypatch):
    monkeypatch.delenv("STATIC_DIR", raising=False)
    r = PageRenderer(AdConfig(enabled=False, banner="", popunder=""))
    with pytest.raises(HTTPException) as e:
        r.render("index.html")
    assert e.value.status_code == 404


def test_render_404_missing_file(tmp_path, monkeypatch):
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))
    r = PageRenderer(AdConfig(enabled=False, banner="", popunder=""))
    with pytest.raises(HTTPException):
        r.render("nope.html")


def test_render_cache_refreshes_on_mtime_bump(tmp_path, monkeypatch):
    p = _write(tmp_path, "index.html")
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))
    r = PageRenderer(AdConfig(enabled=False, banner="", popunder=""))
    first = r.render("index.html").body.decode()
    assert "hello" in first
    p.write_text(PAGE.replace("hello", "changed"))
    st = os.stat(p)
    os.utime(p, ns=(st.st_atime_ns, st.st_mtime_ns + 1_000_000))
    second = r.render("index.html").body.decode()
    assert "changed" in second


def test_render_cache_serves_cached_at_same_mtime(tmp_path, monkeypatch):
    p = _write(tmp_path, "index.html")
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))
    r = PageRenderer(AdConfig(enabled=False, banner="", popunder=""))
    r.render("index.html")
    st = os.stat(p)
    # Rewrite content but force the mtime back to the cached value: the
    # renderer must serve the cached body (proves it is not re-reading disk).
    p.write_text(PAGE.replace("hello", "sneaky"))
    os.utime(p, ns=(st.st_atime_ns, st.st_mtime_ns))
    assert "hello" in r.render("index.html").body.decode()
