import os
from dataclasses import dataclass

from fastapi import HTTPException
from fastapi.responses import HTMLResponse

from .envutil import env_truthy

MARKER = "<!--ADS-->"


@dataclass(frozen=True)
class AdConfig:
    enabled: bool
    banner: str
    popunder: str

    @property
    def active(self) -> bool:
        return self.enabled and bool(self.banner or self.popunder)


def load_ad_config() -> AdConfig:
    """Read once per create_app(); a config change requires a restart, which
    matches how the rest of app.env is applied on the VPS."""
    return AdConfig(
        enabled=env_truthy("ADS_ENABLED"),
        banner=os.environ.get("AD_BANNER_SNIPPET", "").strip(),
        popunder=os.environ.get("AD_POPUNDER_SNIPPET", "").strip(),
    )


class PageRenderer:
    """Serves public HTML shells, replacing the <!--ADS--> marker line.

    Ads active: the marker line becomes the banner slot and/or popunder
    snippet. Ads off (or enabled with no snippets): the ENTIRE marker line is
    removed, so visitors never see the comment and the output is identical to
    the pre-ads page. Files without a marker pass through unchanged.

    Rendered output is cached per (absolute path, st_mtime_ns). The ad config
    is fixed for the renderer's lifetime, so the cache never mixes states; a
    redeploy changes mtimes and refreshes naturally. Trade-off (accepted in
    the spec): unlike FileResponse there are no ETag/Last-Modified 304s, which
    is negligible for three small no-cache HTML pages.
    """

    def __init__(self, ads: AdConfig):
        self._ads = ads
        self._cache: dict[str, tuple[int, bytes]] = {}

    def _inject(self, html: str) -> str:
        out: list[str] = []
        replaced = False
        for line in html.splitlines(keepends=True):
            if not replaced and line.strip() == MARKER:
                replaced = True
                if self._ads.active:
                    if self._ads.banner:
                        out.append(f'<div class="ad-slot">{self._ads.banner}</div>\n')
                    if self._ads.popunder:
                        out.append(self._ads.popunder + "\n")
                continue
            out.append(line)
        return "".join(out)

    def render(self, filename: str) -> HTMLResponse:
        static_dir = os.environ.get("STATIC_DIR", "")
        path = os.path.join(static_dir, filename)
        if not static_dir or not os.path.isfile(path):
            raise HTTPException(status_code=404)
        key = os.path.abspath(path)
        mtime = os.stat(path).st_mtime_ns
        cached = self._cache.get(key)
        if cached is not None and cached[0] == mtime:
            return HTMLResponse(cached[1])
        with open(path, encoding="utf-8") as f:
            body = self._inject(f.read()).encode("utf-8")
        self._cache[key] = (mtime, body)
        return HTMLResponse(body)
