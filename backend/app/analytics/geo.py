"""Offline country lookup (DB-IP Lite) and its monthly updater.

Privacy: an IP is looked up in memory and dropped. Nothing in this module
stores, caches or logs an address. maxminddb's ValueError text quotes the raw
address ("'not-an-ip' does not appear to be an IPv4 or IPv6 address."), so
every lookup failure is swallowed silently, never logged.
"""
import gzip
import logging
import os
import re
import tempfile
import threading
from collections.abc import Mapping
from datetime import UTC, datetime
from time import monotonic

import httpx
import maxminddb

from .config import AnalyticsConfig

logger = logging.getLogger("savevidai.analytics")

GEO_FILENAME = "dbip-country-lite.mmdb"
MARKER_FILENAME = "dbip-country-lite.month"
DOWNLOAD_URL = "https://download.db-ip.com/free/dbip-country-lite-{month}.mmdb.gz"
MAX_COMPRESSED = 32 * 1024 * 1024
MAX_UNPACKED = 256 * 1024 * 1024
# The 60 s timeout covers each read; this covers one whole download, so a
# server that drips a byte at a time cannot hold the thread forever.
DOWNLOAD_DEADLINE = 10 * 60.0
INITIAL_DELAY = 10.0
CYCLE = 24 * 60 * 60.0
# identity asks for the .gz as stored. A server that still sends a
# Content-Encoding is decoded by httpx, which _unpack() allows for.
DOWNLOAD_HEADERS = {"User-Agent": "SaveVidAI-GeoUpdater/1.0", "Accept-Encoding": "identity"}

# Used with fullmatch(): "^[A-Z]{2}$" with match() would also accept "US\n".
_CODE = re.compile(r"[A-Z]{2}")
_PLACEHOLDERS = frozenset({"ZZ", "XX"})
_CHUNK = 64 * 1024
_GZIP_MAGIC = b"\x1f\x8b"


class CountryLookup:
    """Holds an open maxminddb reader (or None) and answers country(ip)."""

    def __init__(self, reader=None) -> None:
        self._reader = reader

    @property
    def loaded(self) -> bool:
        return self._reader is not None

    def country(self, ip: str) -> str | None:
        """ISO 3166-1 alpha-2 code or None. Never raises and never logs: the
        catch covers a missing reader, an invalid address (ValueError, whose
        text quotes it), no record, a missing key, and a reader closed by a
        concurrent load()."""
        reader = self._reader
        if reader is None:
            return None
        try:
            code = reader.get(ip)["country"]["iso_code"]
        except Exception:
            return None
        if not isinstance(code, str) or not _CODE.fullmatch(code) or code in _PLACEHOLDERS:
            return None
        return code

    @staticmethod
    def validate(path: str) -> bool:
        """True when the file opens, says it is a Country database and resolves
        8.8.8.8 to a two-letter code. Closes the file afterwards."""
        try:
            reader = maxminddb.open_database(path)
        except Exception:
            return False
        try:
            if "Country" not in reader.metadata().database_type:
                return False
            code = reader.get("8.8.8.8")["country"]["iso_code"]
            return isinstance(code, str) and bool(_CODE.fullmatch(code))
        except Exception:
            return False
        finally:
            reader.close()

    def load(self, path: str) -> bool:
        """Open `path`, swap it in with one attribute assignment, then close the
        previous reader. A lookup racing the close raises inside country(),
        which returns None for that one event. On failure the old reader stays."""
        try:
            reader = maxminddb.open_database(path)
        except Exception as exc:
            logger.warning("geoip: could not open %s: %r", path, exc)
            return False
        try:
            is_country = "Country" in reader.metadata().database_type
        except Exception:
            is_country = False
        if not is_country:
            reader.close()
            logger.warning("geoip: %s is not a country database, keeping the current one", path)
            return False
        previous, self._reader = self._reader, reader
        if previous is not None:
            previous.close()
        return True


def resolve_geo_dir(env: Mapping[str, str], cfg: AnalyticsConfig) -> str | None:
    """GEOIP_DIR when set; else dirname(ANALYTICS_DB_PATH)/geoip when the SQLite
    backend is in use AND that path is absolute; else None (a bare filename or
    :memory: would otherwise resolve to the working directory)."""
    explicit = (env.get("GEOIP_DIR") or "").strip()
    if explicit:
        return explicit
    sqlite_in_use = bool(cfg.db_path) and not (cfg.turso_url and cfg.turso_token)
    if sqlite_in_use and os.path.isabs(cfg.db_path):
        return os.path.join(os.path.dirname(cfg.db_path), "geoip")
    return None


def _previous_month(month: str) -> str:
    year, mon = (int(part) for part in month.split("-"))
    if mon == 1:
        return f"{year - 1}-12"
    return f"{year}-{mon - 1:02d}"


def _gunzip(src: str, dest: str) -> None:
    total = 0
    with gzip.open(src, "rb") as packed, open(dest, "wb") as out:
        while True:
            chunk = packed.read(_CHUNK)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_UNPACKED:
                raise ValueError(f"unpacked database over {MAX_UNPACKED} bytes")
            out.write(chunk)


def _unpack(src: str, dest: str) -> None:
    """Gunzip `src` into `dest`. A body without the gzip magic bytes is the
    database itself (the client decoded a Content-Encoding on the way in), so
    it moves to `dest` as is. The unpacked cap holds on both paths, and
    validate() still decides whether the result is a database."""
    with open(src, "rb") as fh:
        gzipped = fh.read(len(_GZIP_MAGIC)) == _GZIP_MAGIC
    if gzipped:
        _gunzip(src, dest)
        return
    if os.path.getsize(src) > MAX_UNPACKED:
        raise ValueError(f"unpacked database over {MAX_UNPACKED} bytes")
    os.replace(src, dest)


def _unlink(path: str) -> None:
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass


class GeoUpdater:
    """Daemon thread that keeps the DB-IP file current: runs INITIAL_DELAY
    seconds after start(), then every CYCLE seconds. Nothing here can raise
    into request handling or block startup."""

    def __init__(self, lookup, directory: str, *, client: httpx.Client | None = None) -> None:
        self._lookup = lookup
        self._dir = directory
        self._client = client or httpx.Client(timeout=60.0, follow_redirects=False)
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread is None:
            self._thread = threading.Thread(target=self._loop, name="geoip-updater", daemon=True)
            self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _loop(self) -> None:
        delay = INITIAL_DELAY
        while not self._stop.wait(delay):
            self.run_once(datetime.now(UTC))
            delay = CYCLE

    def run_once(self, now: datetime) -> bool:
        """One update cycle. Returns True only when a new file was installed.
        Failures log one warning line (no traceback) and wait for the next
        cycle."""
        try:
            return self._update(now.astimezone(UTC).strftime("%Y-%m"))
        except Exception as exc:
            logger.warning("geoip update failed: %r", exc)
            return False

    def _marker(self) -> str | None:
        try:
            with open(os.path.join(self._dir, MARKER_FILENAME), encoding="utf-8") as fh:
                return fh.read().strip() or None
        except OSError:
            return None

    def _in_use(self) -> bool:
        """The file on disk is loaded, or loads now. A marker alone is not
        enough to skip a download: it outlives a failed load at init."""
        if self._lookup.loaded:
            return True
        final = os.path.join(self._dir, GEO_FILENAME)
        if not os.path.isfile(final) or not self._lookup.load(final):
            return False
        logger.info("geoip: loaded the file already on disk")
        return True

    def _update(self, wanted: str) -> bool:
        have = self._marker()
        if have == wanted and self._in_use():
            return False
        os.makedirs(self._dir, exist_ok=True)
        status = self._install(wanted)
        if status == "installed":
            return True
        if status != "missing":
            return False
        # The month's file is not published yet: fall back to the previous
        # month, unless that is what we already have in use.
        fallback = _previous_month(wanted)
        if have == fallback and self._in_use():
            return False
        return self._install(fallback) == "installed"

    def _install(self, month: str) -> str:
        """Download, unpack, validate, replace, mark, load. Returns "installed",
        "missing" (HTTP 404) or "failed". Every path removes its temp files,
        including a failure between the two mkstemp calls."""
        packed = unpacked = ""
        try:
            fd, packed = tempfile.mkstemp(dir=self._dir, prefix=".dbip-", suffix=".gz.part")
            os.close(fd)
            fd, unpacked = tempfile.mkstemp(dir=self._dir, prefix=".dbip-", suffix=".mmdb.part")
            os.close(fd)
            status = self._fetch(DOWNLOAD_URL.format(month=month), packed)
            if status == 404:
                logger.warning("geoip: %s is not published yet", month)
                return "missing"
            if status != 200:
                logger.warning("geoip: download of %s returned HTTP %d", month, status)
                return "failed"
            _unpack(packed, unpacked)
            if not self._lookup.validate(unpacked):
                logger.warning("geoip: downloaded %s failed validation", month)
                return "failed"
            final = os.path.join(self._dir, GEO_FILENAME)
            os.replace(unpacked, final)
            with open(os.path.join(self._dir, MARKER_FILENAME), "w", encoding="utf-8") as fh:
                fh.write(month + "\n")
            self._lookup.load(final)
            logger.info("geoip: installed %s", month)
            return "installed"
        finally:
            for path in (packed, unpacked):
                if path:
                    _unlink(path)

    def _fetch(self, url: str, dest: str) -> int:
        """Stream the body to `dest` with a cap on the downloaded bytes and a
        deadline on the whole download. Returns the HTTP status; the file is
        only meaningful on 200."""
        deadline = monotonic() + DOWNLOAD_DEADLINE
        with self._client.stream("GET", url, headers=DOWNLOAD_HEADERS) as resp:
            if resp.status_code != 200:
                return resp.status_code
            total = 0
            with open(dest, "wb") as fh:
                for chunk in resp.iter_bytes():
                    if monotonic() > deadline:
                        raise TimeoutError(f"download took over {DOWNLOAD_DEADLINE:.0f} s")
                    total += len(chunk)
                    if total > MAX_COMPRESSED:
                        raise ValueError(f"compressed download over {MAX_COMPRESSED} bytes")
                    fh.write(chunk)
            return 200
