#!/usr/bin/env python3
"""
Crop the marketing hero art to the center SnapThread tile and emit toolbar icons.

Source: extension/assets/snapthread-brand-source.png (replace to update branding).
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "snapthread-brand-source.png"
OUT_DIR = ROOT / "icons"

# Fractional crop of the full hero (wide 16:9-style art) → dark tile only, no side blur
CROP_LEFT = 0.26
CROP_TOP = 0.10
CROP_RIGHT = 0.74
CROP_BOTTOM = 0.90


def center_square(im: Image.Image) -> Image.Image:
    w, h = im.size
    side = min(w, h)
    l = (w - side) // 2
    t = (h - side) // 2
    return im.crop((l, t, l + side, t + side))


def apply_rounded_mask(im: Image.Image, radius_ratio: float = 0.22) -> Image.Image:
    """Squircle mask like Chrome extension icons."""
    w, h = im.size
    r = max(int(min(w, h) * radius_ratio), 2)
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, w - 1, h - 1), radius=r, fill=255)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(im, (0, 0))
    out.putalpha(mask)
    return out


def main() -> None:
    if not SOURCE.is_file():
        raise SystemExit(f"Missing brand source: {SOURCE}")

    hero = Image.open(SOURCE).convert("RGBA")
    w, h = hero.size
    sub = hero.crop(
        (
            int(w * CROP_LEFT),
            int(h * CROP_TOP),
            int(w * CROP_RIGHT),
            int(h * CROP_BOTTOM),
        )
    )
    square = center_square(sub)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, dim in [("icon16", 16), ("icon32", 32), ("icon48", 48), ("icon128", 128)]:
        resized = square.resize((dim, dim), Image.Resampling.LANCZOS)
        out = apply_rounded_mask(resized)
        path = OUT_DIR / f"{name}.png"
        out.save(path, "PNG")
        print("Wrote", path)


if __name__ == "__main__":
    main()
