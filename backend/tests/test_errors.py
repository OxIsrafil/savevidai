from app.errors import NO_VIDEO, app_error


def test_app_error_builder():
    err = app_error(NO_VIDEO)
    assert err.code == "no_video"
    assert err.status == 422
    assert "quoted post" in err.message
