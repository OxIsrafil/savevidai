"""Resolve Reddit posts to downloadable media via a hybrid, two-tier design.

Tier 1 (this module, always on): an anonymous fetch of vxreddit.com. vxreddit
serves Discord-style Open Graph meta tags to bot user agents, so a single GET
with a Discordbot UA yields the post's title, author, subreddit, media type and,
for v.redd.it videos, the bare video id encoded inside the og:video URL. No
Reddit credentials are involved, nothing is rate-limited against a Reddit app,
and the only trust placed in the upstream is the og:video URL, which we treat as
attacker-controlled: the video id is accepted only after the embedded video_url
decodes to a genuine v.redd.it host and a strict id charset.

Tier 2 (added later, env-gated): when Reddit OAuth credentials are configured,
a direct OAuth call to Reddit's own API can upgrade or replace the anonymous
result (higher-fidelity metadata, gallery/crosspost handling). That path is
intentionally optional and absent here; galleries currently surface as
errors.UNSUPPORTED_POST until the OAuth half lands. Keeping the anonymous path
standalone means the downloader keeps working with zero configuration.

Stdlib only for parsing (regex over meta tags plus html.unescape); no new deps.
"""
import html
import logging
import os
import re
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse
from xml.etree import ElementTree as ET

import httpx

from .errors import NO_VIDEO, NOT_FOUND, UNSUPPORTED_POST, UPSTREAM, AppError, app_error
from .schemas import MediaItem, ResolveResponse, Variant

logger = logging.getLogger("savevidai.reddit")

# Byte hosts the /api/proxy allowlist must accept for Reddit media. Reddit serves
# both video segments (v.redd.it) and still images (i.redd.it) from *.redd.it, so
# a single registrable suffix covers both (the proxy suffix-matches host ==
# "redd.it" or host.endswith(".redd.it")).
# NOTE: this tuple feeds the /api/proxy SSRF allowlist (Task 7), so widening it
# widens what the proxy will fetch on the server's behalf - change with care.
REDDIT_MEDIA_HOSTS = ("redd.it",)

_VX_BASE = "https://www.vxreddit.com"
# vxreddit serves og tags to Discord's link unfurler; a browser-like UA gets a
# bare meta-refresh instead. This exact string is the contract with the upstream.
_VX_UA = "Discordbot/2.0 (SaveVidAI; +https://savevidai.israfill.dev)"

# Match each <meta ...> tag, then pull its attributes generically so property/
# content order does not matter and single or double quotes both parse.
_META_RE = re.compile(r"<meta\b[^>]*>", re.IGNORECASE)
_ATTR_RE = re.compile(r'([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|\'([^\']*)\')')

# og:site_name looks like "u/<author> on r/<sub> - <emoji stats>"; we take only
# the leading handle and subreddit and tolerate the pattern being absent.
_SITE_RE = re.compile(r"^u/([A-Za-z0-9_-]+)\s+on\s+r/([A-Za-z0-9_]+)")

# A v.redd.it video id: the first path segment of the decoded video_url.
_VREDD_ID_RE = re.compile(r"[A-Za-z0-9]{8,20}")

# v.redd.it serves the DASH manifest anonymously; this UA is the contract with
# that host and is deliberately distinct from the vxreddit Discordbot UA.
_MANIFEST_UA = "SaveVidAI/1.0 (+https://savevidai.israfill.dev)"
_MANIFEST_URL = "https://v.redd.it/{vid}/DASHPlaylist.mpd"

# A DASH BaseURL becomes a URL path segment when we fetch the media bytes, so it
# is validated to a bare filename charset. Anything with a slash, an empty value,
# or other punctuation is treated as a corrupt/hostile manifest. Dot characters
# are inside the charset (real filenames carry a ".mp4" extension), so a separate
# guard rejects dots-only values like "." or ".." that the charset alone admits
# but would resolve to a traversal/current-directory path segment.
_BASEURL_RE = re.compile(r"[A-Za-z0-9_.]+")


def _valid_base_url(base: str) -> bool:
    """True when ``base`` is a safe bare filename for a URL path segment.

    Requires the full string to match the filename charset AND not be composed
    entirely of dot characters ("." / ".." / "..."), which would otherwise pass
    the charset yet resolve to a path-traversal or current-directory segment.
    """
    return bool(_BASEURL_RE.fullmatch(base)) and base.strip(".") != ""


def _parse_og(html_text: str) -> dict[str, str]:
    """Map og-style ``property`` -> ``content`` for every meta tag that has both.

    First occurrence wins, attribute order is irrelevant, and html entities in
    the content are unescaped. Tags carrying only ``name`` (twitter:*, theme
    colours) are ignored: only ``property`` meta tags are recorded.
    """
    result: dict[str, str] = {}
    for tag in _META_RE.findall(html_text):
        attrs: dict[str, str] = {}
        for key, dq, sq in _ATTR_RE.findall(tag):
            attrs[key.lower()] = dq if dq else sq
        prop = attrs.get("property")
        content = attrs.get("content")
        if prop and content is not None and prop not in result:
            result[prop] = html.unescape(content)
    return result


def _parse_site_name(site: str) -> tuple[str | None, str | None]:
    match = _SITE_RE.match(site or "")
    if not match:
        return (None, None)
    return (match.group(1), match.group(2))


def _vredd_id(og_video: str | None) -> str | None:
    """Recover a v.redd.it video id from an og:video URL, or None.

    The og:video URL is upstream-controlled, so its embedded ``video_url`` is
    validated hard: it must decode to a ``v.redd.it`` host and its first path
    segment must be a bare id of the expected charset/length. Anything else
    (missing param, foreign host, junk segment) yields None rather than a value
    that would later be pasted into a byte-fetch URL.
    """
    if not og_video:
        return None
    params = parse_qs(urlparse(og_video).query)
    values = params.get("video_url")
    if not values:
        return None
    inner = urlparse(values[0])  # parse_qs has already percent-decoded this
    if (inner.hostname or "").lower() != "v.redd.it":
        return None
    segments = [p for p in inner.path.split("/") if p]
    if not segments or not _VREDD_ID_RE.fullmatch(segments[0]):
        return None
    return segments[0]


def _build(og: dict[str, str]) -> dict:
    author, subreddit = _parse_site_name(og.get("og:site_name", ""))
    return {
        "title": og.get("og:title", ""),
        "author": author,
        "subreddit": subreddit,
        "og_type": og.get("og:type"),
        "vredd_id": _vredd_id(og.get("og:video")),
        "image_url": og.get("og:image"),
    }


def fetch_vx(path: str) -> dict:
    """GET ``vxreddit.com{path}`` as a bot and return its parsed og tags.

    Any transport failure, non-200 status, or a body carrying no og tags maps to
    a clean upstream_error. A body with no og tags is the plain-UA signature (a
    bare meta-refresh to reddit.com), which most likely means the Discordbot UA
    has stopped being honoured; that case is logged loudly.
    """
    url = f"{_VX_BASE}{path}"
    try:
        resp = httpx.get(url, headers={"User-Agent": _VX_UA},
                         timeout=12.0, follow_redirects=False)
    except httpx.HTTPError as exc:
        logger.warning("vxreddit fetch failed for %s: %r", path, exc)
        raise app_error(UPSTREAM) from exc
    if resp.status_code != 200:
        logger.warning("vxreddit non-200 (%s) for %s", resp.status_code, path)
        raise app_error(UPSTREAM)
    og = _parse_og(resp.text)
    if not any(key.startswith("og:") for key in og):
        logger.warning(
            "vxreddit returned no og tags for %s; the bot UA %r may no longer be "
            "honoured (got a plain meta-refresh body)", path, _VX_UA)
        raise app_error(UPSTREAM)
    return _build(og)


@dataclass(frozen=True)
class Rendition:
    """One selectable video quality from a DASH manifest.

    ``base_url`` is the manifest's child ``<BaseURL>`` for the Representation
    (a bare filename such as ``DASH_720`` or ``DASH_1080.mp4``), already
    validated to the safe charset. ``width`` is optional: newer manifests omit
    it on the video Representations.
    """

    height: int
    width: int | None
    base_url: str


@dataclass(frozen=True)
class Manifest:
    """Parsed v.redd.it DASH manifest: video renditions plus the audio track.

    ``videos`` is sorted by height descending (best first). ``audio_base`` is
    the audio Representation's BaseURL, or None when the manifest carries no
    audio (silent clips have a video-only manifest).
    """

    videos: list[Rendition]
    audio_base: str | None


def _local(tag: str) -> str:
    """Strip an ElementTree ``{namespace}`` prefix, leaving the local name.

    ``Element.iter``/``find`` match tags literally rather than via ElementPath,
    so the ``{*}`` wildcard is unavailable there; comparing local names keeps
    the parser namespace-agnostic against the MPD default namespace.
    """
    return tag.rsplit("}", 1)[-1]


def _child_base_url(rep: ET.Element) -> str | None:
    """Return a Representation's stripped child ``<BaseURL>`` text, or None.

    None means the ``<BaseURL>`` element is *absent* (caller skips the rep). A
    present element with empty/whitespace text returns ``""``, which is a
    distinct, malformed shape: it fails the BaseURL charset check and so is
    rejected rather than skipped.
    """
    for child in rep:
        if _local(child.tag) == "BaseURL":
            return (child.text or "").strip()
    return None


def _parse_manifest(xml_text: str) -> Manifest:
    """Parse a DASHPlaylist.mpd body into a Manifest.

    Representations are classified by ``mimeType`` prefix (``video/`` vs
    ``audio/``). A video Representation missing its height or BaseURL is skipped
    (not fatal); a present-but-malformed BaseURL is fatal. No usable video
    Representation at all is a genuine NO_VIDEO; any parse failure or malformed
    manifest shape is UPSTREAM.
    """
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        logger.warning("v.redd.it manifest is not valid XML: %r", exc)
        raise app_error(UPSTREAM) from exc

    videos: list[Rendition] = []
    audio_base: str | None = None

    for rep in root.iter():
        if _local(rep.tag) != "Representation":
            continue
        mime = rep.get("mimeType", "")
        base = _child_base_url(rep)
        if mime.startswith("video/"):
            height = rep.get("height")
            if height is None or not height.isdigit() or base is None:
                # Incomplete/odd video rep: skip it rather than crashing.
                continue
            if not _valid_base_url(base):
                logger.warning("v.redd.it video BaseURL rejected: %r", base)
                raise app_error(UPSTREAM)
            width = rep.get("width")
            videos.append(Rendition(
                height=int(height),
                width=int(width) if width is not None and width.isdigit() else None,
                base_url=base,
            ))
        elif mime.startswith("audio/"):
            if base is None:
                continue
            if not _valid_base_url(base):
                logger.warning("v.redd.it audio BaseURL rejected: %r", base)
                raise app_error(UPSTREAM)
            if audio_base is None:
                audio_base = base

    if not videos:
        raise app_error(NO_VIDEO)

    videos.sort(key=lambda r: r.height, reverse=True)
    return Manifest(videos=videos, audio_base=audio_base)


def fetch_manifest(vid: str) -> Manifest:
    """Fetch and parse the DASH manifest for a v.redd.it video id.

    ``vid`` is re-validated against the id charset on entry (defense in depth:
    callers already validate, but this method builds a URL from it). A transport
    failure, non-200, redirect, or non-XML body all map to UPSTREAM; a manifest
    with no video Representation maps to NO_VIDEO.
    """
    if not _VREDD_ID_RE.fullmatch(vid):
        # An id reaching this far outside the charset is an internal-invariant
        # violation, not a user-facing "no video"; surface it as UPSTREAM.
        logger.warning("fetch_manifest called with invalid vid %r", vid)
        raise app_error(UPSTREAM)
    url = _MANIFEST_URL.format(vid=vid)
    try:
        resp = httpx.get(url, headers={"User-Agent": _MANIFEST_UA},
                         timeout=12.0, follow_redirects=False)
    except httpx.HTTPError as exc:
        logger.warning("v.redd.it manifest fetch failed for %s: %r", vid, exc)
        raise app_error(UPSTREAM) from exc
    if resp.status_code != 200:
        logger.warning("v.redd.it manifest non-200 (%s) for %s", resp.status_code, vid)
        raise app_error(UPSTREAM)
    return _parse_manifest(resp.text)


def _is_reddit_image_host(url: str) -> bool:
    """True when ``url``'s host is i.redd.it or any ``.redd.it`` subdomain.

    The og:image is upstream-controlled, so a foreign host must never be mapped
    (it would be handed to /api/proxy later). The suffix check requires a literal
    ``.redd.it`` tail so lookalikes like ``evilredd.it`` are rejected; a bare
    ``redd.it`` host is not an image host and also falls through.
    """
    host = (urlparse(url).hostname or "").lower()
    return host == "i.redd.it" or host.endswith(".redd.it")


def map_reddit_vx(post_id: str, vx: dict, manifest: Manifest | None) -> ResolveResponse:
    """Map an anonymous vxreddit result (+manifest) to a ResolveResponse. Pure.

    A ``vredd_id`` with a manifest is a video: one item, one Variant per rendition
    (best first). When the manifest carries audio, variants point at /api/mux so
    the server can remux the split video+audio tracks; a silent clip has no audio
    track and its variants point straight at the direct v.redd.it byte URL. With
    no video but an og:image on a genuine redd.it host, it is a single image item.
    Anything else (gallery/text, or an image on a foreign host we refuse to trust)
    is an unsupported_post. og:image is never used as a video thumbnail: vxreddit's
    value is a low-fidelity preview, so thumbnail is left None.
    """
    handle = vx.get("author") or "unknown"
    common = {
        "id": post_id,
        "author": f"u/{handle}",
        "handle": handle,
        "avatar_url": None,
        "text": vx.get("title") or "",
    }
    vredd_id = vx.get("vredd_id")
    if vredd_id and manifest is not None:
        variants = [
            Variant(
                label=f"{r.height}p",
                width=r.width,
                height=r.height,
                url=(f"/api/mux/{vredd_id}/{r.height}.mp4" if manifest.audio_base
                     else f"https://v.redd.it/{vredd_id}/{r.base_url}"),
            )
            for r in manifest.videos
        ]
        item = MediaItem(index=1, kind="video", thumbnail=None,
                         duration_seconds=None, variants=variants)
        return ResolveResponse(items=[item], **common)

    image_url = vx.get("image_url")
    if not vredd_id and image_url and _is_reddit_image_host(image_url):
        item = MediaItem(index=1, kind="image", thumbnail=None, duration_seconds=None,
                         variants=[Variant(label="photo", url=image_url)])
        return ResolveResponse(items=[item], **common)

    raise app_error(UNSUPPORTED_POST)


def _map_guarded(post_id: str, vx: dict, manifest: Manifest | None) -> ResolveResponse:
    """Run the mapper over an untrusted upstream shape; anything we didn't
    anticipate becomes a clean upstream_error instead of an unhandled 500
    (mirrors the tiktok/extractor guard)."""
    try:
        return map_reddit_vx(post_id, vx, manifest)
    except AppError:
        raise
    except Exception as exc:
        logger.warning("reddit mapping failed for %s: %r", post_id, exc)
        raise app_error(UPSTREAM) from exc


def is_configured() -> bool:
    """True when both Reddit OAuth credentials are set (enables the Task 5 path)."""
    return bool(os.environ.get("REDDIT_CLIENT_ID") and os.environ.get("REDDIT_CLIENT_SECRET"))


def _extract_oauth(parsed: tuple) -> ResolveResponse:
    # TODO(Task 5): OAuth path - replace this stub with a direct Reddit API call
    # that upgrades/replaces the anonymous result (galleries, crossposts, etc.).
    raise app_error(UPSTREAM)


def extract_reddit(parsed: tuple) -> ResolveResponse:
    """Resolve a parsed reddit link to media. Hybrid: OAuth when configured, else
    the anonymous vxreddit path.

    ``parsed`` is ``("post", id, path)`` or ``("share", url, path)`` from
    ``parse_reddit_url``. On the anonymous path a known post is fetched via its
    slugless comments path; a ``vredd_id`` triggers a manifest fetch for the video
    renditions, otherwise the image/unsupported branches run with no manifest.
    Share links can't be followed anonymously (fetch is redirect-averse), so a
    failed/no-og share fetch surfaces as not_found rather than a raw upstream.
    """
    kind, ident, path = parsed
    if is_configured():
        return _extract_oauth(parsed)

    if kind == "share":
        try:
            vx = fetch_vx(path)
        except AppError as exc:
            logger.info("anonymous share resolution failed for %s: %r", path, exc)
            raise app_error(NOT_FOUND) from exc
        # No real post id is available for a share link; use the validated token.
        share_id = path.rstrip("/").rsplit("/", 1)[-1]
        manifest = fetch_manifest(vx["vredd_id"]) if vx["vredd_id"] else None
        return _map_guarded(share_id, vx, manifest)

    vx = fetch_vx(path)
    manifest = fetch_manifest(vx["vredd_id"]) if vx["vredd_id"] else None
    return _map_guarded(ident, vx, manifest)
