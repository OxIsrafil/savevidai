"""Country lookup and updater tests. No real network: the updater is driven
through respx, the lookup through a fake reader. An opt-in smoke test at the
bottom runs against a real DB-IP file when GEOIP_TEST_DB points at one."""
import gzip
import logging
import os
from datetime import UTC, datetime
from types import SimpleNamespace

import httpx
import maxminddb
import pytest
import respx

from app.analytics import geo
from app.analytics.config import AnalyticsConfig
from app.analytics.geo import (
    GEO_FILENAME,
    MARKER_FILENAME,
    CountryLookup,
    GeoUpdater,
    _previous_month,
    resolve_geo_dir,
)

NOW = datetime(2026, 9, 23, 7, 30, tzinfo=UTC)
URL = "https://download.db-ip.com/free/dbip-country-lite-{month}.mmdb.gz"
BODY = b"pretend this is a 2026-09 mmdb"
GZ = gzip.compress(BODY)


class FakeReader:
    """Stands in for a maxminddb.Reader: a dict of records plus the real
    library's failure modes (ValueError quoting a bad address, None for an
    unlisted one, ValueError after close)."""

    def __init__(self, records: dict, database_type: str = "DBIP-Country-Lite"):
        self.records = records
        self.database_type = database_type
        self.closed = False

    def get(self, ip: str):
        if self.closed:
            raise ValueError("Attempt to read from a closed MaxMind DB.")
        if "." not in ip and ":" not in ip:
            raise ValueError(f"'{ip}' does not appear to be an IPv4 or IPv6 address.")
        return self.records.get(ip)

    def metadata(self):
        return SimpleNamespace(database_type=self.database_type)

    def close(self) -> None:
        self.closed = True


class RaisingReader(FakeReader):
    def get(self, ip: str):
        raise ValueError(f"'{ip}' does not appear to be an IPv4 or IPv6 address.")


class FakeLookup:
    """What the updater needs from CountryLookup: loaded, validate() and load().
    `loads` records every load() call; `loaded` turns True after one."""

    def __init__(self, valid: bool = True, loaded: bool = False):
        self.valid = valid
        self.loaded = loaded
        self.validated: list[str] = []
        self.loads: list[str] = []

    def validate(self, path: str) -> bool:
        self.validated.append(path)
        return self.valid

    def load(self, path: str) -> bool:
        self.loads.append(path)
        self.loaded = True
        return True


RECORDS = {
    "203.0.113.77": {"country": {"iso_code": "US"}},
    "198.51.100.9": {"country": {"iso_code": "us"}},
    "192.0.2.1": {"country": {"iso_code": "ZZ"}},
    "192.0.2.2": {"country": {"iso_code": "XX"}},
    "192.0.2.3": {"continent": {"code": "EU"}},
    "192.0.2.4": {"country": {"iso_code": None}},
    "192.0.2.5": {"country": {"iso_code": "US\n"}},
    "2001:db8::1": {"country": {"iso_code": "DE"}},
}


# ---- CountryLookup.country -------------------------------------------------------

def test_country_returns_valid_codes_only():
    lookup = CountryLookup(FakeReader(RECORDS))
    assert lookup.loaded is True
    assert lookup.country("203.0.113.77") == "US"
    assert lookup.country("2001:db8::1") == "DE"
    assert lookup.country("198.51.100.9") is None  # lowercase is not a code
    assert lookup.country("192.0.2.1") is None  # ZZ placeholder
    assert lookup.country("192.0.2.2") is None  # XX placeholder
    assert lookup.country("192.0.2.3") is None  # no country key
    assert lookup.country("192.0.2.4") is None  # null code
    assert lookup.country("192.0.2.5") is None  # "$" would pass a trailing newline
    assert lookup.country("10.0.0.1") is None  # no record (private range)
    assert lookup.country("not-an-ip") is None  # ValueError swallowed
    assert lookup.country("unknown") is None  # client_ip()'s fallback value


def test_country_without_a_reader_or_with_a_raising_one_is_none_and_silent(caplog):
    caplog.set_level(logging.DEBUG, logger="savevidai.analytics")
    assert CountryLookup().loaded is False
    assert CountryLookup().country("203.0.113.77") is None
    assert CountryLookup(RaisingReader({})).country("203.0.113.77") is None
    closed = FakeReader(RECORDS)
    closed.close()
    assert CountryLookup(closed).country("203.0.113.77") is None
    assert caplog.records == []
    assert not any("203.0.113.77" in r.getMessage() for r in caplog.records)


# ---- CountryLookup.validate / load -----------------------------------------------

def test_validate_requires_a_country_database_that_resolves_google_dns(monkeypatch):
    good = FakeReader({"8.8.8.8": {"country": {"iso_code": "US"}}})
    monkeypatch.setattr(geo.maxminddb, "open_database", lambda path: good)
    assert CountryLookup.validate("/x/good.mmdb") is True
    assert good.closed is True

    asn = FakeReader({"8.8.8.8": {"country": {"iso_code": "US"}}}, database_type="DBIP-ASN-Lite")
    monkeypatch.setattr(geo.maxminddb, "open_database", lambda path: asn)
    assert CountryLookup.validate("/x/asn.mmdb") is False
    assert asn.closed is True

    empty = FakeReader({})
    monkeypatch.setattr(geo.maxminddb, "open_database", lambda path: empty)
    assert CountryLookup.validate("/x/empty.mmdb") is False

    def boom(path):
        raise OSError("no such file")

    monkeypatch.setattr(geo.maxminddb, "open_database", boom)
    assert CountryLookup.validate("/x/missing.mmdb") is False


def test_load_swaps_the_reader_and_closes_the_old_one(monkeypatch):
    old = FakeReader({"203.0.113.77": {"country": {"iso_code": "BD"}}})
    new = FakeReader({"203.0.113.77": {"country": {"iso_code": "US"}}})
    lookup = CountryLookup(old)
    monkeypatch.setattr(geo.maxminddb, "open_database", lambda path: new)
    assert lookup.load("/x/new.mmdb") is True
    assert lookup.country("203.0.113.77") == "US"
    assert old.closed is True
    assert new.closed is False


def test_load_keeps_the_old_reader_on_open_failure_or_wrong_type(monkeypatch):
    old = FakeReader({"203.0.113.77": {"country": {"iso_code": "BD"}}})
    lookup = CountryLookup(old)

    def boom(path):
        raise OSError("corrupt")

    monkeypatch.setattr(geo.maxminddb, "open_database", boom)
    assert lookup.load("/x/corrupt.mmdb") is False
    assert lookup.country("203.0.113.77") == "BD"

    wrong = FakeReader({}, database_type="GeoLite2-ASN")
    monkeypatch.setattr(geo.maxminddb, "open_database", lambda path: wrong)
    assert lookup.load("/x/asn.mmdb") is False
    assert wrong.closed is True
    assert old.closed is False
    assert lookup.country("203.0.113.77") == "BD"


# ---- resolve_geo_dir -------------------------------------------------------------

def test_resolve_geo_dir_prefers_env_then_absolute_sqlite_path():
    local = AnalyticsConfig(admin_password="pw", salt="s", db_path="/data/analytics.db")
    assert resolve_geo_dir({"GEOIP_DIR": "/srv/geo"}, local) == "/srv/geo"
    assert resolve_geo_dir({"GEOIP_DIR": "  "}, local) == "/data/geoip"
    assert resolve_geo_dir({}, local) == "/data/geoip"


def test_resolve_geo_dir_is_none_for_turso_relative_or_memory_paths():
    turso = AnalyticsConfig("libsql://x", "t", "pw", "s")
    assert resolve_geo_dir({}, turso) is None
    both = AnalyticsConfig("libsql://x", "t", "pw", "s", db_path="/data/analytics.db")
    assert resolve_geo_dir({}, both) is None  # make_store picks Turso when both are set
    assert resolve_geo_dir({}, AnalyticsConfig(admin_password="pw", salt="s",
                                               db_path="analytics.db")) is None
    assert resolve_geo_dir({}, AnalyticsConfig(admin_password="pw", salt="s",
                                               db_path=":memory:")) is None
    assert resolve_geo_dir({}, AnalyticsConfig(admin_password="pw", salt="s")) is None


# ---- GeoUpdater ------------------------------------------------------------------
# Routes are registered on the context router (`with respx.mock as mock`), the
# idiom tests/test_reddit_auth.py uses: they are torn down with the context and
# never leak into another test.

def test_previous_month_wraps_the_year():
    assert _previous_month("2026-09") == "2026-08"
    assert _previous_month("2026-01") == "2025-12"
    assert _previous_month("2026-10") == "2026-09"


def test_run_once_installs_the_current_month(tmp_path, caplog):
    caplog.set_level(logging.INFO, logger="savevidai.analytics")
    directory = tmp_path / "geoip"  # does not exist yet: the updater creates it
    lookup = FakeLookup()
    with respx.mock as mock:
        route = mock.get(URL.format(month="2026-09")).mock(
            return_value=httpx.Response(200, content=GZ))
        assert GeoUpdater(lookup, str(directory)).run_once(NOW) is True
        assert route.called
    final = directory / GEO_FILENAME
    assert final.read_bytes() == BODY
    assert (directory / MARKER_FILENAME).read_text().strip() == "2026-09"
    assert lookup.loads == [str(final)]
    assert len(lookup.validated) == 1 and lookup.validated[0].startswith(str(directory))
    assert lookup.validated[0] != str(final)  # validated the temp file, before the swap
    assert sorted(os.listdir(directory)) == sorted([GEO_FILENAME, MARKER_FILENAME])
    assert any("installed 2026-09" in r.getMessage() for r in caplog.records)


def test_run_once_skips_when_the_marker_already_says_this_month(tmp_path):
    (tmp_path / MARKER_FILENAME).write_text("2026-09\n")
    (tmp_path / GEO_FILENAME).write_bytes(b"current")
    lookup = FakeLookup(loaded=True)  # loaded at init, the normal case
    with respx.mock(assert_all_called=False) as mock:
        route = mock.get(URL.format(month="2026-09")).mock(
            return_value=httpx.Response(200, content=GZ))
        assert GeoUpdater(lookup, str(tmp_path)).run_once(NOW) is False
        assert not route.called
    assert lookup.loads == []
    assert (tmp_path / GEO_FILENAME).read_bytes() == b"current"


def _open_body_only(path):
    """maxminddb.open_database stand-in: BODY is a good country database,
    anything else is corrupt."""
    with open(path, "rb") as fh:
        if fh.read() != BODY:
            raise maxminddb.InvalidDatabaseError("corrupt")
    return FakeReader({"8.8.8.8": {"country": {"iso_code": "US"}}})


@pytest.mark.parametrize("marker", ["2026-09", "2026-08"])
def test_run_once_loads_the_file_on_disk_when_the_marker_is_current_but_nothing_is_loaded(
        marker, tmp_path, monkeypatch):
    # A failed load at init leaves the lookup empty while the marker still
    # names the month: the updater loads that file instead of skipping. The
    # 2026-08 case is the same rule on the fallback path (this month is 404).
    monkeypatch.setattr(geo.maxminddb, "open_database", _open_body_only)
    (tmp_path / MARKER_FILENAME).write_text(marker + "\n")
    (tmp_path / GEO_FILENAME).write_bytes(BODY)
    lookup = CountryLookup()
    assert lookup.loaded is False
    with respx.mock(assert_all_called=False) as mock:
        current = mock.get(URL.format(month="2026-09")).mock(return_value=httpx.Response(404))
        previous = mock.get(URL.format(month="2026-08")).mock(
            return_value=httpx.Response(200, content=GZ))
        assert GeoUpdater(lookup, str(tmp_path)).run_once(NOW) is False
        assert current.called is (marker == "2026-08")
        assert not previous.called
    assert lookup.loaded is True
    assert lookup.country("8.8.8.8") == "US"
    assert (tmp_path / MARKER_FILENAME).read_text().strip() == marker


@pytest.mark.parametrize("on_disk", [None, b"not a database"])
def test_run_once_downloads_again_when_the_marker_is_current_but_the_file_is_unusable(
        on_disk, tmp_path, monkeypatch):
    monkeypatch.setattr(geo.maxminddb, "open_database", _open_body_only)
    (tmp_path / MARKER_FILENAME).write_text("2026-09\n")
    if on_disk is not None:
        (tmp_path / GEO_FILENAME).write_bytes(on_disk)
    lookup = CountryLookup()
    with respx.mock as mock:
        route = mock.get(URL.format(month="2026-09")).mock(
            return_value=httpx.Response(200, content=GZ))
        assert GeoUpdater(lookup, str(tmp_path)).run_once(NOW) is True
        assert route.called
    assert (tmp_path / GEO_FILENAME).read_bytes() == BODY
    assert lookup.loaded is True
    assert lookup.country("8.8.8.8") == "US"
    assert sorted(os.listdir(tmp_path)) == sorted([GEO_FILENAME, MARKER_FILENAME])


def test_run_once_falls_back_to_the_previous_month_on_404(tmp_path):
    lookup = FakeLookup()
    with respx.mock as mock:
        current = mock.get(URL.format(month="2026-09")).mock(return_value=httpx.Response(404))
        previous = mock.get(URL.format(month="2026-08")).mock(
            return_value=httpx.Response(200, content=GZ))
        assert GeoUpdater(lookup, str(tmp_path)).run_once(NOW) is True
        assert current.called and previous.called
    assert (tmp_path / MARKER_FILENAME).read_text().strip() == "2026-08"
    assert (tmp_path / GEO_FILENAME).read_bytes() == BODY


def test_run_once_does_not_refetch_the_previous_month_it_already_has(tmp_path):
    (tmp_path / MARKER_FILENAME).write_text("2026-08\n")
    (tmp_path / GEO_FILENAME).write_bytes(b"august")
    lookup = FakeLookup(loaded=True)
    with respx.mock(assert_all_called=False) as mock:
        current = mock.get(URL.format(month="2026-09")).mock(return_value=httpx.Response(404))
        previous = mock.get(URL.format(month="2026-08")).mock(
            return_value=httpx.Response(200, content=GZ))
        assert GeoUpdater(lookup, str(tmp_path)).run_once(NOW) is False
        assert current.called
        assert not previous.called
    assert (tmp_path / GEO_FILENAME).read_bytes() == b"august"
    assert lookup.loads == []


@pytest.mark.parametrize("status", [500, 302, 403])
def test_run_once_treats_anything_but_200_as_failure_without_fallback(status, tmp_path, caplog):
    lookup = FakeLookup()
    with respx.mock(assert_all_called=False) as mock:
        current = mock.get(URL.format(month="2026-09")).mock(
            return_value=httpx.Response(status, headers={"location": "https://elsewhere/x"}))
        previous = mock.get(URL.format(month="2026-08")).mock(
            return_value=httpx.Response(200, content=GZ))
        assert GeoUpdater(lookup, str(tmp_path)).run_once(NOW) is False
        assert current.called
        assert not previous.called  # only a 404 falls back
    assert os.listdir(tmp_path) == []
    assert lookup.loads == []
    assert any(r.levelno == logging.WARNING and f"HTTP {status}" in r.getMessage()
               for r in caplog.records)


def test_run_once_network_error_logs_one_warning_without_a_traceback(tmp_path, caplog):
    with respx.mock as mock:
        mock.get(URL.format(month="2026-09")).mock(side_effect=httpx.ConnectError("down"))
        assert GeoUpdater(FakeLookup(), str(tmp_path)).run_once(NOW) is False
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) == 1
    assert "geoip update failed" in warnings[0].getMessage()
    assert warnings[0].exc_info is None
    assert os.listdir(tmp_path) == []


def test_run_once_aborts_over_the_compressed_cap(tmp_path, monkeypatch):
    monkeypatch.setattr(geo, "MAX_COMPRESSED", len(GZ) - 1)
    lookup = FakeLookup()
    with respx.mock as mock:
        mock.get(URL.format(month="2026-09")).mock(return_value=httpx.Response(200, content=GZ))
        assert GeoUpdater(lookup, str(tmp_path)).run_once(NOW) is False
    assert os.listdir(tmp_path) == []
    assert lookup.validated == [] and lookup.loads == []


def test_run_once_aborts_over_the_unpacked_cap(tmp_path, monkeypatch):
    monkeypatch.setattr(geo, "MAX_UNPACKED", len(BODY) - 1)
    lookup = FakeLookup()
    with respx.mock as mock:
        mock.get(URL.format(month="2026-09")).mock(return_value=httpx.Response(200, content=GZ))
        assert GeoUpdater(lookup, str(tmp_path)).run_once(NOW) is False
    assert os.listdir(tmp_path) == []
    assert lookup.validated == [] and lookup.loads == []


def test_the_download_names_itself_and_asks_for_the_file_as_stored(tmp_path):
    with respx.mock as mock:
        route = mock.get(URL.format(month="2026-09")).mock(
            return_value=httpx.Response(200, content=GZ))
        assert GeoUpdater(FakeLookup(), str(tmp_path)).run_once(NOW) is True
        request = route.calls.last.request
    assert request.headers["user-agent"] == "SaveVidAI-GeoUpdater/1.0"
    assert request.headers["accept-encoding"] == "identity"


def test_run_once_takes_a_decoded_body_as_the_database_itself(tmp_path):
    # A server that sends the .gz with Content-Encoding: gzip gets decoded by
    # httpx, so the bytes on disk are the database, not a gzip file.
    lookup = FakeLookup()
    with respx.mock as mock:
        mock.get(URL.format(month="2026-09")).mock(
            return_value=httpx.Response(200, content=GZ, headers={"Content-Encoding": "gzip"}))
        assert GeoUpdater(lookup, str(tmp_path)).run_once(NOW) is True
    final = tmp_path / GEO_FILENAME
    assert final.read_bytes() == BODY
    assert (tmp_path / MARKER_FILENAME).read_text().strip() == "2026-09"
    assert len(lookup.validated) == 1 and lookup.validated[0] != str(final)
    assert lookup.loads == [str(final)]
    assert sorted(os.listdir(tmp_path)) == sorted([GEO_FILENAME, MARKER_FILENAME])


def test_run_once_holds_the_unpacked_cap_on_a_decoded_body(tmp_path, monkeypatch):
    monkeypatch.setattr(geo, "MAX_UNPACKED", len(BODY) - 1)
    lookup = FakeLookup()
    with respx.mock as mock:
        mock.get(URL.format(month="2026-09")).mock(
            return_value=httpx.Response(200, content=GZ, headers={"Content-Encoding": "gzip"}))
        assert GeoUpdater(lookup, str(tmp_path)).run_once(NOW) is False
    assert os.listdir(tmp_path) == []
    assert lookup.validated == [] and lookup.loads == []


@pytest.mark.parametrize("body", [b"<html>not a gzip file</html>", GZ[:12]],
                         ids=["html", "truncated-gzip"])
def test_run_once_rejects_a_body_that_is_neither_a_database_nor_whole_gzip(body, tmp_path):
    lookup = CountryLookup()  # the real validate(): HTML is not a database
    with respx.mock as mock:
        mock.get(URL.format(month="2026-09")).mock(return_value=httpx.Response(200, content=body))
        assert GeoUpdater(lookup, str(tmp_path)).run_once(NOW) is False
    assert os.listdir(tmp_path) == []
    assert lookup.loaded is False


def test_run_once_gives_up_on_a_download_that_outlasts_the_deadline(tmp_path, monkeypatch,
                                                                     caplog):
    # Each piece arrives well inside the 60 s read timeout, but the whole
    # download may not take longer than DOWNLOAD_DEADLINE.
    clock = {"now": 5000.0}
    monkeypatch.setattr(geo, "monotonic", lambda: clock["now"])

    def slow_drip():
        for piece in (GZ[:8], GZ[8:16], GZ[16:]):
            clock["now"] += geo.DOWNLOAD_DEADLINE / 2 + 1
            yield piece

    lookup = FakeLookup()
    with respx.mock(assert_all_called=False) as mock:
        current = mock.get(URL.format(month="2026-09")).mock(
            return_value=httpx.Response(200, content=slow_drip()))
        previous = mock.get(URL.format(month="2026-08")).mock(
            return_value=httpx.Response(200, content=GZ))
        assert GeoUpdater(lookup, str(tmp_path)).run_once(NOW) is False
        assert current.called
        assert not previous.called
    assert os.listdir(tmp_path) == []
    assert lookup.validated == [] and lookup.loads == []
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) == 1
    assert "geoip update failed" in warnings[0].getMessage()
    assert "TimeoutError" in warnings[0].getMessage()
    assert warnings[0].exc_info is None


def test_a_download_inside_the_deadline_is_installed(tmp_path, monkeypatch):
    clock = {"now": 5000.0}
    monkeypatch.setattr(geo, "monotonic", lambda: clock["now"])

    def steady():
        for piece in (GZ[:8], GZ[8:16], GZ[16:]):
            clock["now"] += geo.DOWNLOAD_DEADLINE / 4
            yield piece

    with respx.mock as mock:
        mock.get(URL.format(month="2026-09")).mock(
            return_value=httpx.Response(200, content=steady()))
        assert GeoUpdater(FakeLookup(), str(tmp_path)).run_once(NOW) is True
    assert (tmp_path / GEO_FILENAME).read_bytes() == BODY


def test_run_once_removes_the_first_temp_file_when_the_second_cannot_be_made(tmp_path,
                                                                             monkeypatch):
    # Spec B7: every failure path unlinks its temp files, including a failure
    # between the two mkstemp calls (inode exhaustion, too many open files).
    real_mkstemp = geo.tempfile.mkstemp
    made: list[str] = []

    def flaky_mkstemp(*args, **kwargs):
        if made:
            raise OSError(24, "Too many open files")
        fd, path = real_mkstemp(*args, **kwargs)
        made.append(path)
        return fd, path

    monkeypatch.setattr(geo.tempfile, "mkstemp", flaky_mkstemp)
    lookup = FakeLookup()
    with respx.mock(assert_all_called=False) as mock:
        route = mock.get(URL.format(month="2026-09")).mock(
            return_value=httpx.Response(200, content=GZ))
        assert GeoUpdater(lookup, str(tmp_path)).run_once(NOW) is False
        assert not route.called
    assert len(made) == 1
    assert os.listdir(tmp_path) == []
    assert lookup.validated == [] and lookup.loads == []


def test_run_once_keeps_the_old_file_when_validation_fails(tmp_path):
    (tmp_path / GEO_FILENAME).write_bytes(b"august")
    (tmp_path / MARKER_FILENAME).write_text("2026-08\n")
    lookup = FakeLookup(valid=False)
    with respx.mock as mock:
        mock.get(URL.format(month="2026-09")).mock(return_value=httpx.Response(200, content=GZ))
        assert GeoUpdater(lookup, str(tmp_path)).run_once(NOW) is False
    assert (tmp_path / GEO_FILENAME).read_bytes() == b"august"
    assert (tmp_path / MARKER_FILENAME).read_text().strip() == "2026-08"
    assert sorted(os.listdir(tmp_path)) == sorted([GEO_FILENAME, MARKER_FILENAME])
    assert lookup.loads == []


def test_run_once_replaces_the_file_atomically_and_reloads(tmp_path):
    (tmp_path / GEO_FILENAME).write_bytes(b"august")
    (tmp_path / MARKER_FILENAME).write_text("2026-08\n")
    lookup = FakeLookup()
    with respx.mock as mock:
        mock.get(URL.format(month="2026-09")).mock(return_value=httpx.Response(200, content=GZ))
        assert GeoUpdater(lookup, str(tmp_path)).run_once(NOW) is True
    assert (tmp_path / GEO_FILENAME).read_bytes() == BODY
    assert (tmp_path / MARKER_FILENAME).read_text().strip() == "2026-09"
    assert lookup.loads == [str(tmp_path / GEO_FILENAME)]
    assert sorted(os.listdir(tmp_path)) == sorted([GEO_FILENAME, MARKER_FILENAME])


def test_updater_uses_a_client_with_no_redirects_and_a_60s_timeout():
    updater = GeoUpdater(FakeLookup(), "/nonexistent")
    assert updater._client.follow_redirects is False
    assert updater._client.timeout.read == 60.0


def test_start_runs_a_daemon_thread_that_stops_cleanly(tmp_path, monkeypatch):
    monkeypatch.setattr(geo, "INITIAL_DELAY", 0.01)
    updater = GeoUpdater(FakeLookup(), str(tmp_path))
    seen: list[datetime] = []

    def fake_run_once(now):
        seen.append(now)
        updater.stop()
        return False

    updater.run_once = fake_run_once
    updater.start()
    updater.start()  # idempotent
    updater._thread.join(timeout=5)
    assert not updater._thread.is_alive()
    assert updater._thread.daemon is True
    assert updater._thread.name == "geoip-updater"
    assert len(seen) == 1 and seen[0].tzinfo is UTC


# ---- optional smoke test against a real DB-IP file ------------------------------

@pytest.mark.skipif(not os.environ.get("GEOIP_TEST_DB"),
                    reason="set GEOIP_TEST_DB=/path/to/dbip-country-lite.mmdb to run")
def test_real_file_smoke():
    path = os.environ["GEOIP_TEST_DB"]
    assert CountryLookup.validate(path) is True
    lookup = CountryLookup()
    assert lookup.load(path) is True
    assert lookup.country("8.8.8.8") == "US"
    assert lookup.country("1.1.1.1") == "AU"
    assert lookup.country("2a00:1450:4001:80b::200e") == "DE"
    for ip in ("10.0.0.1", "192.168.1.1", "127.0.0.1", "0.0.0.0", "100.64.0.1", "::1",
               "not-an-ip", "unknown"):
        assert lookup.country(ip) is None, ip
