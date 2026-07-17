"""One-off generator for frontend/public/og.png (1200x630). Rerun after brand changes.

Usage: pip install pillow && python scripts/make_og.py
"""
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


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in CANDIDATE_FONTS:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)
d.rectangle([0, H - 14, W, H], fill=ACCENT)
d.text((80, 180), "SaveVid AI", font=load_font(96), fill=FG)
d.text((80, 320), "Twitter Video Downloader", font=load_font(48), fill=ACCENT)
d.text((80, 400), "Free. No popups. No fake buttons. Open source.", font=load_font(34), fill=MUTED)
d.text((80, 520), "savevidai.israfill.dev", font=load_font(30), fill=MUTED)

out = Path(__file__).resolve().parent.parent / "frontend" / "public" / "og.png"
img.save(out)
print(f"wrote {out}")
