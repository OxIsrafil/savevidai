"""The service wiring for the country lookup, and the privacy invariant that
the IP never reaches the recorder or the logs."""
import logging
import os
from types import SimpleNamespace

from starlette.requests import Request

from app.analytics import service as service_mod
from app.analytics.config import AnalyticsConfig
from app.analytics.geo import GEO_FILENAME, CountryLookup
from app.analytics.store import SqliteStore

IP = "203.0.113.77"
TURSO_CFG = AnalyticsConfig("libsql://x", "t", "pw-long", "salt")


class SpyRecorder:
    def __init__(self):
        self.calls: list[tuple[str, dict]] = []

    def start(self) -> None:
        pass

    def record(self, type: str, **kwargs) -> None:
        self.calls.append((type, kwargs))


class FakeReader:
    def __init__(self, records: dict):
        self.records = records

    def get(self, ip: str):
        if "." not in ip and ":" not in ip:
            raise ValueError(f"'{ip}' does not appear to be an IPv4 or IPv6 address.")
        return self.records.get(ip)

    def metadata(self):
        return SimpleNamespace(database_type="DBIP-Country-Lite")

    def close(self) -> None:
        pass


class RaisingReader(FakeReader):
    def get(self, ip: str):
        raise ValueError(f"'{ip}' does not appear to be an IPv4 or IPv6 address.")


def _req(headers: dict, client_host: str | None = "10.0.0.1") -> Request:
    scope = {
        "type": "http",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
        "client": (client_host, 12345) if client_host else None,
    }
    return Request(scope)


def _service(reader=None) -> tuple[service_mod.AnalyticsService, SpyRecorder]:
    svc = service_mod.AnalyticsService()
    rec = SpyRecorder()
    svc.init(TURSO_CFG, SqliteStore(":memory:"), rec, env={})
    svc._lookup = CountryLookup(reader)
    return svc, rec


def test_record_passes_the_country_code_and_never_the_ip():
    svc, rec = _service(FakeReader({IP: {"country": {"iso_code": "US"}}}))
    svc.record_from_request(_req({"CF-Connecting-IP": IP}), "visit", None, platform="twitter",
                            source="search", visitor_kind="new", locale="es")
    assert len(rec.calls) == 1
    type_, kw = rec.calls[0]
    assert type_ == "visit"
    assert kw["country"] == "US"
    assert kw["locale"] == "es"
    assert kw["platform"] == "twitter"
    assert len(kw["visitor"]) == 16
    assert IP not in repr(rec.calls)


def test_cf_ipcountry_header_is_no_longer_read():
    svc, rec = _service(reader=None)
    svc.record_from_request(_req({"CF-IPCountry": "BD", "CF-Connecting-IP": IP}), "fetch", "ok")
    assert rec.calls[0][1]["country"] is None


def test_unknown_country_stays_null_without_breaking_the_event():
    svc, rec = _service(FakeReader({}))
    svc.record_from_request(_req({"CF-Connecting-IP": "10.0.0.1"}), "fetch", "ok",
                            platform="reddit")
    assert rec.calls[0][1] == {"visitor": rec.calls[0][1]["visitor"], "outcome": "ok",
                               "country": None, "platform": "reddit", "source": None,
                               "visitor_kind": None, "locale": None}


def test_raising_reader_and_unknown_ip_leave_no_trace_in_the_logs(caplog):
    caplog.set_level(logging.DEBUG, logger="savevidai.analytics")
    svc, rec = _service(RaisingReader({}))
    svc.record_from_request(_req({"CF-Connecting-IP": IP}), "fetch", "ok")
    # no client and no headers: client_ip() answers "unknown"
    svc.record_from_request(_req({}, client_host=None), "visit", None, visitor_kind="new")
    assert [c[1]["country"] for c in rec.calls] == [None, None]
    assert caplog.records == []
    assert not any(IP in r.getMessage() or "unknown" in r.getMessage() for r in caplog.records)
    assert IP not in repr(rec.calls)


def test_init_loads_an_existing_file_and_starts_the_updater_only_when_asked(tmp_path,
                                                                            monkeypatch):
    loaded: list[str] = []
    monkeypatch.setattr(CountryLookup, "load", lambda self, path: loaded.append(path) or True)
    started: list[str] = []

    class FakeUpdater:
        def __init__(self, lookup, directory, *, client=None):
            self.directory = directory

        def start(self):
            started.append(self.directory)

    monkeypatch.setattr(service_mod, "GeoUpdater", FakeUpdater)
    (tmp_path / GEO_FILENAME).write_bytes(b"x")
    local = AnalyticsConfig(admin_password="pw-long", salt="salt",
                            db_path=str(tmp_path / "analytics.db"))

    svc = service_mod.AnalyticsService()
    svc.init(local, SqliteStore(":memory:"), SpyRecorder(),
             env={"GEOIP_DIR": str(tmp_path), "GEOIP_UPDATE": "1"})
    assert loaded == [str(tmp_path / GEO_FILENAME)]
    assert started == [str(tmp_path)]

    # no GEOIP_UPDATE: the file loads, the updater does not start
    svc = service_mod.AnalyticsService()
    svc.init(local, SqliteStore(":memory:"), SpyRecorder(), env={"GEOIP_DIR": str(tmp_path)})
    assert loaded == [str(tmp_path / GEO_FILENAME)] * 2
    assert started == [str(tmp_path)]

    # the default directory next to the SQLite file, with no file there yet
    svc = service_mod.AnalyticsService()
    svc.init(local, SqliteStore(":memory:"), SpyRecorder(), env={"GEOIP_UPDATE": "yes"})
    assert len(loaded) == 2
    assert started == [str(tmp_path), str(tmp_path / "geoip")]

    # Turso mode without GEOIP_DIR resolves nowhere: nothing loads or starts
    svc = service_mod.AnalyticsService()
    svc.init(TURSO_CFG, SqliteStore(":memory:"), SpyRecorder(), env={"GEOIP_UPDATE": "1"})
    assert len(loaded) == 2 and len(started) == 2
    assert svc.enabled is True


def test_a_geo_setup_failure_never_disables_analytics(monkeypatch, caplog):
    def boom(env, cfg):
        raise RuntimeError("bad geo dir")

    monkeypatch.setattr(service_mod, "resolve_geo_dir", boom)
    svc = service_mod.AnalyticsService()
    svc.init(TURSO_CFG, SqliteStore(":memory:"), SpyRecorder(), env={})
    assert svc.enabled is True
    assert any("country lookup setup failed" in r.getMessage() for r in caplog.records)


def test_init_reads_the_process_environment_by_default(monkeypatch):
    # init() without env uses os.environ, so the container's GEOIP_UPDATE=1
    # and the volume path reach the lookup without main.py changing.
    seen: list = []
    monkeypatch.setattr(service_mod, "resolve_geo_dir",
                        lambda env, cfg: seen.append(env) or None)
    svc = service_mod.AnalyticsService()
    svc.init(TURSO_CFG, SqliteStore(":memory:"), SpyRecorder())
    assert seen == [os.environ]
