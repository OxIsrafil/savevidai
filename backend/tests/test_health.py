from fastapi.testclient import TestClient

from app.main import create_app


def test_health():
    client = TestClient(create_app())
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert isinstance(body["ffmpeg"], bool)


def test_app_error_shape():
    from app.errors import AppError

    app = create_app()

    @app.get("/api/boom")
    def boom():
        raise AppError("upstream_error", "nope", 502)

    client = TestClient(app, raise_server_exceptions=False)
    res = client.get("/api/boom")
    assert res.status_code == 502
    assert res.json() == {"error": "upstream_error", "message": "nope"}
