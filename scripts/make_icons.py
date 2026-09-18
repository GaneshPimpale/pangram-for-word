"""Generates ribbon/store icons from Pangram's touch icon (assets/pangram-touch.png),
with the off-white background made transparent."""
from pathlib import Path
from PIL import Image

ASSETS = Path(__file__).resolve().parent.parent / "assets"
src = Image.open(ASSETS / "pangram-touch.png").convert("RGBA")
bg = src.getpixel((2, 2))[:3]
px = src.load()
w, h = src.size
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        d = max(abs(r - bg[0]), abs(g - bg[1]), abs(b - bg[2]))
        if d < 12:
            px[x, y] = (r, g, b, 0)
for size in (16, 32, 64, 80, 128):
    src.resize((size, size), Image.LANCZOS).save(ASSETS / f"pangram-{size}.png")
    print("wrote", f"pangram-{size}.png")
