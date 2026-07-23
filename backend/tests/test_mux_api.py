import asyncio
import glob
import os
import shutil
import subprocess
import tempfile

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

import app.mux as mux_module
from app.main import create_app

VID = "enxxsuo5xko31"
MANIFEST_URL = f"https://v.redd.it/{VID}/DASHPlaylist.mpd"

# Old-style manifest: extensionless video BaseURLs (DASH_720 ..) + audio "audio".
OLD_MPD = """<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static">
    <Period>
        <AdaptationSet>
            <Representation height="720" id="V-1" mimeType="video/mp4" width="404">
                <BaseURL>DASH_720</BaseURL>
            </Representation>
            <Representation height="480" id="V-2" mimeType="video/mp4" width="270">
                <BaseURL>DASH_480</BaseURL>
            </Representation>
        </AdaptationSet>
        <AdaptationSet>
            <Representation id="A-1" mimeType="audio/mp4">
                <BaseURL>audio</BaseURL>
            </Representation>
        </AdaptationSet>
    </Period>
</MPD>"""

# New-style manifest: .mp4 video BaseURLs + DASH_AUDIO_128.mp4 audio.
NEW_MPD = """<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static">
    <Period>
        <AdaptationSet>
            <Representation height="720" id="V-1" mimeType="video/mp4">
                <BaseURL>DASH_720.mp4</BaseURL>
            </Representation>
        </AdaptationSet>
        <AdaptationSet>
            <Representation id="A-1" mimeType="audio/mp4">
                <BaseURL>DASH_AUDIO_128.mp4</BaseURL>
            </Representation>
        </AdaptationSet>
    </Period>
</MPD>"""

# Audio-less manifest: single video Representation, no audio track.
VIDEO_ONLY_MPD = """<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static">
    <Period>
        <AdaptationSet>
            <Representation height="720" id="V-1" mimeType="video/mp4" width="1280">
                <BaseURL>DASH_720.mp4</BaseURL>
            </Representation>
        </AdaptationSet>
    </Period>
</MPD>"""

MARKER = b"MARKER_MUXED_MP4"


def client() -> TestClient:
    return TestClient(create_app(), raise_server_exceptions=False)


class _FakeProc:
    """Stand-in for an asyncio subprocess: optionally writes a marker out.mp4."""

    def __init__(self, out_path: str, returncode: int, write: bool):
        self._out = out_path
        self.returncode = returncode
        self._write = write

    async def communicate(self):
        if self._write:
            with open(self._out, "wb") as f:
                f.write(MARKER)
        return (b"", b"ffmpeg stderr")

    def kill(self):
        pass

    async def wait(self):
        return self.returncode


def _fake_exec(returncode: int = 0, write: bool = True):
    async def factory(*args, **kwargs):
        # The out.mp4 path is the final positional argument of the ffmpeg command.
        return _FakeProc(args[-1], returncode, write)

    return factory


@pytest.fixture
def fake_ffmpeg(monkeypatch):
    """Pretend ffmpeg is on PATH and the subprocess succeeds writing the marker."""
    monkeypatch.setattr(mux_module.shutil, "which", lambda name: "/usr/bin/ffmpeg")
    monkeypatch.setattr(asyncio, "create_subprocess_exec", _fake_exec(0, True))


def _mock_streams(video_base: str, audio_base: str, *, vlen: int = 4, alen: int = 4):
    respx.get(f"https://v.redd.it/{VID}/{video_base}").mock(
        return_value=httpx.Response(200, content=b"v" * vlen,
                                    headers={"content-length": str(vlen)}))
    respx.get(f"https://v.redd.it/{VID}/{audio_base}").mock(
        return_value=httpx.Response(200, content=b"a" * alen,
                                    headers={"content-length": str(alen)}))


@respx.mock
def test_happy_path_old_style(fake_ffmpeg):
    respx.get(MANIFEST_URL).mock(return_value=httpx.Response(200, text=OLD_MPD))
    _mock_streams("DASH_720", "audio")
    res = client().get(f"/api/mux/{VID}/720.mp4")
    assert res.status_code == 200
    assert res.content == MARKER
    assert 'attachment; filename="video.mp4"' in res.headers["content-disposition"]
    assert res.headers["content-length"] == str(len(MARKER))


@respx.mock
def test_happy_path_new_style(fake_ffmpeg):
    respx.get(MANIFEST_URL).mock(return_value=httpx.Response(200, text=NEW_MPD))
    _mock_streams("DASH_720.mp4", "DASH_AUDIO_128.mp4")
    res = client().get(f"/api/mux/{VID}/720.mp4", params={"filename": "clip.mp4"})
    assert res.status_code == 200
    assert res.content == MARKER
    assert 'filename="clip.mp4"' in res.headers["content-disposition"]


@respx.mock
def test_nearest_below_height(fake_ffmpeg):
    # Manifest has 720 and 480; a request for 540 must pick 480.
    respx.get(MANIFEST_URL).mock(return_value=httpx.Response(200, text=OLD_MPD))
    route = respx.get(f"https://v.redd.it/{VID}/DASH_480").mock(
        return_value=httpx.Response(200, content=b"vvvv", headers={"content-length": "4"}))
    respx.get(f"https://v.redd.it/{VID}/audio").mock(
        return_value=httpx.Response(200, content=b"aaaa", headers={"content-length": "4"}))
    res = client().get(f"/api/mux/{VID}/540.mp4")
    assert res.status_code == 200
    assert route.called  # the 480 rendition was fetched, not 720


# Non-ladder manifest: portrait/odd source heights (270, 540) that never appear in
# the fixed rendition ladder. Reddit's DASH manifests carry these for non-16:9
# sources, and the mappers emit a quality button per manifest rendition.
ODD_MPD = """<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static">
    <Period>
        <AdaptationSet>
            <Representation height="540" id="V-1" mimeType="video/mp4" width="304">
                <BaseURL>DASH_540.mp4</BaseURL>
            </Representation>
            <Representation height="270" id="V-2" mimeType="video/mp4" width="152">
                <BaseURL>DASH_270.mp4</BaseURL>
            </Representation>
        </AdaptationSet>
        <AdaptationSet>
            <Representation id="A-1" mimeType="audio/mp4">
                <BaseURL>DASH_AUDIO_128.mp4</BaseURL>
            </Representation>
        </AdaptationSet>
    </Period>
</MPD>"""


def test_bad_vid_too_short():
    res = client().get("/api/mux/short/720.mp4")
    assert res.status_code == 422


@respx.mock
def test_non_ladder_height_in_manifest_ok(fake_ffmpeg):
    # Regression: a non-ladder height (270) that IS a real rendition in the manifest
    # must resolve, not 422 at the path gate. The mapper emits this button straight
    # from the manifest, so clicking it must reach a real download.
    respx.get(MANIFEST_URL).mock(return_value=httpx.Response(200, text=ODD_MPD))
    route = respx.get(f"https://v.redd.it/{VID}/DASH_270.mp4").mock(
        return_value=httpx.Response(200, content=b"vvvv", headers={"content-length": "4"}))
    respx.get(f"https://v.redd.it/{VID}/DASH_AUDIO_128.mp4").mock(
        return_value=httpx.Response(200, content=b"aaaa", headers={"content-length": "4"}))
    res = client().get(f"/api/mux/{VID}/270.mp4")
    assert res.status_code == 200
    assert route.called  # the exact 270 rendition was fetched


@respx.mock
def test_in_range_height_not_in_manifest_picks_nearest_below(fake_ffmpeg):
    # An in-range height (500) with no exact rendition still falls to nearest-below
    # (480) per _pick_rendition, rather than 422-ing at the path gate.
    respx.get(MANIFEST_URL).mock(return_value=httpx.Response(200, text=OLD_MPD))
    route = respx.get(f"https://v.redd.it/{VID}/DASH_480").mock(
        return_value=httpx.Response(200, content=b"vvvv", headers={"content-length": "4"}))
    respx.get(f"https://v.redd.it/{VID}/audio").mock(
        return_value=httpx.Response(200, content=b"aaaa", headers={"content-length": "4"}))
    res = client().get(f"/api/mux/{VID}/500.mp4")
    assert res.status_code == 200
    assert route.called  # nearest-below 480 fetched


def test_height_zero_out_of_range():
    res = client().get(f"/api/mux/{VID}/0.mp4")
    assert res.status_code == 422


def test_height_too_large_out_of_range():
    res = client().get(f"/api/mux/{VID}/5000.mp4")
    assert res.status_code == 422


def test_height_negative_out_of_range():
    res = client().get(f"/api/mux/{VID}/-10.mp4")
    assert res.status_code == 422


def test_height_non_integer_422():
    res = client().get(f"/api/mux/{VID}/abc.mp4")
    assert res.status_code == 422


@respx.mock
def test_no_audio_redirects_to_proxy(fake_ffmpeg):
    respx.get(MANIFEST_URL).mock(return_value=httpx.Response(200, text=VIDEO_ONLY_MPD))
    res = client().get(f"/api/mux/{VID}/720.mp4", follow_redirects=False)
    assert res.status_code == 307
    loc = res.headers["location"]
    assert loc.startswith(f"/api/proxy?url=https://v.redd.it/{VID}/DASH_720.mp4")
    assert "filename=" in loc


@respx.mock
def test_oversize_returns_413(fake_ffmpeg):
    respx.get(MANIFEST_URL).mock(return_value=httpx.Response(200, text=OLD_MPD))
    big = str(200 * 1024 * 1024)  # 200 MB each -> 400 MB combined, over the 300 cap
    respx.get(f"https://v.redd.it/{VID}/DASH_720").mock(
        return_value=httpx.Response(200, headers={"content-length": big}))
    respx.get(f"https://v.redd.it/{VID}/audio").mock(
        return_value=httpx.Response(200, headers={"content-length": big}))
    res = client().get(f"/api/mux/{VID}/720.mp4")
    assert res.status_code == 413


@respx.mock
def test_combined_streams_over_budget_returns_413(fake_ffmpeg, monkeypatch):
    # Regression: the size cap must be a SINGLE budget shared across the video and
    # audio writes, not reset per stream. Neither stream advertises a Content-Length,
    # so the header pre-check cannot fire; each stream alone stays under the cap, but
    # their COMBINED on-disk bytes exceed it. With a per-stream reset both would pass
    # and the merge would 200; a shared budget must abort with 413.
    monkeypatch.setattr(mux_module, "_MAX_BYTES", 100)
    root = tempfile.mkdtemp(prefix="muxroot-")
    real_mkdtemp = tempfile.mkdtemp
    monkeypatch.setattr(mux_module.tempfile, "mkdtemp",
                        lambda *a, **k: real_mkdtemp(prefix="mux-", dir=root))
    before = mux_module._SEM._value
    async def _body(byte: bytes, n: int):
        yield byte * n

    respx.get(MANIFEST_URL).mock(return_value=httpx.Response(200, text=OLD_MPD))
    # 60 bytes each: each under 100, combined 120 over 100. An async-generator body
    # carries NO Content-Length header, so the header pre-check cannot catch this -
    # only the shared per-chunk budget can.
    respx.get(f"https://v.redd.it/{VID}/DASH_720").mock(
        return_value=httpx.Response(200, content=_body(b"v", 60)))
    respx.get(f"https://v.redd.it/{VID}/audio").mock(
        return_value=httpx.Response(200, content=_body(b"a", 60)))
    try:
        res = client().get(f"/api/mux/{VID}/720.mp4")
        assert res.status_code == 413
        assert os.listdir(root) == []  # temp dir cleaned up after the 413
        assert mux_module._SEM._value == before  # permit released, no leak
    finally:
        shutil.rmtree(root, ignore_errors=True)


@respx.mock
def test_ffmpeg_nonzero_exit_returns_502_and_cleans_tempdir(monkeypatch):
    monkeypatch.setattr(mux_module.shutil, "which", lambda name: "/usr/bin/ffmpeg")
    monkeypatch.setattr(asyncio, "create_subprocess_exec", _fake_exec(1, False))
    # Point mux at an empty temp root so we can assert no mux dir is left behind.
    # Capture the real mkdtemp first: patching the module attribute would other-
    # wise make the replacement recurse into itself.
    real_mkdtemp = tempfile.mkdtemp
    root = real_mkdtemp(prefix="muxroot-")
    monkeypatch.setattr(mux_module.tempfile, "mkdtemp",
                        lambda *a, **k: real_mkdtemp(prefix="mux-", dir=root))
    respx.get(MANIFEST_URL).mock(return_value=httpx.Response(200, text=OLD_MPD))
    _mock_streams("DASH_720", "audio")
    try:
        res = client().get(f"/api/mux/{VID}/720.mp4")
        assert res.status_code == 502
        assert res.json()["error"] == "upstream_error"
        assert os.listdir(root) == []  # temp dir cleaned up after failure
    finally:
        shutil.rmtree(root, ignore_errors=True)


@respx.mock
def test_ffmpeg_missing_returns_502(monkeypatch):
    monkeypatch.setattr(mux_module.shutil, "which", lambda name: None)
    respx.get(MANIFEST_URL).mock(return_value=httpx.Response(200, text=OLD_MPD))
    res = client().get(f"/api/mux/{VID}/720.mp4")
    assert res.status_code == 502
    assert res.json()["error"] == "upstream_error"


@respx.mock
def test_semaphore_not_leaked_after_failure(monkeypatch):
    monkeypatch.setattr(mux_module.shutil, "which", lambda name: "/usr/bin/ffmpeg")
    monkeypatch.setattr(asyncio, "create_subprocess_exec", _fake_exec(1, False))
    before = mux_module._SEM._value
    respx.get(MANIFEST_URL).mock(return_value=httpx.Response(200, text=OLD_MPD))
    _mock_streams("DASH_720", "audio")
    res = client().get(f"/api/mux/{VID}/720.mp4")
    assert res.status_code == 502
    assert mux_module._SEM._value == before  # permit released, no leak


def test_health_reports_ffmpeg():
    res = client().get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert isinstance(body["ffmpeg"], bool)


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")
def test_real_ffmpeg_merges_two_streams(tmp_path):
    """Integration: real ffmpeg stream-copies a tiny video + audio into a playable mp4."""
    video = tmp_path / "v.mp4"
    audio = tmp_path / "a.m4a"
    out = tmp_path / "out.mp4"
    # Generate a 1s silent video track and a 1s tone audio track with ffmpeg itself.
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=black:s=64x64:d=1",
         "-c:v", "libx264", "-t", "1", str(video)],
        check=True, capture_output=True)
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
         "-c:a", "aac", "-t", "1", str(audio)],
        check=True, capture_output=True)
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(video), "-i", str(audio),
         "-c", "copy", "-movflags", "+faststart", str(out)],
        check=True, capture_output=True)
    assert out.exists() and out.stat().st_size > 0
    # ffprobe confirms the merged file carries both a video and an audio stream.
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "stream=codec_type",
         "-of", "csv=p=0", str(out)],
        check=True, capture_output=True, text=True)
    assert "video" in probe.stdout and "audio" in probe.stdout


def test_no_stray_tempdirs_after_suite():
    # Sanity: mux never leaves "mux-*" dirs in the system temp root.
    leftovers = glob.glob(os.path.join(tempfile.gettempdir(), "mux-*"))
    assert leftovers == []
