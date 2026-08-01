"""Ping IndexNow with every URL in the live sitemap.

IndexNow tells Bing (and Yandex, Seznam, Naver) about changed URLs instantly
instead of waiting for a crawl. Google does not use it. The key is public by
design: search engines verify ownership by fetching KEY_LOCATION and checking
it contains the key, so committing it here is correct, not a leak.

Usage (any machine with the repo, after a deploy that changed page content):
    python scripts/indexnow.py
"""
import json
import re
import sys
import urllib.request

HOST = "savevidai.israfill.dev"
KEY = "432d09c6e74d487d915a9603a2d56d0f"
KEY_LOCATION = f"https://{HOST}/{KEY}.txt"
SITEMAP = f"https://{HOST}/sitemap.xml"
ENDPOINT = "https://api.indexnow.org/indexnow"


def main() -> int:
    with urllib.request.urlopen(SITEMAP, timeout=15) as r:
        urls = re.findall(r"<loc>(.*?)</loc>", r.read().decode())
    if not urls:
        print("no urls found in sitemap", file=sys.stderr)
        return 1
    body = json.dumps({
        "host": HOST,
        "key": KEY,
        "keyLocation": KEY_LOCATION,
        "urlList": urls,
    }).encode()
    req = urllib.request.Request(
        ENDPOINT, data=body, headers={"Content-Type": "application/json; charset=utf-8"}
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        print(f"submitted {len(urls)} urls, response {r.status}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
