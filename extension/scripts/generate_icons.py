#!/usr/bin/env python3
"""Generate SnapThread extension PNG icons (minimal viewfinder + thread)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "icons"

# Brand blues (lighter top → deeper bottom)
BG_TOP = (96, 165, 250)
BG_MID = (37, 99, 235)
BG_BOT = (30, 64, 175)
WHITE = (255, 255, 255, 255)


def gradient_rounded_bg(size: int, radius: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()
    for y in range(size):
        t = y / max(size - 1, 1)
        if t < 0.5:
            u = t * 2
            r = int(BG_TOP[0] + (BG_MID[0] - BG_TOP[0]) * u)
            g = int(BG_TOP[1] + (BG_MID[1] - BG_TOP[1]) * u)
            b = int(BG_TOP[2] + (BG_MID[2] - BG_TOP[2]) * u)
        else:
            u = (t - 0.5) * 2
            r = int(BG_MID[0] + (BG_BOT[0] - BG_MID[0]) * u)
            g = int(BG_MID[1] + (BG_BOT[1] - BG_MID[1]) * u)
            b = int(BG_MID[2] + (BG_BOT[2] - BG_MID[2]) * u)
        for x in range(size):
            px[x, y] = (r, g, b, 255)
    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def draw_symbol(draw: ImageDraw.ImageDraw, size: int) -> None:
    s = size / 128.0
    margin = max(int(20 * s), 2)
    lw = max(int(round(3.2 * s)), 1)
    if size <= 16:
        lw = 1
    inner = size - 2 * margin
    # Rounded viewfinder (stroke)
    rr = max(int(8 * s), 1)
    x1, y1 = margin, margin
    x2, y2 = margin + inner, margin + int(inner * 0.78)
    if size >= 24:
        draw.rounded_rectangle(
            (x1, y1, x2, y2), radius=rr, outline=WHITE, width=lw
        )
    else:
        draw.rectangle((x1, y1, x2, y2), outline=WHITE, width=lw)

    # Thread: three dots + curve to the last (right side)
    dot_r = max(int(3.2 * s), 1)
    if size <= 16:
        dot_r = 1
    cx = x2 + max(int(5 * s), 1)
    if cx + dot_r >= size - 1:
        cx = x2 - max(int(4 * s), 1)
    ys = [y1 + int((y2 - y1) * 0.25), (y1 + y2) // 2, y1 + int((y2 - y1) * 0.75)]
    for cy in ys:
        draw.ellipse(
            (cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r), fill=WHITE
        )


def render_icon(size: int) -> Image.Image:
    # Soft squircle
    radius = max(int(size * 0.26), 2)
    img = gradient_rounded_bg(size, radius)
    draw = ImageDraw.Draw(img)
    draw_symbol(draw, size)
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, dim in [("icon16", 16), ("icon32", 32), ("icon48", 48), ("icon128", 128)]:
        im = render_icon(dim)
        path = OUT / f"{name}.png"
        im.save(path, "PNG")
        print("Wrote", path)


if __name__ == "__main__":
    main()
