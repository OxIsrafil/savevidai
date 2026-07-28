import pytest

from app.urls import InvalidTweetURL, parse_instagram_url

CODE = "DbKoX9xTgPz"


@pytest.mark.parametrize("url", [
    f"https://www.instagram.com/reel/{CODE}",
    f"https://www.instagram.com/reel/{CODE}/",
    f"https://instagram.com/reels/{CODE}",
    f"https://m.instagram.com/p/{CODE}",
    f"https://www.instagram.com/tv/{CODE}",
    f"https://www.instagram.com/nasa/reel/{CODE}/",
    f"https://www.instagram.com/some.user_1/p/{CODE}",
    f"https://instagr.am/p/{CODE}",
    f"www.instagram.com/reel/{CODE}",
    f"https://www.instagram.com/reel/{CODE}?igsh=abc123",
])
def test_accepts_and_extracts_shortcode(url):
    assert parse_instagram_url(url) == CODE


@pytest.mark.parametrize("url", [
    "",
    "https://example.com/reel/DbKoX9xTgPz",
    "https://kkinstagram.com/reel/DbKoX9xTgPz",
    "https://www.instagram.com/nasa",
    "https://www.instagram.com/stories/nasa/123456/",
    "https://www.instagram.com/reel/ab",
    "https://www.instagram.com/reel/has%20space",
    "ftp://www.instagram.com/reel/DbKoX9xTgPz",
    "https://www.instagram.com.evil.com/reel/DbKoX9xTgPz",
])
def test_rejects(url):
    with pytest.raises(InvalidTweetURL):
        parse_instagram_url(url)
