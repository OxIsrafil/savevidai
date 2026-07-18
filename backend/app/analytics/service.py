import logging

from fastapi import Request

from ..client_ip import client_ip
from .config import AnalyticsConfig
from .hashing import today_utc, visitor_hash
from .recorder import Recorder
from .store import Store

logger = logging.getLogger("savevidai.analytics")


class AnalyticsService:
    def __init__(self) -> None:
        self.enabled = False
        self._cfg: AnalyticsConfig | None = None
        self._recorder: Recorder | None = None

    def init(self, cfg: AnalyticsConfig, store: Store, recorder: Recorder) -> None:
        store.init_schema()
        recorder.start()
        self._cfg = cfg
        self._recorder = recorder
        self.enabled = True

    def _visitor(self, request: Request) -> str:
        return visitor_hash(self._cfg.salt, client_ip(request), today_utc())

    def record_from_request(self, request: Request, type: str, outcome: str | None) -> None:
        if not self.enabled:
            return
        # Fire-and-forget: recording is called inline on request-handling paths
        # (resolve.py records every fetch outcome), so any unexpected failure
        # here must never propagate into the user-facing response.
        try:
            country = request.headers.get("cf-ipcountry") or None
            if country in ("XX", "T1"):  # Cloudflare's unknown/Tor placeholders
                country = None
            self._recorder.record(type, visitor=self._visitor(request), outcome=outcome, country=country)
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
