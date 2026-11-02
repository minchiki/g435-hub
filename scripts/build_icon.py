"""Build hub/icons/icon.ico (+ icon.png) from the logo geometry.

Each ICO frame is drawn at its own size: 16-24 px use the 16-grid favicon
geometry, larger frames use the 32-grid mark. Geometry mirrors
hub/ui/brand/favicon.svg and logo-mark.svg. Requires Pillow.

    python scripts/build_icon.py
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
TILE = (0x11, 0x13, 0x16, 255)
MARK = (0x38, 0xBD, 0xF8, 255)
SS = 8  # supersampling factor

# grid, arc centre, radius, stroke, arcs (deg, clockwise from 3 o'clock), cups (x, y, w, h, rx)
SMALL = dict(grid=16, c=(8, 9), r=5, w=2, arcs=[(180, 300), (326, 360)],
             cups=[(1, 8, 4, 7, 1), (11, 8, 4, 7, 1)])
LARGE = dict(grid=32, c=(16, 17), r=9.5, w=3, arcs=[(180, 304), (320, 360)],
             cups=[(3, 16, 7, 12, 2), (22, 16, 7, 12, 2)])


def frame(size: int) -> Image.Image:
    g = SMALL if size <= 24 else LARGE
    # mark fills the tile at small sizes, gets breathing room at large ones
    fill = 0.875 if size <= 24 else 0.80 if size <= 64 else 0.70
    big = size * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    radius = 0.18 if size <= 24 else 0.22
    d.rounded_rectangle((0, 0, big - 1, big - 1), radius=round(big * radius), fill=TILE)

    k = big * fill / g["grid"]
    off = (big - g["grid"] * k) / 2
    # centre the mark's content vertically (arc top .. cup bottom)
    top = g["c"][1] - g["r"] - g["w"] / 2
    bottom = g["cups"][0][1] + g["cups"][0][3]
    dy = (g["grid"] - (top + bottom)) / 2 * k

    def p(x, y):
        return off + x * k, off + y * k + dy

    cx, cy = p(*g["c"])
    ro = (g["r"] + g["w"] / 2) * k
    for a0, a1 in g["arcs"]:
        d.arc((cx - ro, cy - ro, cx + ro, cy + ro), a0, a1, fill=MARK, width=round(g["w"] * k))
    for x, y, w, h, rx in g["cups"]:
        x0, y0 = p(x, y)
        d.rounded_rectangle((x0, y0, x0 + w * k, y0 + h * k), radius=rx * k, fill=MARK)
    return img.resize((size, size), Image.LANCZOS)


def main():
    sizes = [16, 20, 24, 32, 40, 48, 64, 256]
    frames = [frame(s) for s in sizes]
    out = ROOT / "hub" / "icons"
    frames[-1].save(out / "icon.png")
    frames[-1].save(out / "icon.ico", sizes=[(s, s) for s in sizes], append_images=frames[:-1])
    if len(sys.argv) > 1:  # optional preview sheet: all frames 1:1 on light and dark
        sheet = Image.new("RGBA", (sum(sizes) + 8 * len(sizes), 2 * 264), (243, 243, 243, 255))
        sheet.paste((32, 32, 32, 255), (0, 264, sheet.width, sheet.height))
        x = 0
        for f in frames:
            sheet.paste(f, (x, 4), f)
            sheet.paste(f, (x, 268), f)
            x += f.width + 8
        sheet.save(sys.argv[1])


if __name__ == "__main__":
    main()
