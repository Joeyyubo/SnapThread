#!/usr/bin/env python3
"""Generate SnapThread extension PNG icons (community-friendly chat + thread)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "icons"

# Warm diagonal gradient: soft violet → rose (open-source / community energy)
C_TL = (196, 181, 253)  # violet-200
C_BR = (244, 171, 199)  # pink-300
C_ACCENT = (251, 207, 232)  # pink-200 highlight in corner

WHITE = (255, 255, 255, 255)
DOT_FILL = (139, 92, 246)  # violet-500 — readable on white bubble


def diagonal_gradient_rounded_bg(size: int, radius: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()
    denom = max(2 * (size - 1), 1)
    for y in range(size):
        for x in range(size):
            t = (x + y) / denom
            r = int(C_TL[0] + (C_BR[0] - C_TL[0]) * t)
            g = int(C_TL[1] + (C_BR[1] - C_TL[1]) * t)
            b = int(C_TL[2] + (C_BR[2] - C_TL[2]) * t)
            # Slight warmth bottom-right
            k = (x / max(size - 1, 1)) * (y / max(size - 1, 1))
            r = min(255, r + int((C_ACCENT[0] - r) * 0.15 * k))
            g = min(255, g + int((C_ACCENT[1] - g) * 0.15 * k))
            b = min(255, b + int((C_ACCENT[2] - b) * 0.15 * k))
            px[x, y] = (r, g, b, 255)
    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def draw_symbol(draw: ImageDraw.ImageDraw, size: int) -> None:
    s = size / 128.0

    # Main "message bubble" (pill) — conversation / feedback
    pad_x = max(int(20 * s), 2)
    pad_y = max(int(36 * s), 2)
    bx2 = size - pad_x
    by2 = size - pad_y
    bw = bx2 - pad_x
    bh = max(int(44 * s), 6)
    bx1 = pad_x
    by1 = (size - bh) // 2
    rr = min(bh // 2, max(int(18 * s), 2))

    if size >= 20:
        draw.rounded_rectangle(
            (bx1, by1, bx1 + bw, by1 + bh),
            radius=rr,
            fill=WHITE,
        )
    else:
        # 16px: compact white capsule
        draw.rounded_rectangle(
            (2, 5, size - 2, size - 5),
            radius=4,
            fill=WHITE,
        )
        bx1, by1 = 2, 5
        bw, bh = size - 4, size - 10

    # Small tail hint (community chat) — only when enough pixels
    if size >= 48:
        tail_w = max(int(10 * s), 3)
        tail_h = max(int(8 * s), 3)
        tx = bx1 + max(int(14 * s), 4)
        ty = by1 + bh - max(int(4 * s), 1)
        draw.polygon(
            [
                (tx, ty),
                (tx + tail_w, ty),
                (tx + tail_w // 2, ty + tail_h),
            ],
            fill=WHITE,
        )

    # Three dots = thread / ongoing discussion
    cx_mid = bx1 + bw // 2
    cy_dots = by1 + bh // 2
    spacing = max(int(10 * s), 2)
    dot_r = max(int(4.5 * s), 1)
    if size <= 16:
        dot_r = 1
        spacing = 3
        cx_mid = size // 2
        cy_dots = size // 2

    for off in (-1, 0, 1):
        cx = cx_mid + off * spacing
        draw.ellipse(
            (cx - dot_r, cy_dots - dot_r, cx + dot_r, cy_dots + dot_r),
            fill=DOT_FILL,
        )


def render_icon(size: int) -> Image.Image:
    radius = max(int(size * 0.24), 2)
    img = diagonal_gradient_rounded_bg(size, radius)
    draw = ImageDraw.Draw(img)
    draw_symbol(draw, size)
    return img


def render_icon_smooth(size: int) -> Image.Image:
    """Render at 4× then downscale for anti-aliased edges (Chrome toolbar sizes)."""
    if size >= 128:
        return render_icon(size)
    scale = 4
    big = render_icon(size * scale)
    return big.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, dim in [("icon16", 16), ("icon32", 32), ("icon48", 48), ("icon128", 128)]:
        im = render_icon_smooth(dim)
        path = OUT / f"{name}.png"
        im.save(path, "PNG")
        print("Wrote", path)


if __name__ == "__main__":
    main()
