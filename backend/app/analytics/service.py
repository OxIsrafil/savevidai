import logging
import os
from collections.abc import Mapping

from fastapi import Request

from ..client_ip import client_country, client_ip
from ..envutil import is_truthy
from .config import AnalyticsConfig
from .geo import GEO_FILENAME, CountryLookup, GeoUpdater, resolve_geo_dir
from .hashing import today_utc, visitor_hash
from .recorder import Recorder
from .store import Store

logger = logging.getLogger("savevidai.analytics")


class AnalyticsService:
    def __init__(self) -> None:
        self.enabled = False
        self._cfg: AnalyticsConfig | None = None
        self._recorder: Recorder | None = None
        self._lookup = CountryLookup()
        self._updater: GeoUpdater | None = None

    def init(self, cfg: AnalyticsConfig, store: Store, recorder: Recorder,
             env: Mapping[str, str] | None = None) -> None:
        store.init_schema()
        recorder.start()
        self._cfg = cfg
        self._recorder = recorder
        self.enabled = True
        self._start_geo(cfg, os.environ if env is None else env)

    def _start_geo(self, cfg: AnalyticsConfig, env: Mapping[str, str]) -> None:
        # Country lookup is optional: a directory that does not resolve, a
        # missing file or an updater problem only costs the country column.
        # Nothing here may raise into init(), which main.create_app guards.
        try:
            directory = resolve_geo_dir(env, cfg)
            if directory is None:
                return
            path = os.path.join(directory, GEO_FILENAME)
            if os.path.isfile(path):
                self._lookup.load(path)
            if is_truthy(env.get("GEOIP_UPDATE")):
                self._updater = GeoUpdater(self._lookup, directory)
                self._updater.start()
        except Exception as exc:
            logger.warning("country lookup setup failed: %r", exc)

    def record_from_request(self, request: Request, type: str, outcome: str | None,
                            platform: str | None = None, source: str | None = None,
                            visitor_kind: str | None = None,
                            locale: str | None = None) -> None:
        if not self.enabled:
            return
        # Fire-and-forget: recording is called inline on request-handling paths
        # (resolve.py records every fetch outcome), so any unexpected failure
        # here must never propagate into the user-facing response.
        try:
            # The IP lives in this frame only: hashed for the daily visitor id,
            # looked up for the country, then dropped. It is never stored,
            # logged or handed to the recorder. A CF-IPCountry header wins only
            # when TRUST_CLOUDFLARE_HEADERS is on (see client_ip.client_country);
            # otherwise the offline lookup decides.
            ip = client_ip(request)
            visitor = visitor_hash(self._cfg.salt, ip, today_utc())
            country = client_country(request) or self._lookup.country(ip)
            self._recorder.record(type, visitor=visitor, outcome=outcome, country=country,
                                  platform=platform, source=source, visitor_kind=visitor_kind,
                                  locale=locale)
        except Exception:
            logger.warning("analytics record_from_request failed", exc_info=True)

    def record_fetch(self, request: Request, outcome: str | None) -> None:
        self.record_from_request(request, "fetch", outcome)

    def config(self) -> AnalyticsConfig | None:
        return self._cfg

    def recorder(self) -> Recorder | None:
        return self._recorder


service = AnalyticsService()


def get_service() -> AnalyticsService:
    return service
