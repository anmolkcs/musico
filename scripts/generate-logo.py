#!/usr/bin/env python3
"""Generate the musico brand assets (app icon, splash, adaptive icon, favicon).

The mark is "the musico record" — a terracotta vinyl disc with groove rings
and an ivory label carrying an italic serif "m", matching the app's
Warm Editorial Minimalism x Tactile Analog design system (lib/theme.ts).

Requires Pillow. Run from the repo root: python3 scripts/generate-logo.py
"""

import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "images")
NEWSREADER_DIR = os.path.join(ROOT, "node_modules", "@expo-google-fonts", "newsreader")
FONT_SEMIBOLD_ITALIC = os.path.join(NEWSREADER_DIR, "600SemiBold_Italic", "Newsreader_600SemiBold_Italic.ttf")
FONT_MEDIUM_ITALIC = os.path.join(NEWSREADER_DIR, "500Medium_Italic", "Newsreader_500Medium_Italic.ttf")

# Palette (mirrors lib/theme.ts)
TERRACOTTA = (217, 119, 54)  # accent
EMBER = (194, 99, 43)  # copper
TERRACOTTA_LIT = (224, 138, 70)  # warm highlight
IVORY = (247, 244, 238)  # text
CHARCOAL = (20, 19, 18)  # background
INK = (32, 28, 24)  # light-mode text
GROOVE = (70, 30, 8)  # groove shadow on the disc

SS = 4  # supersampling factor for anti-aliased output


def mix(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def radial_gradient(size, inner, outer, inner_radius=0.0):
    """Square RGBA image with a radial gradient clipped to the outer circle."""
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    cx = size / 2
    steps = max(2, int(size * 0.75))
    for i in range(steps, 0, -1):
        t = i / steps
        r = int(round(cx * (inner_radius + t * (1.0 - inner_radius))))
        color = mix(inner, outer, t)
        ImageDraw.Draw(im).ellipse([cx - r, cx - r, cx + r, cx + r], fill=color + (255,))
    return im


def solid(size, color):
    return Image.new("RGBA", (size, size), color + (255,))


def ring(draw, cx, cy, radius, width, fill):
    draw.ellipse(
        [cx - radius, cy - radius, cx + radius, cy + radius],
        outline=fill,
        width=int(width),
    )


def draw_record(cx, cy, disc_r, label_letter=True):
    """Draw the record mark centered at (cx, cy) with the given disc radius.

    Returns the finished RGBA layer at supersampled resolution.
    """
    layer = Image.new("RGBA", (cx * 2, cy * 2), (0, 0, 0, 0))

    # Disc — warm radial terracotta (lit label side fading to ember at the rim)
    disc = radial_gradient(int(disc_r * 2), TERRACOTTA_LIT, EMBER, inner_radius=0.30)
    layer.alpha_composite(disc, (int(cx - disc_r), int(cy - disc_r)))

    ov = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)

    # Rim — slightly darker edge to seat the disc
    ring(d, cx, cy, disc_r * 0.965, disc_r * 0.028, GROOVE + (110,))

    # Grooves — fine alternating lines, tighter toward the label (pressed vinyl)
    for i, frac in enumerate((0.895, 0.855, 0.813, 0.769, 0.723, 0.675, 0.625, 0.572, 0.545)):
        alpha = 62 if i % 2 == 0 else 34
        ring(d, cx, cy, disc_r * frac, disc_r * 0.011, GROOVE + (alpha,))

    if label_letter:
        label_r = disc_r * 0.352
        d.ellipse([cx - label_r, cy - label_r, cx + label_r, cy + label_r], fill=IVORY + (255,))
        ring(d, cx, cy, label_r * 0.94, disc_r * 0.012, EMBER + (70,))

    layer.alpha_composite(ov)
    d = ImageDraw.Draw(layer)

    if label_letter:
        font = ImageFont.truetype(FONT_SEMIBOLD_ITALIC, int(disc_r * 0.385))
        d.text((cx, cy * 1.006), "m", font=font, fill=EMBER + (255,), anchor="mm")

    return layer


def downsave(img, name, size=None):
    if size and img.size != (size, size):
        img = img.resize((size, size), Image.LANCZOS)
    path = os.path.join(OUT, name)
    img.save(path, optimize=True)
    print(f"{name:38s} {img.size[0]}x{img.size[1]}  {os.path.getsize(path):>7,d} B")


def wordmark_layer(width, font_px, color, with_vinyl_o=True):
    """Render 'musico' (final o as a vinyl ring) on a tight transparent canvas.

    Returns (image, baseline_y) at supersampled resolution.
    """
    font = ImageFont.truetype(FONT_MEDIUM_ITALIC, font_px)
    ascent, descent = font.getmetrics()

    probe = Image.new("RGBA", (8, 8))
    pd = ImageDraw.Draw(probe)
    text_w = int(pd.textlength("music", font=font))
    if with_vinyl_o:
        o_d = int(font_px * 0.545)  # outer diameter of the drawn o
        o_stroke = max(int(font_px * 0.155), SS * 2)
        total = text_w + o_d
    else:
        total = int(pd.textlength("musico", font=font))

    h = ascent + descent
    im = Image.new("RGBA", (total + font_px // 2, h + font_px // 3), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.text((0, 0), "music" if with_vinyl_o else "musico", font=font, fill=color + (255,))

    if with_vinyl_o:
        # Center the ring on the x-height middle; round glyphs overshoot the
        # baseline slightly, so the center sits a touch below baseline-middle.
        ox = text_w + o_d / 2 - font_px * 0.026
        oy = ascent - o_d / 2 + font_px * 0.012
        d.ellipse(
            [ox - o_d / 2, oy - o_d / 2, ox + o_d / 2, oy + o_d / 2],
            outline=color + (255,),
            width=o_stroke,
        )
    return im, ascent


def make_splash(dark=True):
    W, H = 1200 * SS, 1536 * SS
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    disc_r = 350 * SS
    record = draw_record(disc_r, disc_r, disc_r)
    im.alpha_composite(record, (W // 2 - disc_r, int(560 * SS) - disc_r))

    wm, _ = wordmark_layer(W, int(196 * SS), IVORY if dark else INK)
    im.alpha_composite(wm, (W // 2 - wm.width // 2, int(1046 * SS)))

    return im.resize((1200, 1536), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)

    # ---- App icon (iOS / universal): charcoal square + record ----
    S = 1024 * SS
    icon = solid(S, CHARCOAL)
    record = draw_record(S // 2, S // 2, int(340 * SS))
    icon.alpha_composite(record)
    downsave(icon.convert("RGB"), "icon.png", 1024)

    # ---- Splash (mark + wordmark), light and dark variants ----
    downsave(make_splash(dark=True), "splash-icon-dark.png")
    downsave(make_splash(dark=False), "splash-icon-light.png")

    # ---- Android adaptive icon layers (1024, safe zone <= 66%) ----
    fg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    fg.alpha_composite(draw_record(S // 2, S // 2, int(312 * SS)))
    downsave(fg, "android-icon-foreground.png", 1024)

    bg = solid(S, CHARCOAL)
    downsave(bg, "android-icon-background.png", 1024)

    # Monochrome (Material You themed icons): white record silhouette
    mono = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(mono)
    cx = cy = S // 2
    R = int(340 * SS)
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(255, 255, 255, 255))
    for frac in (0.875, 0.79, 0.705, 0.62):
        ring(d, cx, cy, R * frac, R * 0.020, (255, 255, 255, 0))
    d.ellipse([cx - R * 0.34, cy - R * 0.34, cx + R * 0.34, cy + R * 0.34], fill=(255, 255, 255, 0))
    d.ellipse([cx - R * 0.185, cy - R * 0.185, cx + R * 0.185, cy + R * 0.185], fill=(255, 255, 255, 255))
    downsave(mono, "android-icon-monochrome.png", 1024)

    # ---- Favicon: simplified mini record ----
    fav = solid(192 * SS, CHARCOAL)
    d = ImageDraw.Draw(fav)
    cx = cy = 96 * SS
    R = 118 * SS
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=TERRACOTTA + (255,))
    ring(d, cx, cy, R * 0.70, R * 0.075, GROOVE + (80,))
    d.ellipse([cx - R * 0.37, cy - R * 0.37, cx + R * 0.37, cy + R * 0.37], fill=IVORY + (255,))
    downsave(fav, "favicon.png", 48)

    # ---- Standalone mark on transparent (in-app / docs use) ----
    mark = draw_record(340 * SS, 340 * SS, 340 * SS)
    downsave(mark, "logo-mark.png", 680)

    print("done")


if __name__ == "__main__":
    main()
