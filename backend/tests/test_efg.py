import base64
import json

from app.efg import duration_from_efg

EFG = base64.b64encode(json.dumps({"duration_s": 37}).encode()).decode()


def test_reads_duration():
    assert duration_from_efg(f"https://x.example/v.mp4?efg={EFG}") == 37.0


def test_missing_param_and_garbage_are_none():
    assert duration_from_efg("https://x.example/v.mp4") is None
    assert duration_from_efg("https://x.example/v.mp4?efg=%%%bad") is None
    assert duration_from_efg("https://x.example/v.mp4?efg=" + base64.b64encode(b'{"other":1}').decode()) is None
