"""Generator for the OG images in frontend/public/. Rerun after brand changes.

Usage:
    pip install pillow
    python scripts/make_og.py                 # default (Twitter) -> og.png
    python scripts/make_og.py --variant tiktok # TikTok         -> og-tiktok.png
    python scripts/make_og.py --variant reddit # Reddit         -> og-reddit.png
    python scripts/make_og.py --variant instagram # Instagram   -> og-instagram.png
"""
import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
BG = (9, 9, 11)
ACCENT = (34, 211, 238)
FG = (237, 237, 240)
MUTED = (154, 154, 165)

CANDIDATE_FONTS = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",  # macOS
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",  # Debian/Ubuntu
]

VARIANTS = {
    "default": {
        "filename": "og.png",
        "title": "Twitter Video Downloader",
        "subtitle": "Free. No fake buttons. One real click.",
    },
    "tiktok": {
        "filename": "og-tiktok.png",
        "title": "TikTok Video Downloader",
        "subtitle": "No watermark. Free.",
    },
    "reddit": {
        "filename": "og-reddit.png",
        "title": "Reddit Video Downloader",
        "subtitle": "With audio. Free.",
    },
    "instagram": {
        "filename": "og-instagram.png",
        "title": "Instagram Reel Downloader",
        "subtitle": "Free. No fake buttons. One real click.",
    },
}


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in CANDIDATE_FONTS:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def render(variant: str) -> Path:
    cfg = VARIANTS[variant]
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, H - 14, W, H], fill=ACCENT)
    d.text((80, 180), "SaveVid AI", font=load_font(96), fill=FG)
    d.text((80, 320), cfg["title"], font=load_font(48), fill=ACCENT)
    d.text((80, 400), cfg["subtitle"], font=load_font(34), fill=MUTED)
    d.text((80, 520), "savevidai.israfill.dev", font=load_font(30), fill=MUTED)

    out = Path(__file__).resolve().parent.parent / "frontend" / "public" / cfg["filename"]
    img.save(out)
    print(f"wrote {out}")
    return out


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate SaveVid AI OG images.")
    parser.add_argument(
        "--variant",
        choices=sorted(VARIANTS),
        default="default",
        help="Which OG image to render (default: %(default)s).",
    )
    args = parser.parse_args()
    render(args.variant)
